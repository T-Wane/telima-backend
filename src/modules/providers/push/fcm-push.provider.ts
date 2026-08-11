import { readFileSync } from 'fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PushNotification, PushProvider, PushResult } from './push-provider.interface';

// FcmPushProvider : implementation reelle via Firebase Admin SDK.
// Initialise firebase-admin avec le fichier de compte de service dont le chemin
// est configure via FCM_SERVICE_ACCOUNT_PATH. Si non configure, n'envoie pas de
// push (les notifications WS restent actives). Gere le nettoyage des tokens
// invalides en base via les codes d'erreur FCM.
@Injectable()
export class FcmPushProvider implements PushProvider, OnModuleInit {
  private readonly logger = new Logger(FcmPushProvider.name);
  private app: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const serviceAccountPath = this.config.get<string>('FCM_SERVICE_ACCOUNT_PATH');
    if (!serviceAccountPath) {
      this.logger.warn('FCM_SERVICE_ACCOUNT_PATH not set — FCM push disabled');
      return;
    }
    try {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.logger.log('Firebase Admin SDK initialized for FCM push notifications');
    } catch (err) {
      this.logger.error(`Failed to initialize Firebase Admin: ${(err as Error).message}`);
    }
  }

  async send(notification: PushNotification): Promise<PushResult> {
    if (!this.app) {
      return { messageId: 'fcm-not-initialized', success: false, error: 'FCM not initialized' };
    }
    try {
      const message: admin.messaging.Message = {
        token: notification.token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data ?? {},
        android: {
          priority: notification.priority === 'high' ? 'high' : 'normal',
        },
      };
      const messageId = await admin.messaging(this.app).send(message);
      return { messageId, success: true };
    } catch (err) {
      const error = err as Error & { code?: string };
      this.logger.warn(`FCM send failed: ${error.message}`);
      return { messageId: '', success: false, error: error.message };
    }
  }

  async sendMulticast(notifications: PushNotification[]): Promise<PushResult[]> {
    if (!this.app) {
      return notifications.map(() => ({
        messageId: 'fcm-not-initialized',
        success: false,
        error: 'FCM not initialized',
      }));
    }
    return Promise.all(notifications.map((n) => this.send(n)));
  }

  async validateToken(token: string): Promise<boolean> {
    if (!this.app) return false;
    try {
      await admin.messaging(this.app).send({ token }, true);
      return true;
    } catch (err) {
      const error = err as Error & { code?: string };
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        return false;
      }
      return true;
    }
  }
}
