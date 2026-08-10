import { Injectable, Logger } from '@nestjs/common';
import { PushNotification, PushProvider, PushResult } from './push-provider.interface';

// Implementation active tant que les identifiants Firebase/FCM ne sont pas disponibles.
// Ne fait AUCUN appel reseau : journalise la notification pour permettre les tests.
@Injectable()
export class MockPushProvider implements PushProvider {
  private readonly logger = new Logger('MockPushProvider');

  async send(notification: PushNotification): Promise<PushResult> {
    this.logger.log(
      `[MOCK PUSH] To: ${notification.token.substring(0, 20)}... | ${notification.title}: ${notification.body}`,
    );
    return { messageId: `mock-msg-${Date.now()}`, success: true };
  }

  async sendMulticast(notifications: PushNotification[]): Promise<PushResult[]> {
    return Promise.all(notifications.map((n) => this.send(n)));
  }

  async validateToken(token: string): Promise<boolean> {
    this.logger.log(`[MOCK PUSH] Validation token: ${token.substring(0, 20)}...`);
    return true;
  }
}
