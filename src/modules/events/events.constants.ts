export const WsEvents = {
  // /rides namespace
  RideDriverAccepted: 'ride:driver_accepted',
  RideDriverArrived: 'ride:driver_arrived',
  RideStarted: 'ride:started',
  RideCompleted: 'ride:completed',
  RideCancelled: 'ride:cancelled',

  // /delivery namespace
  DeliveryPickupEnRoute: 'delivery:pickup_en_route',
  DeliveryParcelPickedUp: 'delivery:parcel_picked_up',
  DeliveryDelivered: 'delivery:delivered',
  DeliveryClientConfirmed: 'delivery:client_confirmed',
  DeliveryCancelled: 'delivery:cancelled',
  DeliveryIssueReported: 'delivery:issue_reported',

  // /drivers namespace
  DriverLocationUpdate: 'driver:location_update',
  DriverJoinRoom: 'driver:join_room',
  DriverRejoinRoom: 'driver:rejoin_room',
  DriverPosition: 'driver:position',
  DriverOnline: 'driver:online',
  DriverOffline: 'driver:offline',

  // /trips namespace
  TripNewRequest: 'trip:new_request',
  TripAccept: 'trip:accept',
  TripDecline: 'trip:decline',

  // /payments namespace
  PaymentConfirmed: 'payment:confirmed',

  // /chat namespace (Sprint 3)
  MessageSend: 'message:send',
  MessageReceived: 'message:received',
} as const;

export const WsNamespaces = {
  Rides: '/rides',
  Delivery: '/delivery',
  Drivers: '/drivers',
  Trips: '/trips',
  Payments: '/payments',
  Chat: '/chat',
} as const;

// Mapping dynamique des événements WebSocket par type de service et statut de trip.
// Permet d'ajouter de nouveaux services sans modifier le TripsService.
// Chaque service peut définir ses propres événements pour le même statut TripStatus.
//
// Exemple : pour 'food', l'événement 'completed' émettra 'delivery:delivered'
// au lieu de 'ride:completed'.
//
// Pour ajouter un nouveau service : ajouter une entrée dans SERVICE_EVENT_MAP.
// Si un service n'a pas de mapping, il utilise le mapping 'ride' par défaut.
import { TripStatus } from '@prisma/client';

const SERVICE_EVENT_MAP: Record<string, Partial<Record<TripStatus, string>>> = {
  ride: {
    [TripStatus.accepted]: WsEvents.RideDriverAccepted,
    [TripStatus.driver_arriving]: WsEvents.RideDriverArrived,
    [TripStatus.in_progress]: WsEvents.RideStarted,
    [TripStatus.completed]: WsEvents.RideCompleted,
    [TripStatus.cancelled_by_client]: WsEvents.RideCancelled,
    [TripStatus.cancelled_by_driver]: WsEvents.RideCancelled,
    [TripStatus.cancelled_auto]: WsEvents.RideCancelled,
  },
  delivery: {
    [TripStatus.accepted]: WsEvents.DeliveryPickupEnRoute,
    [TripStatus.driver_arriving]: WsEvents.DeliveryPickupEnRoute,
    [TripStatus.in_progress]: WsEvents.DeliveryParcelPickedUp,
    [TripStatus.completed]: WsEvents.DeliveryDelivered,
    [TripStatus.cancelled_by_client]: WsEvents.DeliveryCancelled,
    [TripStatus.cancelled_by_driver]: WsEvents.DeliveryCancelled,
    [TripStatus.cancelled_auto]: WsEvents.DeliveryCancelled,
  },
  // food utilise le même mapping que delivery (même cycle de vie)
  food: {
    [TripStatus.accepted]: WsEvents.DeliveryPickupEnRoute,
    [TripStatus.driver_arriving]: WsEvents.DeliveryPickupEnRoute,
    [TripStatus.in_progress]: WsEvents.DeliveryParcelPickedUp,
    [TripStatus.completed]: WsEvents.DeliveryDelivered,
    [TripStatus.cancelled_by_client]: WsEvents.DeliveryCancelled,
    [TripStatus.cancelled_by_driver]: WsEvents.DeliveryCancelled,
    [TripStatus.cancelled_auto]: WsEvents.DeliveryCancelled,
  },
  // intercity utilise le même mapping que ride (même cycle de vie)
  intercity: {
    [TripStatus.accepted]: WsEvents.RideDriverAccepted,
    [TripStatus.driver_arriving]: WsEvents.RideDriverArrived,
    [TripStatus.in_progress]: WsEvents.RideStarted,
    [TripStatus.completed]: WsEvents.RideCompleted,
    [TripStatus.cancelled_by_client]: WsEvents.RideCancelled,
    [TripStatus.cancelled_by_driver]: WsEvents.RideCancelled,
    [TripStatus.cancelled_auto]: WsEvents.RideCancelled,
  },
  // assistance utilise le mapping ride par défaut (transport de personnes)
  assistance: {
    [TripStatus.accepted]: WsEvents.RideDriverAccepted,
    [TripStatus.driver_arriving]: WsEvents.RideDriverArrived,
    [TripStatus.in_progress]: WsEvents.RideStarted,
    [TripStatus.completed]: WsEvents.RideCompleted,
    [TripStatus.cancelled_by_client]: WsEvents.RideCancelled,
    [TripStatus.cancelled_by_driver]: WsEvents.RideCancelled,
    [TripStatus.cancelled_auto]: WsEvents.RideCancelled,
  },
};

export function getWsEventForService(serviceType: string, status: TripStatus): string | undefined {
  const serviceMap = SERVICE_EVENT_MAP[serviceType] ?? SERVICE_EVENT_MAP.ride;
  return serviceMap[status];
}
