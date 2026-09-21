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
    excludeDriverIds: string[] = [],
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
        -- Exclut un chauffeur deja engage sur une course : sans ce garde-fou il
        -- pouvait recevoir un 2e dispatch et se retrouver avec deux courses.
        -- Backstop : une course "active" de plus de 25 min est forcement
        -- abandonnee dans ce contexte (courses urbaines) et ne doit plus bloquer
        -- le chauffeur pour de nouveaux dispatch.
        AND NOT EXISTS (
          SELECT 1 FROM trips t
          WHERE t.driver_id = d.id
            AND t.status IN ('accepted', 'driver_arriving', 'in_progress')
            AND t.created_at > now() - interval '25 minutes'
        )
        -- Match par NOM de categorie (Moto/Tricycle/Berline) plutot que par
        -- vehicle_type_id exact : un chauffeur "Moto" est ainsi eligible aux
        -- courses ET aux livraisons moto sans devoir s'inscrire separement
        -- comme "Moto Livraison" (cf. demande produit 2026-09-19). Le prix/
        -- commission appliques restent ceux du vehicleTypeId de LA COURSE
        -- (ex. tarif livraison), pas ceux du vehicule du chauffeur.
        ${
          vehicleTypeId
            ? Prisma.sql`AND EXISTS (
                SELECT 1 FROM vehicle_types vt_driver
                INNER JOIN vehicle_types vt_target ON vt_target.name = vt_driver.name
                WHERE vt_driver.id = v.vehicle_type_id
                  AND vt_driver.is_active = true
                  AND vt_target.id = ${vehicleTypeId}
              )`
            : Prisma.empty
        }
        -- Exclut les chauffeurs ayant deja refuse/laisse expirer CETTE course :
        -- sans ce filtre, un retry avec un seul chauffeur a proximite le
        -- re-notifiait indefiniment pour la course qu'il vient de refuser
        -- (cf. audit 2026-09-18). NOT IN plutot que = ANY(...::uuid[]) : le
        -- cast d'un tableau JS vide via Prisma.sql plantait en production
        -- ("operator does not exist: text = uuid").
        ${
          excludeDriverIds.length > 0
            ? Prisma.sql`AND d.id NOT IN (${Prisma.join(excludeDriverIds)})`
            : Prisma.empty
        }
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
