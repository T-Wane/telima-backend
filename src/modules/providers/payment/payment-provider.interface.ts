// Interface decouplee de toute implementation concrete de paiement.
// Permet de brancher Orange Money (ou un autre fournisseur) sans toucher au
// module Payments : seul ce contrat compte pour les consommateurs.
//
// Utilisee pour le paiement des commissions chauffeur -> plateforme (Sprint 4).
// Le client ne paie JAMAIS via cette interface (paiement cash uniquement, cf. decisions).

export interface PaymentInitiationResult {
  transactionId: string;
  status: 'pending' | 'success' | 'failed';
  providerReference?: string;
  payUrl?: string;
}

export interface PaymentWebhookPayload {
  transactionId: string;
  providerReference: string;
  status: 'success' | 'failed';
  amount: number;
  currency: string;
  phoneNumber?: string;
  rawPayload: unknown;
}

export interface PaymentQueryResult {
  transactionId: string;
  status: 'pending' | 'success' | 'failed';
  amount: number;
  currency: string;
  paidAt?: Date;
}

export interface PaymentProvider {
  // Initie un paiement (push Orange Money vers le chauffeur).
  initiatePayment(params: {
    amount: number;
    currency: string;
    phoneNumber: string;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentInitiationResult>;

  // Verifie le statut d'une transaction (reconciliation).
  queryTransaction(transactionId: string): Promise<PaymentQueryResult>;

  // Valide et parse un webhook entrant (verification signature + parsing).
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<PaymentWebhookPayload>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
