import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { GeolocationService } from '../geolocation/geolocation.service';
import { BroadcastService } from '../events/services/broadcast.service';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceConfigService } from '../service-config/service-config.service';
import { DispatchLockKey, DispatchTimeoutJobKey, DispatchRoundsKey } from './dispatch.constants';
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
    vehicleTypeId?: string,
  ): Promise<void> {
    this.logger.log(`Starting dispatch for trip ${tripId} (service: ${serviceType}, vehicleType: ${vehicleTypeId ?? 'any'})`);

    const roundsKey = DispatchRoundsKey(tripId);
    await this.redis.incr(roundsKey);
    await this.redis.expire(roundsKey, 3600);

    const config = await this.serviceConfig.getDispatchConfig(serviceType);

    const candidates = await this.geolocation.findNearbyDrivers(
      pickup,
      config.dispatchRadiusMeters,
      serviceType,
      vehicleTypeId,
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

      // upsert (pas create) : si ce chauffeur a deja une tentative pour cette
      // course (ex. il vient de refuser/timeout et se retrouve reselectionne
      // au retry, seul candidat disponible), un create() plante sur la
      // contrainte unique (trip_id, driver_id) -> 500 silencieux qui casse
      // tout le cycle de retry sans jamais notifier personne d'autre.
      await this.prisma.dispatchAttempt.upsert({
        where: { tripId_driverId: { tripId, driverId: driver.driverId } },
        create: {
          tripId,
          driverId: driver.driverId,
          status: 'driver_notified',
        },
        update: {
          status: 'driver_notified',
          notifiedAt: new Date(),
          respondedAt: null,
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

      // Un chauffeur reselectionne au retry (upsert ci-dessus) peut avoir un
      // ancien job de timeout encore en file (jamais annule si sa 1ere
      // tentative a ete traitee autrement, ex. refus explicite). On l'annule
      // avant d'en programmer un nouveau pour eviter les doublons.
      await this.cancelTimeoutJob(tripId, driver.driverId);
      const timeoutJobId = await this.queue.scheduleDispatchTimeout(
        {
          tripId,
          driverId: driver.driverId,
        },
        config.dispatchTimeoutMs,
      );
      await this.redis.set(
        DispatchTimeoutJobKey(tripId, driver.driverId),
        timeoutJobId,
        'EX',
        Math.ceil(config.dispatchTimeoutMs / 1000) + 30,
      );

      // Notification push (appli fermee / ecran eteint) en plus du WS.
      this.eventEmitter.emit(DomainEvents.DriverNotified, {
        tripId,
        driverId: driver.driverId,
        serviceType,
        pickupAddress: trip?.pickupAddress ?? undefined,
        estimatedPrice,
      });

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
    await this.redis.del(DispatchTimeoutJobKey(tripId, driverId));
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
      select: { status: true, serviceType: true, vehicleTypeId: true },
    });

    if (!trip || trip.status !== 'pending') {
      this.logger.debug(`Trip ${tripId} no longer pending, stopping dispatch retry`);
      return;
    }

    const remainingAttempts = await this.prisma.dispatchAttempt.count({
      where: { tripId, status: 'driver_notified' },
    });

    if (remainingAttempts === 0) {
      // Nombre de vagues de notification deja tentees (voir DispatchRoundsKey :
      // compte les rounds, pas les lignes DispatchAttempt, pour que le seuil
      // soit atteint meme quand le meme chauffeur est relance a chaque fois).
      const roundsSoFar = Number(await this.redis.get(DispatchRoundsKey(tripId))) || 0;

      const config = await this.serviceConfig.getDispatchConfig(trip.serviceType);

      if (roundsSoFar >= config.maxDispatchAttempts) {
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
      await this.attemptDispatch(tripId, pickup, trip.serviceType, trip.vehicleTypeId);
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
    await this.cancelTimeoutJob(tripId, driverId);

    const otherLocks = await this.prisma.dispatchAttempt.findMany({
      where: { tripId, status: 'driver_notified', NOT: { driverId } },
      select: { driverId: true },
    });

    for (const attempt of otherLocks) {
      await this.redis.del(DispatchLockKey(attempt.driverId));
      await this.cancelTimeoutJob(tripId, attempt.driverId);
      await this.prisma.dispatchAttempt.updateMany({
        where: { tripId, driverId: attempt.driverId, status: 'driver_notified' },
        data: { status: 'driver_declined', respondedAt: new Date() },
      });
    }

    await this.redis.del(lockKey);
    await this.redis.del(DispatchRoundsKey(tripId));

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
    await this.cancelTimeoutJob(tripId, driverId);
    this.logger.log(`Driver ${driverId} declined trip ${tripId}`);
  }

  async releaseLocksForTrip(tripId: string): Promise<void> {
    const attempts = await this.prisma.dispatchAttempt.findMany({
      where: { tripId, status: 'driver_notified' },
      select: { driverId: true },
    });

    for (const attempt of attempts) {
      await this.redis.del(DispatchLockKey(attempt.driverId));
      await this.cancelTimeoutJob(tripId, attempt.driverId);
    }

    await this.prisma.dispatchAttempt.updateMany({
      where: { tripId, status: 'driver_notified' },
      data: { status: 'timed_out', respondedAt: new Date() },
    });
  }

  /**
   * Abandonne une course encore `pending` : emet DispatchFailed, ce qui la passe en
   * `cancelled_auto` (TripsService.handleDispatchFailed) et notifie le client par WS.
   * Public pour DispatchRecoveryService (balayage des courses orphelines au demarrage).
   */
  failTrip(tripId: string, reason: string): void {
    this.emitDispatchFailed(tripId, reason);
  }

  /**
   * Annule le job Bull de timeout programme pour ce couple (trip, driver), s'il
   * existe encore. Indispensable des qu'une tentative se termine autrement que
   * par timeout (acceptation, refus, invalidation) : sans ca, le job reste en
   * file et se declenche plus tard tout seul, relancant une notification /
   * un cycle de retry pour une course deja avancee (cf. bug notifications en
   * boucle constate en test le 2026-09-14).
   */
  private async cancelTimeoutJob(tripId: string, driverId: string): Promise<void> {
    const key = DispatchTimeoutJobKey(tripId, driverId);
    const jobId = await this.redis.get(key);
    if (jobId) {
      await this.queue.cancelDispatchTimeout(jobId);
      await this.redis.del(key);
    }
  }

  private emitDispatchFailed(tripId: string, reason: string): void {
    void this.redis.del(DispatchRoundsKey(tripId));
    const payload: DispatchFailedEvent = { tripId, reason };
    this.eventEmitter.emit(DomainEvents.DispatchFailed, payload);
    this.logger.warn(`Dispatch failed for trip ${tripId}: ${reason}`);
  }

  /**
   * Demande de course actuellement adressee a ce chauffeur mais pas encore
   * traitee (dispatchAttempt `driver_notified` + course encore `pending`).
   * Sert au rattrapage : le chauffeur ouvre l'appli via la notification push
   * alors que l'evenement WS `trip:new_request` a ete perdu (socket coupe).
   * Retourne le meme payload que `trip:new_request`, ou null.
   */
  async getPendingRequestForDriver(userId: string): Promise<Record<string, unknown> | null> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) return null;

    // Course encore `pending` pour laquelle ce chauffeur a ete sollicite (meme si
    // la tentative a expire entre-temps : il ouvre l'appli via la push apres le
    // timeout). On exclut les courses ou un AUTRE chauffeur a deja accepte.
    const attempt = await this.prisma.dispatchAttempt.findFirst({
      where: {
        driverId: driver.id,
        status: { in: ['driver_notified', 'timed_out'] },
        trip: { status: 'pending', driverId: null },
      },
      orderBy: { notifiedAt: 'desc' },
      include: {
        trip: {
          include: {
            client: { select: { firstName: true, lastName: true, phone: true } },
            vehicleType: { select: { name: true, commissionPercentage: true } },
            deliveryDetails: {
              select: {
                recipientName: true,
                recipientPhone: true,
                parcelDescription: true,
              },
            },
          },
        },
      },
    });
    if (!attempt?.trip) return null;
    const trip = attempt.trip;

    // "Re-arme" la demande pour ce chauffeur : sans ca, l'acceptation echouerait
    // ("course non adressee") car la tentative avait expire et le verrou saute.
    const anotherAccepted = await this.prisma.dispatchAttempt.findFirst({
      where: { tripId: trip.id, status: 'driver_accepted', NOT: { driverId: driver.id } },
      select: { id: true },
    });
    if (anotherAccepted) return null;
    try {
      await this.prisma.dispatchAttempt.update({
        where: { id: attempt.id },
        data: { status: 'driver_notified', respondedAt: null },
      });
      await this.redis.set(
        DispatchLockKey(driver.id),
        trip.id,
        'EX',
        75,
      );
    } catch (err) {
      this.logger.warn(
        `Re-arm dispatch attempt failed for driver ${driver.id} trip ${trip.id}: ${(err as Error).message}`,
      );
    }

    let coords: {
      plat?: number;
      plng?: number;
      dlat?: number;
      dlng?: number;
    } = {};
    try {
      const rows = await this.prisma.$queryRaw<
        { plat: number; plng: number; dlat: number; dlng: number }[]
      >`
        SELECT
          ST_Y(pickup_location)::float AS plat,
          ST_X(pickup_location)::float AS plng,
          ST_Y(dropoff_location)::float AS dlat,
          ST_X(dropoff_location)::float AS dlng
        FROM trips WHERE id = ${trip.id}
      `;
      coords = rows[0] ?? {};
    } catch (_) {}

    const estimatedPrice = Number(trip.estimatedPrice ?? 0);
    const commissionPct = Number(trip.vehicleType.commissionPercentage ?? 0);
    const commission = Math.round((estimatedPrice * commissionPct) / 100);

    return {
      tripId: trip.id,
      serviceType: trip.serviceType,
      pickup:
        coords.plat != null ? { lat: coords.plat, lng: coords.plng } : undefined,
      dropoff:
        coords.dlat != null ? { lat: coords.dlat, lng: coords.dlng } : undefined,
      pickupAddress: trip.pickupAddress,
      dropoffAddress: trip.dropoffAddress,
      estimatedPrice,
      commission,
      tripDistanceMeters: Number(trip.distanceMeters ?? 0),
      durationSeconds: Number(trip.durationSeconds ?? 0),
      vehicleTypeName: trip.vehicleType.name,
      clientName: `${trip.client.firstName ?? ''} ${trip.client.lastName ?? ''}`.trim(),
      clientPhone: trip.client.phone,
      recipientName: trip.deliveryDetails?.recipientName,
      recipientPhone: trip.deliveryDetails?.recipientPhone,
      parcelDescription: trip.deliveryDetails?.parcelDescription,
    };
  }
}
