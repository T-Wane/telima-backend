import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { GeoPoint, NearbyDriver } from './geolocation.types';

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Met a jour la position GPS d'un chauffeur en base (PostGIS).
   * Utilise ST_SetSRID(ST_MakePoint, 4326) pour creer un point geometrique valide.
   */
  async updateDriverLocation(driverId: string, lat: number, lng: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE drivers
      SET current_location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          last_location_at = NOW()
      WHERE id = ${driverId}
    `;
    this.logger.debug(`Position updated for driver ${driverId}: ${lat}, ${lng}`);
  }

  /**
   * Trouve les chauffeurs validated + online proches d'un point dans un rayon donne.
   * Utilise ST_DWithin (index GiST) pour une recherche spatialment indexee.
   * Retourne les chauffeurs tries par distance croissante.
   */
  async findNearbyDrivers(
    point: GeoPoint,
    radiusMeters: number,
    serviceType?: string,
    vehicleTypeId?: string,
  ): Promise<NearbyDriver[]> {
    const results = await this.prisma.$queryRaw<NearbyDriver[]>(Prisma.sql`
      SELECT
        d.id AS "driverId",
        ST_Distance(d.current_location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326))::int AS "distanceMeters",
        ST_Y(d.current_location)::float AS lat,
        ST_X(d.current_location)::float AS lng,
        d.rating::float AS rating,
        v.vehicle_type_id AS "vehicleTypeId",
        v.brand AS "vehicleBrand",
        v.model AS "vehicleModel",
        v.plate_number AS "plateNumber"
      FROM drivers d
      INNER JOIN vehicles v ON v.driver_id = d.id
      WHERE d.status = 'validated'
        AND d.is_online = true
        AND d.current_location IS NOT NULL
        AND ST_DWithin(
          d.current_location,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326),
          ${radiusMeters}
        )
        ${serviceType ? Prisma.sql`AND v.vehicle_type_id IN (SELECT id FROM vehicle_types WHERE service_type = ${serviceType}::\"ServiceType\" AND is_active = true)` : Prisma.empty}
        ${vehicleTypeId ? Prisma.sql`AND v.vehicle_type_id = ${vehicleTypeId}` : Prisma.empty}
      ORDER BY "distanceMeters" ASC
    `);

    return results;
  }

  /**
   * Calcule la distance en metres entre deux points (ligne droite, geodesique).
   */
  async calculateDistance(a: GeoPoint, b: GeoPoint): Promise<number> {
    const result = await this.prisma.$queryRaw<{ distance: number }[]>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${a.lng}, ${a.lat}), 4326),
        ST_SetSRID(ST_MakePoint(${b.lng}, ${b.lat}), 4326)
      )::int AS distance
    `;
    return result[0]?.distance ?? 0;
  }

  /**
   * Recupere la position courante d'un chauffeur.
   */
  async getDriverLocation(driverId: string): Promise<GeoPoint | null> {
    const result = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT
        ST_Y(current_location)::float AS lat,
        ST_X(current_location)::float AS lng
      FROM drivers
      WHERE id = ${driverId}
        AND current_location IS NOT NULL
    `;
    return result[0] ? { lat: result[0].lat, lng: result[0].lng } : null;
  }

  /**
   * Cree un point geometrique PostGIS pour l'insertion dans une colonne Unsupported.
   * Utilise par TripsService pour les pickup/dropoff locations.
   */
  static makePoint(lat: number, lng: number): Prisma.Sql {
    return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  }
}
