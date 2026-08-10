import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentInitiationResult,
  PaymentProvider,
  PaymentQueryResult,
  PaymentWebhookPayload,
} from './payment-provider.interface';

// Implementation active tant que les identifiants Orange Money ne sont pas disponibles.
// Ne fait AUCUN appel reseau : simule un paiement reussi pour permettre les tests
// du flux complet (commission -> paiement -> webhook -> commission_paid).
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger('MockPaymentProvider');

  async initiatePayment(params: {
    amount: number;
    currency: string;
    phoneNumber: string;
    description: string;
  }): Promise<PaymentInitiationResult> {
    const txId = `mock-tx-${Date.now()}`;
    this.logger.log(
      `[MOCK PAYMENT] Paiement simule : ${params.amount} ${params.currency} de ${params.phoneNumber} - ${params.description} (tx: ${txId})`,
    );
    return {
      transactionId: txId,
      status: 'success',
      providerReference: `ref-${txId}`,
    };
  }

  async queryTransaction(transactionId: string): Promise<PaymentQueryResult> {
    this.logger.log(`[MOCK PAYMENT] Verification transaction ${transactionId}`);
    return {
      transactionId,
      status: 'success',
      amount: 0,
      currency: 'XOF',
      paidAt: new Date(),
    };
  }

  async parseWebhook(
    _headers: Record<string, string>,
    body: unknown,
  ): Promise<PaymentWebhookPayload> {
    const payload = body as Record<string, unknown>;
    this.logger.log(`[MOCK PAYMENT] Webhook recu : ${JSON.stringify(payload)}`);
    return {
      transactionId: (payload.transactionId as string) ?? 'mock-webhook-tx',
      providerReference: (payload.providerReference as string) ?? 'mock-ref',
      status: 'success',
      amount: (payload.amount as number) ?? 0,
      currency: (payload.currency as string) ?? 'XOF',
      phoneNumber: (payload.phoneNumber as string) ?? undefined,
      rawPayload: body,
    };
  }
}
