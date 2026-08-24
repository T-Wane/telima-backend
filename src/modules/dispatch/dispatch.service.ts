import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { GeolocationService } from '../geolocation/geolocation.service';
import { BroadcastService } from '../events/services/broadcast.service';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceConfigService } from '../service-config/service-config.service';
import { DispatchLockKey } from './dispatch.constants';
import { DomainEvents } from '../domain-events/domain-events.constants';
import type {
  DriverAssignedEvent,
  DispatchFailedEvent,
} from '../domain-events/events/domain-events';
import { NearbyDriver } from '../geolocation/geolocation.types';
import { WsEvents } from '../events/events.constants';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly geolocation: GeolocationService,
    private readonly broadcast: BroadcastService,
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
    private readonly serviceConfig: ServiceConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async attemptDispatch(
    tripId: string,
    pickup: { lat: number; lng: number },
    serviceType: string,
  ): Promise<void> {
    this.logger.log(`Starting dispatch for trip ${tripId} (service: ${serviceType})`);

    const config = await this.serviceConfig.getDispatchConfig(serviceType);

    const candidates = await this.geolocation.findNearbyDrivers(
      pickup,
      config.dispatchRadiusMeters,
      serviceType,
    );

    if (candidates.length === 0) {
      this.logger.warn(`No drivers found for trip ${tripId}`);
      this.emitDispatchFailed(tripId, 'no_drivers_available');
      return;
    }

    // Enrichissement du payload trip:new_request (API_CONTRACT.md §3) : le chauffeur doit
    // voir adresses, prix estimé, commission et infos client/destinataire sans appel REST
    // supplémentaire depuis TripRequestScreen.
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        client: { select: { firstName: true, lastName: true, phone: true } },
        vehicleType: { select: { name: true, commissionPercentage: true } },
        deliveryDetails: {
          select: { recipientName: true, recipientPhone: true, parcelDescription: true },
        },
      },
    });

    const estimatedPrice = trip ? Number(trip.estimatedPrice ?? 0) : 0;
    const commissionPercentage = trip ? Number(trip.vehicleType.commissionPercentage) : 0;
    const commission = Math.round((estimatedPrice * commissionPercentage) / 100);
    const clientName = trip
      ? `${trip.client.firstName ?? ''} ${trip.client.lastName ?? ''}`.trim()
      : '';

    // Récupération des coordonnées dropoff depuis PostGIS pour l'affichage carte chauffeur
    let dropoffLat: number | undefined;
    let dropoffLng: number | undefined;
    try {
      const dropoffData = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
        SELECT
          ST_Y(dropoff_location)::float AS lat,
          ST_X(dropoff_location)::float AS lng
        FROM trips WHERE id = ${tripId}
      `;
      dropoffLat = dropoffData[0]?.lat;
      dropoffLng = dropoffData[0]?.lng;
    } catch (_) {}

    const notified: NearbyDriver[] = [];
    for (const driver of candidates.slice(0, config.maxDispatchAttempts)) {
      const lockKey = DispatchLockKey(driver.driverId);
      const acquired = await this.redis.set(lockKey, tripId, 'EX', config.lockTtlSeconds, 'NX');

      if (acquired !== 'OK') {
        this.logger.debug(`Driver ${driver.driverId} already locked, skipping`);
        continue;
      }

      await this.prisma.dispatchAttempt.create({
        data: {
          tripId,
          driverId: driver.driverId,
          status: 'driver_notified',
        },
      });

      this.broadcast.emitToDriver(driver.driverId, WsEvents.TripNewRequest, {
        tripId,
        serviceType,
        pickup: { lat: pickup.lat, lng: pickup.lng },
        dropoff: dropoffLat != null && dropoffLng != null
          ? { lat: dropoffLat, lng: dropoffLng }
          : undefined,
        pickupAddress: trip?.pickupAddress,
        dropoffAddress: trip?.dropoffAddress,
        estimatedPrice,
        commission,
        tripDistanceMeters: trip ? Number(trip.distanceMeters ?? 0) : 0,
        driverDistanceMeters: driver.distanceMeters,
        durationSeconds: trip ? Number(trip.durationSeconds ?? 0) : 0,
        vehicleTypeId: driver.vehicleTypeId,
        vehicleTypeName: trip?.vehicleType.name,
        clientName,
        clientPhone: trip ? (trip as any).client?.phone : undefined,
        recipientName: trip?.deliveryDetails?.recipientName,
        recipientPhone: trip?.deliveryDetails?.recipientPhone,
        parcelDescription: trip?.deliveryDetails?.parcelDescription,
      });

      await this.queue.scheduleDispatchTimeout(
        {
          tripId,
          driverId: driver.driverId,
        },
        config.dispatchTimeoutMs,
      );

      notified.push(driver);
      this.logger.log(`Notified driver ${driver.driverId} for trip ${tripId}`);
    }

    if (notified.length === 0) {
      this.logger.warn(`All nearby drivers locked for trip ${tripId}`);
      this.emitDispatchFailed(tripId, 'all_drivers_busy');
    }
  }

  async handleDriverTimeout(tripId: string, driverId: string): Promise<void> {
    this.logger.warn(`Driver ${driverId} timed out for trip ${tripId}`);

    await this.prisma.dispatchAttempt.updateMany({
      where: { tripId, driverId, status: 'driver_notified' },
      data: { status: 'timed_out', respondedAt: new Date() },
    });

    await this.redis.del(DispatchLockKey(driverId));
    await this.checkAndRetryDispatch(tripId);
  }

  /**
   * Refus explicite d'un chauffeur via WS trip:decline (Sprint 3). Marque la tentative
   * comme refusée, libère le verrou immédiatement (sans attendre le timeout Bull), puis
   * déclenche le même contrôle de retry que handleDriverTimeout.
   */
  async handleDriverDeclineAndRetry(tripId: string, driverId: string): Promise<void> {
    await this.handleDriverDecline(tripId, driverId);
    await this.checkAndRetryDispatch(tripId);
  }

  /**
   * Vérifie s'il reste des tentatives de dispatch en cours pour ce trip ; si aucune,
   * relance un nouveau cycle de dispatch ou déclare l'échec si le nombre max de tentatives
   * est atteint. Logique partagée entre timeout automatique (Bull) et refus explicite (WS).
   */
  private async checkAndRetryDispatch(tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { status: true, serviceType: true },
    });

    if (!trip || trip.status !== 'pending') {
      this.logger.debug(`Trip ${tripId} no longer pending, stopping dispatch retry`);
      return;
    }

    const remainingAttempts = await this.prisma.dispatchAttempt.count({
      where: { tripId, status: 'driver_notified' },
    });

    if (remainingAttempts === 0) {
      const totalAttempts = await this.prisma.dispatchAttempt.count({
        where: { tripId },
      });

      const config = await this.serviceConfig.getDispatchConfig(trip.serviceType);

      if (totalAttempts >= config.maxDispatchAttempts) {
        this.emitDispatchFailed(tripId, 'max_attempts_reached');
        return;
      }

      this.logger.log(`Retrying dispatch for trip ${tripId}`);
      // Re-fetch pickup from PostGIS
      const pickupData = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
        SELECT
          ST_Y(pickup_location)::float AS lat,
          ST_X(pickup_location)::float AS lng
        FROM trips WHERE id = ${tripId}
      `;
      const pickup = pickupData[0] ?? { lat: 0, lng: 0 };
      await this.attemptDispatch(tripId, pickup, trip.serviceType);
    }
  }

  async handleDriverAccept(tripId: string, driverId: string): Promise<void> {
    const lockKey = DispatchLockKey(driverId);
    const lockValue = await this.redis.get(lockKey);

    if (lockValue !== tripId) {
      this.logger.warn(`Driver ${driverId} accepted trip ${tripId} but lock mismatch`);
      return;
    }

    await this.prisma.dispatchAttempt.updateMany({
      where: { tripId, driverId, status: 'driver_notified' },
      data: { status: 'driver_accepted', respondedAt: new Date() },
    });

    const otherLocks = await this.prisma.dispatchAttempt.findMany({
      where: { tripId, status: 'driver_notified', NOT: { driverId } },
      select: { driverId: true },
    });

    for (const attempt of otherLocks) {
      await this.redis.del(DispatchLockKey(attempt.driverId));
      await this.prisma.dispatchAttempt.updateMany({
        where: { tripId, driverId: attempt.driverId, status: 'driver_notified' },
        data: { status: 'driver_declined', respondedAt: new Date() },
      });
    }

    await this.redis.del(lockKey);

    const payload: DriverAssignedEvent = { tripId, driverId };
    this.eventEmitter.emit(DomainEvents.DriverAssigned, payload);
    this.logger.log(`Driver ${driverId} assigned to trip ${tripId}`);
  }

  async handleDriverDecline(tripId: string, driverId: string): Promise<void> {
    await this.prisma.dispatchAttempt.updateMany({
      where: { tripId, driverId, status: 'driver_notified' },
      data: { status: 'driver_declined', respondedAt: new Date() },
    });

    await this.redis.del(DispatchLockKey(driverId));
    this.logger.log(`Driver ${driverId} declined trip ${tripId}`);
  }

  async releaseLocksForTrip(tripId: string): Promise<void> {
    const attempts = await this.prisma.dispatchAttempt.findMany({
      where: { tripId, status: 'driver_notified' },
      select: { driverId: true },
    });

    for (const attempt of attempts) {
      await this.redis.del(DispatchLockKey(attempt.driverId));
    }

    await this.prisma.dispatchAttempt.updateMany({
      where: { tripId, status: 'driver_notified' },
      data: { status: 'timed_out', respondedAt: new Date() },
    });
  }

  private emitDispatchFailed(tripId: string, reason: string): void {
    const payload: DispatchFailedEvent = { tripId, reason };
    this.eventEmitter.emit(DomainEvents.DispatchFailed, payload);
    this.logger.warn(`Dispatch failed for trip ${tripId}: ${reason}`);
  }
}
