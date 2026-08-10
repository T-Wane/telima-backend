import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ServiceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingEngineService } from './pricing-engine.service';
import {
  DISTANCE_PROVIDER,
  DistanceProvider,
} from '../providers/distance/distance-provider.interface';
import { PricingContext, PricingResult } from './interfaces/pricing-context.interface';
import { GeoPoint } from '../geolocation/geolocation.types';

export interface PriceQuoteInput {
  serviceType: ServiceType;
  vehicleTypeId: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  recipientName?: string;
  recipientPhone?: string;
  parcelDescription?: string;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PricingEngineService,
    @Inject(DISTANCE_PROVIDER) private readonly distanceProvider: DistanceProvider,
  ) {}

  async calculatePrice(input: PriceQuoteInput): Promise<PricingResult> {
    const vehicleType = await this.prisma.vehicleType.findFirst({
      where: {
        id: input.vehicleTypeId,
        isActive: true,
        serviceType: input.serviceType,
      },
    });

    if (!vehicleType) {
      throw new NotFoundException(
        `Type de véhicule introuvable ou inactif: ${input.vehicleTypeId}`,
      );
    }

    const distanceResult = await this.distanceProvider.getDistanceMatrix({
      origin: input.pickup,
      destination: input.dropoff,
    });

    const context: PricingContext = {
      serviceType: input.serviceType,
      vehicleTypeId: input.vehicleTypeId,
      baseFare: Number(vehicleType.baseFare),
      pricePerKm: Number(vehicleType.pricePerKm),
      pricePerMin: Number(vehicleType.pricePerMin),
      commissionPercentage: Number(vehicleType.commissionPercentage),
      distanceMeters: distanceResult.distanceMeters,
      durationSeconds: distanceResult.durationSeconds,
      pickupLat: input.pickup.lat,
      pickupLng: input.pickup.lng,
      dropoffLat: input.dropoff.lat,
      dropoffLng: input.dropoff.lng,
      requestedAt: new Date(),
    };

    const result = this.engine.calculate(context);
    return {
      ...result,
      distanceMeters: distanceResult.distanceMeters,
      durationSeconds: distanceResult.durationSeconds,
    };
  }
}
