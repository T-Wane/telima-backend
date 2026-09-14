import { createHmac } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Client API JulakAI OTP (https://otp.julakai.com/docs) - fourni par Tidiane le
// 2026-09-14 pour remplacer la generation/verification OTP maison. Contrairement a
// SendtextSmsProvider (simple envoi de SMS), JulakAI gere tout le cycle de vie de
// l'OTP de son cote (generation du code, expiration, cooldown, tentatives) : on ne
// stocke plus le code nous-memes, on delegue send + verify a leur API.
//
// Auth : HMAC-SHA256 sur method+url+timestamp+rawBody (cle = appSecret), envoye via
// les headers X-Julak-Key / X-Julak-Timestamp / X-Julak-Signature.
//
// Une cle JulakAI distincte par appli (client=telima, driver=telimapro) : chaque
// "app" JulakAI a son propre quota. La cle client est active depuis le 2026-09-14 ;
// la cle driver sera fournie plus tard par Tidiane (JULAKAI_DRIVER_APP_KEY/SECRET
// vides jusque-la -> repli automatique sur le provider legacy pour le chauffeur,
// voir AuthService.useJulakai).
export type JulakaiApp = 'client' | 'driver';

export interface JulakaiSendResult {
  requestId: string;
  expiresInSeconds: number;
}

export interface JulakaiVerifyResult {
  verified: boolean;
  verificationToken?: string;
}

interface JulakaiCredentials {
  appKey: string;
  appSecret: string;
}

const JULAKAI_TIMEOUT_MS = 10_000;

@Injectable()
export class JulakaiOtpService {
  private readonly logger = new Logger('JulakaiOtpService');
  private readonly apiBase: string;
  private readonly credentials: Record<JulakaiApp, JulakaiCredentials | null>;

  constructor(private readonly config: ConfigService) {
    this.apiBase = this.config
      .get<string>('JULAKAI_API_BASE', 'https://api.otp.julakai.com')
      .replace(/\/$/, '');

    this.credentials = {
      client: this.loadCredentials('JULAKAI_CLIENT_APP_KEY', 'JULAKAI_CLIENT_APP_SECRET'),
      driver: this.loadCredentials('JULAKAI_DRIVER_APP_KEY', 'JULAKAI_DRIVER_APP_SECRET'),
    };
  }

  private loadCredentials(keyVar: string, secretVar: string): JulakaiCredentials | null {
    const appKey = this.config.get<string>(keyVar, '');
    const appSecret = this.config.get<string>(secretVar, '');
    return appKey && appSecret ? { appKey, appSecret } : null;
  }

  // A verifier avant d'appeler send/verify pour cette app : permet a AuthService de
  // replier sur le provider legacy tant qu'une cle (ex. driver) n'est pas fournie.
  isConfigured(app: JulakaiApp): boolean {
    return this.credentials[app] !== null;
  }

  async sendOtp(phone: string, app: JulakaiApp): Promise<JulakaiSendResult> {
    const body = JSON.stringify({ phone });
    const res = await this.call(app, 'POST', '/v1/otp/send', body);

    if (res.status === 429) {
      throw new BadRequestException(
        'Veuillez patienter avant de redemander un code (cooldown JulakAI)',
      );
    }
    if (res.status === 402) {
      this.logger.error(`JulakAI OTP (${app}) : quota epuise (plan essai/actif)`);
      throw new ServiceUnavailableException('Service SMS temporairement indisponible');
    }
    if (res.status === 400) {
      throw new BadRequestException('Numero de telephone invalide');
    }
    if (!res.ok) {
      this.logger.error(
        `JulakAI OTP (${app}) send echec HTTP ${res.status} : ${JSON.stringify(res.body)}`,
      );
      throw new ServiceUnavailableException('Service SMS temporairement indisponible');
    }

    const data = res.body as JulakaiSendResult;
    this.logger.log(`JulakAI OTP (${app}) envoye, requestId=${data.requestId}`);
    return data;
  }

  async verifyOtp(phone: string, code: string, app: JulakaiApp): Promise<JulakaiVerifyResult> {
    const body = JSON.stringify({ phone, code });
    const res = await this.call(app, 'POST', '/v1/otp/verify', body);

    if (res.status === 401) {
      throw new UnauthorizedException('Code OTP invalide ou expire');
    }
    if (res.status === 403) {
      throw new ForbiddenException('Trop de tentatives, veuillez redemander un code');
    }
    if (!res.ok) {
      this.logger.error(
        `JulakAI OTP (${app}) verify echec HTTP ${res.status} : ${JSON.stringify(res.body)}`,
      );
      throw new ServiceUnavailableException('Service de verification temporairement indisponible');
    }

    return res.body as JulakaiVerifyResult;
  }

  private sign(secret: string, method: string, path: string, timestamp: string, rawBody: string): string {
    const payload = `${method}${path}${timestamp}${rawBody}`;
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  private async call(
    app: JulakaiApp,
    method: 'POST' | 'GET',
    path: string,
    rawBody: string,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const creds = this.credentials[app];
    if (!creds) {
      throw new ServiceUnavailableException(
        `JulakAI non configure pour l'app "${app}" (cle manquante)`,
      );
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.sign(creds.appSecret, method, path, timestamp, rawBody);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JULAKAI_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Julak-Key': creds.appKey,
          'X-Julak-Timestamp': timestamp,
          'X-Julak-Signature': signature,
        },
        body: method === 'POST' ? rawBody : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        `JulakAI OTP (${app}) : echec reseau sur ${path} (${isTimeout ? 'timeout' : String(error)})`,
      );
      throw new ServiceUnavailableException('Service SMS temporairement indisponible');
    } finally {
      clearTimeout(timeout);
    }

    const responseBody = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body: responseBody };
  }
}
