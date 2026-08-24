import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentInitiation,
  PaymentInitiationResult,
  PaymentProvider,
  WebhookVerification,
} from './payment-provider.interface';

// Provider Orange Money Web Payment (Sprint 5 -> production).
//
// Integration Orange Money WebPay (API DEV/Sandbox + production).
// Flux :
//   1. OAuth 2.0 client_credentials -> access_token (cache 55 min, validite 1h).
//   2. POST /webpayment -> { pay_token, payment_url, notif_token }.
//   3. Client ouvre payment_url en webview.
//   4. Orange POST notif_url { status, notif_token, txnid } -> verifyWebhook.
//   5. (Secours) POST /transactionstatus si webhook non recu.
//
// Credentials requis (env) :
//   OM_CLIENT_ID, OM_CLIENT_SECRET, OM_MERCHANT_KEY,
//   OM_RETURN_URL, OM_CANCEL_URL, OM_NOTIF_URL,
//   OM_API_BASE (sandbox: https://api.orange.com/orange-money-webpay/dev/v1),
//   OM_CURRENCY (sandbox: OUV, production: XOF).
@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  private readonly logger = new Logger(OrangeMoneyProvider.name);

  // Cache du token OAuth : { token, expiresAt }
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('OM_CLIENT_ID') &&
        this.config.get<string>('OM_CLIENT_SECRET') &&
        this.config.get<string>('OM_MERCHANT_KEY'),
    );
  }

  private get apiBase(): string {
    return (
      this.config.get<string>('OM_API_BASE') ??
      'https://api.orange.com/orange-money-webpay/dev/v1'
    );
  }

  private get currency(): string {
    return this.config.get<string>('OM_CURRENCY') ?? 'OUV';
  }

  private get merchantKey(): string {
    const key = this.config.get<string>('OM_MERCHANT_KEY');
    if (!key) {
      throw new ServiceUnavailableException('OM_MERCHANT_KEY non configure');
    }
    return key;
  }

  // ─────────────────────────────────────────────
  //  OAuth — access_token avec cache (validite 1h, refresh a 55 min)
  // ─────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    // Verifier le cache
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    const clientId = this.config.get<string>('OM_CLIENT_ID');
    const clientSecret = this.config.get<string>('OM_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Credentials Orange Money manquants (OM_CLIENT_ID/OM_CLIENT_SECRET)',
      );
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    this.logger.log('[OrangeMoney] Demande access_token OAuth...');

    const response = await fetch('https://api.orange.com/oauth/v3/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    const data = (await response.json().catch(() => ({}))) as any;

    if (!response.ok || !data?.access_token) {
      this.logger.error(
        `[OrangeMoney] OAuth echec: ${response.status} ${JSON.stringify(data)}`,
      );
      throw new ServiceUnavailableException(
        `Authentification Orange Money impossible: ${data?.message ?? response.status}`,
      );
    }

    const token = data.access_token as string;
    // Le token est valide 1 heure (3600s). On cache pour 55 min (3300s) par securite.
    const expiresIn = data.expires_in ? Number(data.expires_in) : 3600;
    const cacheMs = Math.min(expiresIn - 300, 3300) * 1000; // 5 min de marge, max 55 min
    this.cachedToken = {
      token,
      expiresAt: Date.now() + cacheMs,
    };

    this.logger.log(
      `[OrangeMoney] access_token obtenu (expire dans ${Math.round(cacheMs / 1000)}s)`,
    );
    return token;
  }

  // ─────────────────────────────────────────────
  //  Web Payment API — initiation
  // ─────────────────────────────────────────────

  async initiate(input: PaymentInitiation): Promise<PaymentInitiationResult> {
    if (!this.isConfigured) {
      this.logger.error('Orange Money non configure (credentials manquants)');
      throw new ServiceUnavailableException(
        'Paiement Orange Money indisponible : integration non configuree',
      );
    }

    const token = await this.getAccessToken();
    const merchantKey = this.merchantKey;

    // order_id : max 30 chars, unique. On utilise internalRef (UUID CommissionPayment)
    // tronque a 24 chars + prefixe "TL" pour rester sous 30.
    const orderId = `TL${input.internalRef.replace(/-/g, '').substring(0, 28)}`;

    // URLs de retour/notif : configurables via env, avec fallback sur APP_URL.
    const appUrl = this.config.get<string>('APP_URL')?.replace(/\/$/, '') ?? '';
    const returnUrl =
      this.config.get<string>('OM_RETURN_URL') ??
      `${appUrl}/payment/success`;
    const cancelUrl =
      this.config.get<string>('OM_CANCEL_URL') ??
      `${appUrl}/payment/cancel`;
    const notifUrl =
      this.config.get<string>('OM_NOTIF_URL') ??
      `${appUrl}/v1/payments/webhook`;

    // Orange attend amount en entier (FCFA n'a pas de centimes).
    const amountInt = Math.floor(input.amount);

    const requestBody = {
      merchant_key: merchantKey,
      currency: this.currency,
      order_id: orderId,
      amount: amountInt,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notif_url: notifUrl,
      lang: 'fr',
      reference: 'TELIMA',
    };

    this.logger.log(
      `[OrangeMoney] WebPay request: order=${orderId} amount=${amountInt} currency=${this.currency}`,
    );

    const response = await fetch(`${this.apiBase}/webpayment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const raw = (await response.json().catch(() => ({}))) as any;

    this.logger.log(
      `[OrangeMoney] WebPay response: ${response.status} ${JSON.stringify(raw).slice(0, 500)}`,
    );

    if (!response.ok) {
      throw new BadRequestException(
        `Orange WebPay a refuse: ${raw?.message ?? raw?.error_description ?? JSON.stringify(raw)}`,
      );
    }

    const payToken = raw.pay_token ?? raw.payToken ?? raw.token;
    const paymentUrl = raw.payment_url ?? raw.paymentURL ?? raw.paymentUrl;
    const notifToken = raw.notif_token ?? raw.notifToken;

    if (!payToken || !paymentUrl) {
      throw new BadRequestException(
        `Reponse Orange incomplete (pay_token/payment_url manquants): ${JSON.stringify(raw)}`,
      );
    }

    this.logger.log(
      `[OrangeMoney] Paiement initie: order=${orderId} pay_token=${payToken.substring(0, 12)}...`,
    );

    return {
      transactionRef: payToken,
      status: 'pending',
      paymentUrl,
      notifToken: notifToken ?? undefined,
      orderId,
    };
  }

  // ─────────────────────────────────────────────
  //  Webhook — verification notif_token + extraction statut
  // ─────────────────────────────────────────────

  verifyWebhook(
    payload: Record<string, unknown>,
    _signature?: string,
  ): WebhookVerification {
    const status = payload.status as string | undefined;
    const notifToken = payload.notif_token as string | undefined;
    const txnid = payload.txnid as string | undefined;

    // Orange Money WebPay n'envoie pas d'order_id dans le webhook standard.
    // La reconciliation se fait via notif_token (compare avec celui stocke a l'initiation).
    // Le service (PaymentsService) se charge de retrouver la transaction par notifToken.
    if (!status || !notifToken) {
      this.logger.warn(
        `[OrangeMoney] Webhook rejete: status ou notif_token manquant`,
      );
      return { valid: false };
    }

    const mappedStatus = this.mapOrangeStatus(status);

    // Le webhook Orange n'est envoye que pour SUCCESS ou FAILED (selon le guide).
    // INITIATED/PENDING ne sont pas des notifications de fin -> on ignore.
    if (mappedStatus === 'pending') {
      this.logger.warn(
        `[OrangeMoney] Webhook ignore: statut non terminal (${status})`,
      );
      return { valid: false };
    }

    this.logger.log(
      `[OrangeMoney] Webhook recu: status=${status} -> ${mappedStatus} txnid=${txnid ?? 'N/A'}`,
    );

    return {
      valid: true,
      notifToken,
      txnid,
      status: mappedStatus,
    };
  }

  // ─────────────────────────────────────────────
  //  Transaction Status API — secours si webhook non recu
  // ─────────────────────────────────────────────

  async checkTransactionStatus(
    transactionRef: string,
    orderId: string,
    amount: number,
  ): Promise<{ status: 'succeeded' | 'failed' | 'expired' | 'pending'; txnid?: string }> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.apiBase}/transactionstatus`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        order_id: orderId,
        amount: Math.floor(amount),
        pay_token: transactionRef,
      }),
    });

    const raw = (await response.json().catch(() => ({}))) as any;

    this.logger.log(
      `[OrangeMoney] Status API response: ${response.status} ${JSON.stringify(raw)}`,
    );

    if (!response.ok) {
      throw new BadRequestException(
        `Transaction Status API echec: ${raw?.message ?? JSON.stringify(raw)}`,
      );
    }

    const orangeStatus = raw.status as string;
    const mapped = this.mapOrangeStatus(orangeStatus);

    // INITIATED/PENDING -> pending, SUCCESS -> succeeded, FAILED -> failed, EXPIRED -> expired
    return {
      status: mapped === 'expired' ? 'expired' : mapped === 'succeeded' ? 'succeeded' : mapped === 'failed' ? 'failed' : 'pending',
      txnid: raw.txnid,
    };
  }

  // ─────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────

  private mapOrangeStatus(
    orangeStatus: string,
  ): 'succeeded' | 'failed' | 'expired' | 'pending' {
    switch (orangeStatus?.toUpperCase()) {
      case 'SUCCESS':
        return 'succeeded';
      case 'FAILED':
        return 'failed';
      case 'EXPIRED':
        return 'expired';
      case 'INITIATED':
      case 'PENDING':
      default:
        return 'pending';
    }
  }
}
