// Interface decouplee de toute implementation concrete de notifications push.
// Permet de brancher Firebase Cloud Messaging (ou un autre fournisseur) sans
// toucher au module Notifications : seul ce contrat compte pour les consommateurs.
//
// Utilisee pour:
//   - Notification de nouvelle course au chauffeur (Dispatch, Sprint 2)
//   - Notification de statut de course au client (Trips, Sprint 2)
//   - Notification de message de chat (Chat, Sprint 3)
//   - Notification de paiement de commission (Payments, Sprint 4)

export interface PushNotification {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'high' | 'normal';
  badge?: number;
  sound?: string;
}

export interface PushResult {
  messageId: string;
  success: boolean;
  error?: string;
}

export interface PushProvider {
  // Envoie une notification push a un seul appareil.
  send(notification: PushNotification): Promise<PushResult>;

  // Envoie une notification push a plusieurs appareils (multicast).
  sendMulticast(notifications: PushNotification[]): Promise<PushResult[]>;

  // Valide un token d'appareil (pour le nettoyage periodique des tokens invalides).
  validateToken(token: string): Promise<boolean>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
