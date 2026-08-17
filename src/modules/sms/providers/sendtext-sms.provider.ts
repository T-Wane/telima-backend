import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SmsSendResult } from '../sms-provider.interface';

// Provider SMS reel : sendtext.sn (ADR-012).
// Authentification par headers snt-api-key / snt-api-secret (confirmee par sonde live
// sur l'API : ni Bearer, ni Basic, ni champ body ne sont acceptes).
// Reponse succes : { statusId: 1, messageId: "...", ... }. Erreurs : { apiCode, apiMsg }.
// Le code OTP n'est JAMAIS journalise (regle securite actee).
interface SendtextSuccessResponse {
  statusId?: number;
  status?: string;
  messageId?: string;
  msgStatus?: string;
  desc?: string;
}

interface SendtextErrorResponse {
  apiCode?: number;
  apiMsg?: string;
  Message?: string;
}

const SENDTEXT_TIMEOUT_MS = 10_000;

@Injectable()
export class SendtextSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SendtextSmsProvider');
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly senderName: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('SENDTEXT_API_URL', 'https://api.sendtext.sn/v1/sms/ml');
    this.apiKey = this.config.get<string>('SENDTEXT_API_KEY', '');
    this.apiSecret = this.config.get<string>('SENDTEXT_API_SECRET', '');
    this.senderName = this.config.get<string>('SENDTEXT_SENDER_NAME', 'JulakAI');

    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'SMS_PROVIDER=sendtext mais SENDTEXT_API_KEY / SENDTEXT_API_SECRET sont absents. ' +
          'Renseignez-les dans .env ou repassez SMS_PROVIDER=mock.',
      );
    }
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    // sendtext.sn attend le format national+indicatif SANS le '+' : 223XXXXXXXX.
    const sendtextPhone = phone.replace(/^\+/, '');
    const text = `JulakAI : votre code de verification est ${code}. Il expire dans 5 minutes. Ne le partagez avec personne.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SENDTEXT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'snt-api-key': this.apiKey,
          'snt-api-secret': this.apiSecret,
        },
        body: JSON.stringify({
          sender_name: this.senderName,
          phone: sendtextPhone,
          text,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        `Echec reseau sendtext.sn pour ${sendtextPhone} : ${isTimeout ? 'timeout' : String(error)}`,
      );
      throw new Error(isTimeout ? 'sendtext.sn : timeout' : 'sendtext.sn : erreur reseau');
    } finally {
      clearTimeout(timeout);
    }

    const body = (await response.json().catch(() => ({}))) as
      SendtextSuccessResponse | SendtextErrorResponse;

    if (!response.ok) {
      const apiError = body as SendtextErrorResponse;
      this.logger.error(
        `sendtext.sn HTTP ${response.status} pour ${sendtextPhone} : apiCode=${apiError.apiCode ?? 'n/a'} apiMsg=${apiError.apiMsg ?? apiError.Message ?? 'n/a'}`,
      );
      throw new Error(`sendtext.sn : HTTP ${response.status}`);
    }

    const success = body as SendtextSuccessResponse;
    if (success.statusId !== 1 || !success.messageId) {
      const apiError = body as SendtextErrorResponse;
      this.logger.error(
        `sendtext.sn reponse inattendue pour ${sendtextPhone} : ${JSON.stringify(body)}`,
      );
      throw new Error(`sendtext.sn : envoi refuse (apiCode=${apiError.apiCode ?? 'n/a'})`);
    }

    this.logger.log(
      `SMS OTP envoye a ${sendtextPhone}, messageId=${success.messageId}, msgStatus=${success.msgStatus ?? 'n/a'}`,
    );
    return { messageId: success.messageId };
  }
}
