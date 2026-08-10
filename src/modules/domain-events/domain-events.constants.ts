export const DomainEvents = {
  TripCreated: 'trip.created',
  TripAccepted: 'trip.accepted',
  TripStarted: 'trip.started',
  TripCompleted: 'trip.completed',
  TripCancelled: 'trip.cancelled',
  TripArrived: 'trip.driver_arrived',
  TripRated: 'trip.rated',
  DriverAssigned: 'dispatch.driver_assigned',
  DispatchFailed: 'dispatch.failed',
  PaymentSucceeded: 'payment.succeeded',
  DriverOnline: 'driver.online',
  DriverOffline: 'driver.offline',
  ChatMessageSent: 'chat.message_sent',
  // Relais WS -> logique metier (Sprint 3). Le Gateway ne connait aucun service metier
  // (evite les dependances circulaires entre EventsModule et TripsModule/DispatchModule) ;
  // il se contente d'emettre ces evenements internes, ecoutes par les modules concernes.
  WsDriverAcceptRequested: 'ws.driver.accept_requested',
  WsDriverDeclineRequested: 'ws.driver.decline_requested',
} as const;

export type DomainEventType = (typeof DomainEvents)[keyof typeof DomainEvents];
