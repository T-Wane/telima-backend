// Interface decouplee de toute implementation concrete (decision Sprint1 §8).
// Permet de brancher un vrai fournisseur SMS (sendtext.sn, voir ADR-012) sans toucher
// au reste du module Auth : seul ce contrat compte pour les consommateurs.
export interface SmsSendResult {
  // Identifiant du message cote fournisseur, persisté sur otp_codes.sms_message_id
  // pour tracabilite. Optionnel car tous les fournisseurs n'en retournent pas.
  messageId?: string;
}

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
