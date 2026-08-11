// Interface decouplee de toute implementation concrete de paiement mobile money.
// Permet de brancher Orange Money (ou Wave) sans toucher au module Payments :
// seul ce contrat compte pour les consommateurs (initiation + verification webhook).
//
// En attendant les credentials Orange Money production, MockPaymentProvider simule
// un paiement qui reussit immediatement (statut succeeded des l'initiation).

export interface PaymentInitiation {
  // Montant en FCFA.
  amount: number;
  // Numero de telephone du payeur (chauffeur) au format international.
  phoneNumber: string;
  // Reference interne unique (id CommissionPayment) passee au provider pour reconciliation.
  internalRef: string;
  description?: string;
}

export interface PaymentInitiationResult {
  // Reference de transaction retournee par le provider (ex: Orange Money pay_token).
  transactionRef: string;
  // Statut immediat : 'pending' si confirmation asynchrone via webhook attendue.
  status: 'pending' | 'succeeded' | 'failed';
  error?: string;
}

export interface WebhookVerification {
  valid: boolean;
  // Reference de transaction issue du webhook, pour reconciliation avec internalRef.
  transactionRef?: string;
  status?: 'succeeded' | 'failed';
}

export interface PaymentProvider {
  // Initie un paiement mobile money (USSD push au payeur).
  initiate(input: PaymentInitiation): Promise<PaymentInitiationResult>;

  // Verifie la signature d'un webhook entrant et extrait le resultat.
  verifyWebhook(payload: Record<string, unknown>, signature?: string): WebhookVerification;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
