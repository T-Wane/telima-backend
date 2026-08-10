import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  PaymentInitiationResult,
  PaymentProvider,
  PaymentQueryResult,
  PaymentWebhookPayload,
} from './payment-provider.interface';

// STUB - A IMPLEMENTER UNE FOIS LES IDENTIFIANTS ORANGE MONEY DISPONIBLES.
// Ne pas activer (voir PAYMENT_PROVIDER dans .env) tant que OM_API_KEY / OM_MERCHANT_KEY
// ne sont pas renseignes : cette classe leve une erreur explicite si utilisee par erreur.
//
// Implementation attendue (cf. doc technique §3.6 / §11.2) :
//   - POST https://api.orange.com/oauth/v2/token pour obtenir un token OAuth2.
//   - POST https://api.orange.com/orangemoney/ml/v1/transactions pour initier un paiement.
//   - Webhook : verifier la signature HMAC du header, parser le payload, idempotence via
//     transactionId en cles de deduplication (table payment_webhooks ou idempotency_keys).
@Injectable()
export class OrangeMoneyPaymentProvider implements PaymentProvider {
  async initiatePayment(): Promise<PaymentInitiationResult> {
    throw new NotImplementedException(
      "OrangeMoneyPaymentProvider n'est pas encore implemente. " +
        'Renseignez OM_API_KEY / OM_MERCHANT_KEY puis implementez ce provider.',
    );
  }

  async queryTransaction(): Promise<PaymentQueryResult> {
    throw new NotImplementedException("OrangeMoneyPaymentProvider n'est pas encore implemente.");
  }

  async parseWebhook(): Promise<PaymentWebhookPayload> {
    throw new NotImplementedException("OrangeMoneyPaymentProvider n'est pas encore implemente.");
  }
}
