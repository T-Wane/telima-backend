import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider, SmsSendResult } from '../sms-provider.interface';

// Implementation active en dev/test quand SMS_PROVIDER=mock.
// Ne fait AUCUN appel reseau : journalise le code OTP dans les logs serveur pour permettre
// les tests manuels/automatises du flux complet (decision Sprint1 §8).
// ATTENTION : ce provider ne doit JAMAIS etre actif en preprod/production.
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger('MockSmsProvider');

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    this.logger.log(`[MOCK SMS] OTP pour ${phone} : ${code} (aucun SMS reellement envoye)`);
    return {};
  }
}
