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
  // URL de paiement a ouvrir cote client (webview pour Orange Money WebPay).
  paymentUrl?: string;
  // Token de notification pour verifier l'authenticite du webhook (Orange Money notif_token).
  notifToken?: string;
  // order_id envoye au provider (pour reconciliation cote backend).
  orderId?: string;
}

export interface WebhookVerification {
  valid: boolean;
  // Reference de transaction issue du webhook, pour reconciliation avec internalRef.
  transactionRef?: string;
  // order_id Orange Money pour retrouver la transaction (alternative a transactionRef).
  orderId?: string;
  // notif_token recu dans le webhook (a comparer avec celui stocke a l'initiation).
  notifToken?: string;
  // Identifiant de transaction final retourne par Orange (txnid).
  txnid?: string;
  status?: 'succeeded' | 'failed' | 'expired';
}

export interface PaymentProvider {
  // Initie un paiement mobile money (USSD push au payeur).
  initiate(input: PaymentInitiation): Promise<PaymentInitiationResult>;

  // Verifie la signature d'un webhook entrant et extrait le resultat.
  verifyWebhook(payload: Record<string, unknown>, signature?: string): WebhookVerification;

  // (Optionnel) Interroge le statut d'une transaction via l'API du provider.
  // Utilise comme filet de secours si le webhook n'arrive pas.
  checkTransactionStatus?(transactionRef: string, orderId: string, amount: number): Promise<{
    status: 'succeeded' | 'failed' | 'expired' | 'pending';
    txnid?: string;
  }>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
