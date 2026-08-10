import { ServiceType } from '@prisma/client';

export interface TripCreatedEvent {
  tripId: string;
  clientId: string;
  serviceType: ServiceType;
  vehicleTypeId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string;
  estimatedPrice: number;
  distanceMeters: number;
  durationSeconds: number;
}

export interface TripAcceptedEvent {
  tripId: string;
  driverId: string;
  clientId: string;
}

export interface TripStartedEvent {
  tripId: string;
  driverId: string;
  clientId: string;
}

export interface TripCompletedEvent {
  tripId: string;
  driverId: string;
  clientId: string;
  finalPrice: number;
}

export interface TripCancelledEvent {
  tripId: string;
  cancelledBy: string;
  reason: string;
}

export interface TripArrivedEvent {
  tripId: string;
  driverId: string;
  clientId: string;
}

export interface DriverAssignedEvent {
  tripId: string;
  driverId: string;
}

export interface DispatchFailedEvent {
  tripId: string;
  reason: string;
}

export interface PaymentSucceededEvent {
  transactionId: string;
  driverId: string;
  amount: number;
}

export interface DriverOnlineEvent {
  driverId: string;
  lat: number;
  lng: number;
}

export interface DriverOfflineEvent {
  driverId: string;
}

export interface TripRatedEvent {
  tripId: string;
  raterId: string;
  raterRole: 'client' | 'driver';
  rating: number;
  tags: string[];
}

export interface ChatMessageSentEvent {
  messageId: string;
  tripId: string;
  senderId: string;
  senderRole: 'client' | 'driver';
}

export interface WsDriverAcceptRequestedEvent {
  tripId: string;
  driverId: string;
  userId: string;
}

export interface WsDriverDeclineRequestedEvent {
  tripId: string;
  driverId: string;
  reason?: string;
}
