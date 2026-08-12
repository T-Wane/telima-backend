import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentInitiation,
  PaymentInitiationResult,
  PaymentProvider,
  WebhookVerification,
} from './payment-provider.interface';

// Provider Orange Money (Sprint 5). Necessite les credentials API :
//   ORANGE_MONEY_CLIENT_ID, ORANGE_MONEY_CLIENT_SECRET, ORANGE_MONEY_MERCHANT_KEY,
//   ORANGE_MONEY_WEBHOOK_SECRET.
// Sans ces variables, le provider leve ServiceUnavailableException a l'initiation
// pour signaler clairement que l'integration n'est pas configuree.
@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  private readonly logger = new Logger(OrangeMoneyProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('ORANGE_MONEY_CLIENT_ID') &&
      this.config.get<string>('ORANGE_MONEY_CLIENT_SECRET') &&
      this.config.get<string>('ORANGE_MONEY_MERCHANT_KEY'),
    );
  }

  initiate(input: PaymentInitiation): Promise<PaymentInitiationResult> {
    if (!this.isConfigured) {
      this.logger.error('Orange Money non configure (credentials manquants)');
      throw new ServiceUnavailableException(
        'Paiement Orange Money indisponible : integration non configuree',
      );
    }
    // TODO(production) : appeler l'API Orange Money (POST /oauth/token puis
    // POST /webpayment) et retourner le pay_token + statut pending.
    // La confirmation finale arrive via POST /payments/webhook.
    this.logger.warn('Integration Orange Money production non implementee');
    throw new ServiceUnavailableException('Paiement Orange Money non implemente');
  }

  verifyWebhook(_payload: Record<string, unknown>, _signature?: string): WebhookVerification {
    // TODO(production) : verifier la signature HMAC avec ORANGE_MONEY_WEBHOOK_SECRET,
    // extraire transactionRef + status. Retourner { valid: false } si signature invalide.
    this.logger.warn('Verification webhook Orange Money non implementee');
    return { valid: false };
  }
}
