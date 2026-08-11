import { ServiceType } from '@prisma/client';

export interface PricingContext {
  serviceType: ServiceType;
  vehicleTypeId: string;
  baseFare: number;
  pricePerKm: number;
  pricePerMin: number;
  commissionPercentage: number;
  distanceMeters: number;
  durationSeconds: number;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  requestedAt: Date;
  // Multiplicateur de surge dynamique (zones + regles DB, Sprint 5).
  // Calcule par DynamicPricingService, applique par SurgeMultiplierRule.
  surgeMultiplier?: number;
}

export interface PricingResult {
  estimatedPrice: number;
  commissionAmount: number;
  distanceMeters: number;
  durationSeconds: number;
  breakdown: PricingBreakdown;
}

export interface PricingBreakdown {
  baseFare: number;
  distanceCost: number;
  durationCost: number;
  surgeMultiplier: number;
  total: number;
}
