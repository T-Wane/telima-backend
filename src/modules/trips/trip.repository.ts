import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripStatus, ServiceType, SenderRole } from '@prisma/client';

type TripUpdateData = Record<string, unknown>;

export interface CreateTripData {
  clientId: string;
  vehicleTypeId: string;
  serviceType: ServiceType;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string;
  estimatedPrice: number;
  distanceMeters: number;
  durationSeconds: number;
  paymentMethod: string;
}

export interface CreateDeliveryDetailsData {
  tripId: string;
  recipientName: string;
  recipientPhone: string;
  parcelDescription?: string;
  parcelWeightKg?: number;
  parcelDimensions?: string;
  isFragile?: boolean;
  notes?: string;
}

export interface CreateRideDetailsData {
  tripId: string;
  passengerCount?: number;
  notes?: string;
}

export interface CreateTripStopData {
  tripId: string;
  sequence: number;
  stopType: 'pickup' | 'dropoff' | 'waypoint';
  lat: number;
  lng: number;
  address: string;
  label?: string;
}

const TRIP_INCLUDE = {
  client: { select: { id: true, phone: true, firstName: true, lastName: true } },
  driver: {
    select: {
      id: true,
      rating: true,
      photoUrl: true,
      user: { select: { firstName: true, lastName: true, phone: true } },
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          plateNumber: true,
          vehicleType: { select: { id: true, name: true, serviceType: true } },
        },
      },
    },
  },
  vehicleType: true,
  stops: { orderBy: { sequence: 'asc' as const } },
  rideDetails: true,
  deliveryDetails: true,
} as const;

@Injectable()
export class TripRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insère un trip avec colonnes PostGIS geometry (Unsupported par Prisma ORM).
   * Utilise $queryRaw avec tagged template (paramétré, anti-injection).
   * Retourne l'ID du trip créé.
   * Les détails spécifiques au service (DeliveryDetails, RideDetails) sont créés
   * séparément via createDeliveryDetails / createRideDetails.
   */
  async insertWithGeometry(data: CreateTripData): Promise<string> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO trips (
        id, client_id, vehicle_type_id, service_type, status,
        pickup_location, pickup_address, dropoff_location, dropoff_address,
        estimated_price, distance_meters, duration_seconds, payment_method,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${data.clientId}, ${data.vehicleTypeId},
        ${data.serviceType}::"ServiceType", 'pending',
        ST_SetSRID(ST_MakePoint(${data.pickupLng}, ${data.pickupLat}), 4326),
        ${data.pickupAddress},
        ST_SetSRID(ST_MakePoint(${data.dropoffLng}, ${data.dropoffLat}), 4326),
        ${data.dropoffAddress},
        ${data.estimatedPrice}, ${data.distanceMeters}, ${data.durationSeconds},
        ${data.paymentMethod}::"PaymentMethod",
        NOW(), NOW()
      )
      RETURNING id
    `;
    return result[0].id;
  }

  async findById(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_INCLUDE,
    });
    if (!trip) return null;

    // Les colonnes PostGIS geometry sont Unsupported par Prisma : les coordonnees
    // pickup/dropoff sont recuperees en SQL brut et fusionnees dans la reponse,
    // pour les cartes des apps chauffeur et client.
    const coords = await this.prisma.$queryRaw<
      { pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number }[]
    >`
      SELECT
        ST_Y(pickup_location)::float AS "pickupLat",
        ST_X(pickup_location)::float AS "pickupLng",
        ST_Y(dropoff_location)::float AS "dropoffLat",
        ST_X(dropoff_location)::float AS "dropoffLng"
      FROM trips WHERE id = ${tripId}
    `;
    return { ...trip, ...(coords[0] ?? {}) };
  }

  async findDriverByUserId(userId: string) {
    return this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
  }

  /**
   * Coordonnees du point de ramassage (PostGIS geometry Unsupported par Prisma,
   * donc SQL brut). Utilise pour le calcul d'ETA chauffeur->pickup.
   */
  async getPickupCoordinates(
    tripId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const result = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT
        ST_Y(pickup_location)::float AS lat,
        ST_X(pickup_location)::float AS lng
      FROM trips
      WHERE id = ${tripId}
    `;
    return result[0] ?? null;
  }

  // Vrai si le chauffeur detient une tentative de dispatch active pour ce trip
  // (garde-fou anti auto-assignation, cf. TripsService.updateStatus case accepted).
  async hasActiveDispatchAttempt(tripId: string, driverId: string): Promise<boolean> {
    const attempt = await this.prisma.dispatchAttempt.findFirst({
      where: { tripId, driverId, status: 'driver_notified' },
      select: { id: true },
    });
    return attempt !== null;
  }

  async findManyByClient(clientId: string, skip: number, take: number, status?: string) {
    const where: any = { clientId };
    if (status) where.status = status;
    const [data, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          vehicleType: true,
          driver: {
            select: {
              id: true,
              rating: true,
              user: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);
    return { data, total };
  }

  async findManyByDriver(driverId: string, skip: number, take: number, status?: string) {
    const where: any = { driverId };
    if (status) where.status = status;
    const [data, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          vehicleType: true,
          client: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);
    return { data, total };
  }

  async updateStatus(tripId: string, data: TripUpdateData) {
    await this.prisma.trip.update({
      where: { id: tripId },
      data,
    });
    return this.findById(tripId);
  }

  async updateStatusIfPending(
    tripId: string,
    status: TripStatus,
    cancelReason: string,
  ): Promise<number> {
    const result = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.pending },
      data: {
        status,
        cancelledAt: new Date(),
        cancelReason,
      },
    });
    return result.count;
  }

  async assignDriver(tripId: string, driverId: string) {
    return this.prisma.trip.update({
      where: { id: tripId },
      data: {
        driverId,
        status: TripStatus.accepted,
        acceptedAt: new Date(),
      },
      include: TRIP_INCLUDE,
    });
  }

  async createDeliveryDetails(data: CreateDeliveryDetailsData) {
    return this.prisma.deliveryDetails.create({ data });
  }

  async createRideDetails(data: CreateRideDetailsData) {
    return this.prisma.rideDetails.create({ data });
  }

  async createTripStop(data: CreateTripStopData): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO trip_stops (
        id, trip_id, sequence, stop_type, location, address, label, created_at
      ) VALUES (
        gen_random_uuid(), ${data.tripId}, ${data.sequence},
        ${data.stopType}::"StopType",
        ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326),
        ${data.address}, ${data.label ?? null}, NOW()
      )
    `;
  }

  async markStopArrived(tripId: string, sequence: number) {
    return this.prisma.tripStop.update({
      where: { tripId_sequence: { tripId, sequence } },
      data: { arrivedAt: new Date() },
    });
  }

  async markStopCompleted(tripId: string, sequence: number) {
    return this.prisma.tripStop.update({
      where: { tripId_sequence: { tripId, sequence } },
      data: { completedAt: new Date() },
    });
  }

  async markPaymentReceived(tripId: string, amount: number) {
    return this.prisma.trip.update({
      where: { id: tripId },
      data: { paymentReceivedAt: new Date(), paymentReceivedAmount: amount },
    });
  }

  async findRating(tripId: string, raterId: string) {
    return this.prisma.tripRating.findUnique({
      where: { tripId_raterId: { tripId, raterId } },
    });
  }

  async createRating(data: {
    tripId: string;
    raterId: string;
    raterRole: SenderRole;
    rating: number;
    tags: string[];
  }) {
    return this.prisma.tripRating.create({ data });
  }
}
