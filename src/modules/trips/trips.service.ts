import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PricingService } from '../pricing/pricing.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { BroadcastService } from '../events/services/broadcast.service';
import { GeolocationService } from '../geolocation/geolocation.service';
import { DomainEvents } from '../domain-events/domain-events.constants';
import { TripRepository } from './trip.repository';
import type {
  TripCreatedEvent,
  TripAcceptedEvent,
  TripStartedEvent,
  TripCompletedEvent,
  TripCancelledEvent,
  TripArrivedEvent,
  DriverAssignedEvent,
  DispatchFailedEvent,
  TripRatedEvent,
} from '../domain-events/events/domain-events';
import { getWsEventForService } from '../events/events.constants';
import { canTransition } from './interfaces/trip-lifecycle.interface';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripStatusDto } from './dto/update-trip-status.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { PaymentReceivedDto } from './dto/payment-received.dto';
import { TripStatus, SenderRole } from '@prisma/client';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly tripRepo: TripRepository,
    private readonly pricingService: PricingService,
    private readonly dispatchService: DispatchService,
    private readonly broadcast: BroadcastService,
    private readonly eventEmitter: EventEmitter2,
    private readonly geolocation: GeolocationService,
  ) {}

  async createTrip(clientId: string, dto: CreateTripDto) {
    const priceResult = await this.pricingService.calculatePrice({
      serviceType: dto.serviceType,
      vehicleTypeId: dto.vehicleTypeId,
      pickup: dto.pickup,
      dropoff: dto.dropoff,
    });

    const tripId = await this.tripRepo.insertWithGeometry({
      clientId,
      vehicleTypeId: dto.vehicleTypeId,
      serviceType: dto.serviceType,
      pickupLat: dto.pickup.lat,
      pickupLng: dto.pickup.lng,
      pickupAddress: dto.pickupAddress,
      dropoffLat: dto.dropoff.lat,
      dropoffLng: dto.dropoff.lng,
      dropoffAddress: dto.dropoffAddress,
      estimatedPrice: priceResult.estimatedPrice,
      distanceMeters: priceResult.distanceMeters,
      durationSeconds: priceResult.durationSeconds,
      paymentMethod: 'cash',
    });

    // Création des détails spécifiques au service
    if (dto.serviceType === 'delivery' || dto.serviceType === 'food') {
      await this.tripRepo.createDeliveryDetails({
        tripId,
        recipientName: dto.recipientName ?? '',
        recipientPhone: dto.recipientPhone ?? '',
        parcelDescription: dto.parcelDescription,
        parcelWeightKg: dto.parcelWeightKg,
        parcelDimensions: dto.parcelDimensions,
        isFragile: dto.isFragile ?? false,
        notes: dto.notes,
      });
    } else if (dto.serviceType === 'ride' || dto.serviceType === 'intercity') {
      await this.tripRepo.createRideDetails({
        tripId,
        passengerCount: dto.passengerCount ?? 1,
        notes: dto.notes,
      });
    }

    const trip = await this.getTrip(tripId);

    const event: TripCreatedEvent = {
      tripId: trip.id,
      clientId,
      serviceType: dto.serviceType,
      vehicleTypeId: dto.vehicleTypeId,
      pickupLat: dto.pickup.lat,
      pickupLng: dto.pickup.lng,
      pickupAddress: dto.pickupAddress,
      dropoffLat: dto.dropoff.lat,
      dropoffLng: dto.dropoff.lng,
      dropoffAddress: dto.dropoffAddress,
      estimatedPrice: priceResult.estimatedPrice,
      distanceMeters: priceResult.distanceMeters,
      durationSeconds: priceResult.durationSeconds,
    };
    this.eventEmitter.emit(DomainEvents.TripCreated, event);

    this.logger.log(
      `Trip created: ${trip.id} by client ${clientId}, price=${priceResult.estimatedPrice}`,
    );
    return trip;
  }

  async getTrip(tripId: string) {
    const trip = await this.tripRepo.findById(tripId);
    if (!trip) throw new NotFoundException('Course introuvable');
    return trip;
  }

  async listMyTrips(userId: string, role: string, page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;

    if (role === 'driver') {
      const driver = await this.tripRepo.findDriverByUserId(userId);
      if (!driver) return { data: [], total: 0, page, limit };
      return { ...(await this.tripRepo.findManyByDriver(driver.id, skip, limit, status)), page, limit };
    }

    return { ...(await this.tripRepo.findManyByClient(userId, skip, limit, status)), page, limit };
  }

  async updateStatus(tripId: string, userId: string, role: string, dto: UpdateTripStatusDto) {
    const trip = await this.getTrip(tripId);

    if (!canTransition(trip.status, dto.status)) {
      throw new BadRequestException(`Transition invalide: ${trip.status} → ${dto.status}`);
    }

    const updateData: any = { status: dto.status };

    switch (dto.status) {
      case TripStatus.accepted:
        if (role !== 'driver')
          throw new ForbiddenException('Seul un chauffeur peut accepter une course');
        const driver = await this.tripRepo.findDriverByUserId(userId);
        if (!driver) throw new ForbiddenException('Profil chauffeur introuvable');
        // Un chauffeur ne peut accepter que s'il a ete notifie par le dispatch :
        // sans ce garde-fou, n'importe quel chauffeur pourrait s'auto-assigner
        // n'importe quelle course pending via REST ou WS (handleDriverAccept ne fait
        // que logger un avertissement sans bloquer la mise a jour du statut).
        const hasActiveAttempt = await this.tripRepo.hasActiveDispatchAttempt(tripId, driver.id);
        if (!hasActiveAttempt) {
          throw new ForbiddenException('Cette course ne vous est pas assignee (dispatch)');
        }
        updateData.driverId = driver.id;
        updateData.acceptedAt = new Date();
        await this.dispatchService.handleDriverAccept(tripId, driver.id);
        break;

      case TripStatus.driver_arriving:
      case TripStatus.in_progress:
      case TripStatus.completed: {
        if (role !== 'driver')
          throw new ForbiddenException('Seul un chauffeur peut faire avancer une course');
        const assignedDriver = await this.tripRepo.findDriverByUserId(userId);
        if (!assignedDriver || trip.driverId !== assignedDriver.id) {
          throw new ForbiddenException("Vous n'etes pas le chauffeur assigne a cette course");
        }
        if (dto.status === TripStatus.driver_arriving) {
          updateData.driverArrivedAt = new Date();
        } else if (dto.status === TripStatus.in_progress) {
          updateData.startedAt = new Date();
        } else {
          updateData.completedAt = new Date();
          updateData.finalPrice = trip.estimatedPrice;
        }
        break;
      }

      case TripStatus.cancelled_by_client:
        if (role !== 'client' && userId !== trip.clientId)
          throw new ForbiddenException('Seul le client peut annuler');
        updateData.cancelledAt = new Date();
        updateData.cancelReason = dto.cancelReason;
        await this.dispatchService.releaseLocksForTrip(tripId);
        break;

      case TripStatus.cancelled_by_driver:
        if (role !== 'driver') throw new ForbiddenException('Seul un chauffeur peut annuler');
        const cancellingDriver = await this.tripRepo.findDriverByUserId(userId);
        if (!cancellingDriver || trip.driverId !== cancellingDriver.id) {
          throw new ForbiddenException("Vous n'etes pas le chauffeur assigne a cette course");
        }
        updateData.cancelledAt = new Date();
        updateData.cancelReason = dto.cancelReason;
        break;

      case TripStatus.cancelled_auto:
        updateData.cancelledAt = new Date();
        updateData.cancelReason = dto.cancelReason ?? 'auto';
        await this.dispatchService.releaseLocksForTrip(tripId);
        break;
    }

    const updated = await this.tripRepo.updateStatus(tripId, updateData);

    this.emitStatusEvent(updated, userId, dto.cancelReason);
    this.broadcastStatusEvent(updated, dto.status);

    this.logger.log(`Trip ${tripId} status updated: ${trip.status} → ${dto.status}`);
    return updated;
  }

  async handleDispatchFailed(event: DispatchFailedEvent): Promise<void> {
    this.logger.warn(`Dispatch failed for trip ${event.tripId}: ${event.reason}`);
    await this.tripRepo.updateStatusIfPending(
      event.tripId,
      TripStatus.cancelled_auto,
      event.reason,
    );
    const trip = await this.tripRepo.findById(event.tripId);
    const wsEvent = getWsEventForService(trip?.serviceType ?? 'ride', TripStatus.cancelled_auto);
    if (wsEvent) {
      this.broadcast.emitToTrip(event.tripId, wsEvent, {
        tripId: event.tripId,
        reason: event.reason,
      });
    }
  }

  async handleDriverAssigned(event: DriverAssignedEvent): Promise<void> {
    this.logger.log(`Driver ${event.driverId} assigned to trip ${event.tripId}`);
    const trip = await this.tripRepo.assignDriver(event.tripId, event.driverId);

    const wsEvent = getWsEventForService(trip.serviceType, TripStatus.accepted);
    if (wsEvent) {
      const vehicle = trip.driver?.vehicle;
      // ETA = temps pour le chauffeur d'atteindre le point de ramassage, pas la
      // duree totale du trajet. Distance chauffeur->pickup a vitesse moyenne
      // urbaine (~25 km/h), facteur 1.4 pour approximer le routage routier.
      let etaMinutes: number | undefined;
      let driverLat: number | undefined;
      let driverLng: number | undefined;
      try {
        const driverPos = await this.geolocation.getDriverLocation(event.driverId);
        const pickupCoords = await this.tripRepo.getPickupCoordinates(event.tripId);
        if (driverPos) {
          driverLat = driverPos.lat;
          driverLng = driverPos.lng;
        }
        if (driverPos && pickupCoords) {
          const distMeters = await this.geolocation.calculateDistance(driverPos, pickupCoords);
          const roadMeters = distMeters * 1.4;
          etaMinutes = Math.max(1, Math.ceil(roadMeters / (25000 / 60)));
        }
      } catch {
        // ETA indisponible (position chauffeur inconnue) : le client affichera
        // son fallback local.
      }
      const acceptedPayload = {
        tripId: trip.id,
        driverId: event.driverId,
        driverName:
          `${trip.driver?.user.firstName ?? ''} ${trip.driver?.user.lastName ?? ''}`.trim(),
        driverPhone: trip.driver?.user.phone,
        driverPhoto: trip.driver?.photoUrl,
        rating: trip.driver?.rating,
        vehiclePlate: vehicle?.plateNumber,
        vehicleModel: vehicle ? `${vehicle.brand} ${vehicle.model}` : undefined,
        vehicleType: vehicle?.vehicleType?.name,
        etaMinutes,
        driverLat,
        driverLng,
        estimatedPrice: trip.estimatedPrice ? Number(trip.estimatedPrice) : undefined,
      };
      // Émettre vers les deux canaux : user room (le client est toujours dans sa
      // user room à la connexion) et trip room (le client joint la trip room dès
      // createTrip). Après une reconnexion WS, le client ne rejoint que sa user
      // room automatiquement + trip:join si _currentTripId est set, donc les deux
      // canaux couvrent tous les scénarios.
      this.broadcast.emitToUser(trip.clientId, wsEvent, acceptedPayload);
      this.broadcast.emitToTrip(trip.id, wsEvent, acceptedPayload);
    }

    const acceptEvent: TripAcceptedEvent = {
      tripId: trip.id,
      driverId: event.driverId,
      clientId: trip.clientId,
    };
    this.eventEmitter.emit(DomainEvents.TripAccepted, acceptEvent);
  }

  private emitStatusEvent(trip: any, userId: string, cancelReason?: string): void {
    const base = { tripId: trip.id, driverId: trip.driverId, clientId: trip.clientId };

    switch (trip.status) {
      case TripStatus.driver_arriving: {
        const e: TripArrivedEvent = base;
        this.eventEmitter.emit(DomainEvents.TripArrived, e);
        break;
      }
      case TripStatus.in_progress: {
        const e: TripStartedEvent = base;
        this.eventEmitter.emit(DomainEvents.TripStarted, e);
        break;
      }
      case TripStatus.completed: {
        const e: TripCompletedEvent = { ...base, finalPrice: Number(trip.finalPrice) };
        this.eventEmitter.emit(DomainEvents.TripCompleted, e);
        break;
      }
      case TripStatus.cancelled_by_client:
      case TripStatus.cancelled_by_driver:
      case TripStatus.cancelled_auto: {
        const e: TripCancelledEvent = {
          tripId: trip.id,
          cancelledBy: userId,
          reason: cancelReason ?? trip.cancelReason ?? '',
        };
        this.eventEmitter.emit(DomainEvents.TripCancelled, e);
        break;
      }
    }
  }

  private broadcastStatusEvent(trip: any, status: TripStatus): void {
    const wsEvent = getWsEventForService(trip.serviceType, status);
    if (wsEvent) {
      this.broadcast.emitToTrip(trip.id, wsEvent, {
        tripId: trip.id,
        status,
        pickupAddress: trip.pickupAddress,
        dropoffAddress: trip.dropoffAddress,
        estimatedPrice: trip.estimatedPrice ? Number(trip.estimatedPrice) : undefined,
        finalPrice: trip.finalPrice ? Number(trip.finalPrice) : undefined,
        driverName:
          `${trip.driver?.user?.firstName ?? ''} ${trip.driver?.user?.lastName ?? ''}`.trim() ||
          undefined,
        driverPhone: trip.driver?.user?.phone,
      });
    }
  }

  /**
   * Acceptation REST (Sprint 3) : equivalent de WS trip:accept, recommande par
   * API_CONTRACT.md §7 (REST pour fiabilite, WS pour notification temps reel).
   * Delegue a updateStatus pour appliquer exactement les memes regles (transition,
   * verification de tentative de dispatch active, verrous).
   */
  async acceptTrip(tripId: string, userId: string) {
    return this.updateStatus(tripId, userId, 'driver', { status: TripStatus.accepted });
  }

  /**
   * Refus REST (Sprint 3) : equivalent de WS trip:decline. Verifie que le chauffeur
   * a bien ete notifie par le dispatch (meme garde-fou que l'acceptation), puis libere
   * le verrou et relance le dispatch sans attendre le timeout BullMQ.
   */
  async declineTrip(tripId: string, userId: string, reason?: string) {
    const trip = await this.getTrip(tripId);
    const driver = await this.tripRepo.findDriverByUserId(userId);
    if (!driver) throw new ForbiddenException('Profil chauffeur introuvable');

    const hasActiveAttempt = await this.tripRepo.hasActiveDispatchAttempt(tripId, driver.id);
    if (!hasActiveAttempt) {
      throw new ForbiddenException('Cette course ne vous est pas assignee (dispatch)');
    }

    await this.dispatchService.handleDriverDeclineAndRetry(tripId, driver.id);
    this.logger.log(
      `Trip ${tripId} declined by driver ${driver.id} via REST${reason ? `: ${reason}` : ''}`,
    );
    return { tripId: trip.id, declined: true };
  }

  /**
   * Confirmation manuelle par le chauffeur d'un paiement cash reçu (Sprint 3, §5 decisions
   * actees : le client paie exclusivement en especes, aucun flux Orange Money client).
   * N'effectue pas la transition de statut : le chauffeur appelle ensuite
   * PATCH /trips/:id/status { status: "completed" } (cf. API_CONTRACT.md fiche #D-09).
   */
  async confirmPaymentReceived(
    tripId: string,
    userId: string,
    role: string,
    dto: PaymentReceivedDto,
  ) {
    if (role !== 'driver') {
      throw new ForbiddenException('Seul un chauffeur peut confirmer un paiement');
    }
    const trip = await this.getTrip(tripId);
    const driver = await this.tripRepo.findDriverByUserId(userId);
    if (!driver || trip.driverId !== driver.id) {
      throw new ForbiddenException("Ce n'est pas votre course");
    }
    if (trip.status !== TripStatus.in_progress) {
      throw new BadRequestException(`Paiement impossible depuis le statut actuel: ${trip.status}`);
    }
    this.logger.log(`Payment received for trip ${tripId}: ${dto.amount}`);
    return this.tripRepo.markPaymentReceived(tripId, dto.amount);
  }

  /**
   * Notation de la course (V1 : le chauffeur note le client, cf. RatingScreen Telima Pro).
   * Un seul rating par (tripId, raterId) - contrainte unique en base.
   */
  async rateTrip(tripId: string, userId: string, role: string, dto: CreateRatingDto) {
    const trip = await this.getTrip(tripId);

    if (role === 'driver') {
      const driver = await this.tripRepo.findDriverByUserId(userId);
      if (!driver || trip.driverId !== driver.id) {
        throw new ForbiddenException("Ce n'est pas votre course");
      }
    } else if (trip.clientId !== userId) {
      throw new ForbiddenException("Ce n'est pas votre course");
    }

    if (trip.status !== TripStatus.completed) {
      throw new BadRequestException('La course doit être terminée pour être notée');
    }

    const existing = await this.tripRepo.findRating(tripId, userId);
    if (existing) {
      throw new ConflictException('Cette course a déjà été notée');
    }

    const raterRole = role === 'driver' ? SenderRole.driver : SenderRole.client;
    const rating = await this.tripRepo.createRating({
      tripId,
      raterId: userId,
      raterRole,
      rating: dto.rating,
      tags: dto.tags ?? [],
    });

    const event: TripRatedEvent = {
      tripId,
      raterId: userId,
      raterRole: role === 'driver' ? 'driver' : 'client',
      rating: dto.rating,
      tags: dto.tags ?? [],
    };
    this.eventEmitter.emit(DomainEvents.TripRated, event);

    return rating;
  }
}
