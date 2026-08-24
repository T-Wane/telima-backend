import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentInitiation,
  PaymentInitiationResult,
  PaymentProvider,
  WebhookVerification,
} from './payment-provider.interface';

// Mock payment provider pour le developpement, en attendant les credentials
// Orange Money production. Simule un paiement reussi immediatement (pas de
// webhook asynchrone). Le statut est 'succeeded' des l'initiation pour
// permettre le test du flux complet sans integration externe.
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);
  private counter = 0;

  initiate(input: PaymentInitiation): Promise<PaymentInitiationResult> {
    this.counter += 1;
    const transactionRef = `MOCK-${Date.now()}-${this.counter}`;
    this.logger.log(
      `[MOCK] Paiement simule : ${input.amount} FCFA depuis ${input.phoneNumber} (ref=${transactionRef}, internal=${input.internalRef})`,
    );
    return Promise.resolve({ transactionRef, status: 'succeeded' });
  }

  checkTransactionStatus(_transactionRef: string, _orderId: string, _amount: number) {
    return Promise.resolve({ status: 'succeeded' as const });
  }

  verifyWebhook(_payload: Record<string, unknown>, _signature?: string): WebhookVerification {
    // Le mock ne recoit jamais de webhook (confirmation synchrone).
    this.logger.warn('[MOCK] Webhook recu mais non supporte en mode mock');
    return { valid: false };
  }
}
