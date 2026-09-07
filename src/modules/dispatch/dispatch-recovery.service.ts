import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchService } from './dispatch.service';

// Au-dela de cet age, une course encore `pending` au demarrage est consideree comme
// abandonnee (le client a forcement vu une erreur / quitte l'ecran de recherche) :
// on la passe en `cancelled_auto` plutot que de relancer un dispatch sur une demande
// qui n'a plus de sens. En deca, on relance un cycle de dispatch propre.
const REDISPATCH_MAX_AGE_MS = 2 * 60 * 1000;

// Le gateway WebSocket s'attache au serveur HTTP pendant app.listen(), donc APRES
// onApplicationBootstrap. On laisse ce delai au BroadcastService pour recevoir son
// Server avant de re-emettre des trip:new_request. Filet de securite de toute facon :
// un re-dispatch sans destinataire WS sera rattrape par le timeout BullMQ.
const STARTUP_DELAY_MS = 5_000;

/**
 * Reprise des courses orphelines apres un redemarrage du serveur.
 *
 * Un crash / redeploy pendant un dispatch laisse des courses bloquees en `pending` :
 * les jobs de timeout BullMQ peuvent avoir ete perdus (Redis non persistant sur
 * certaines offres managees) et plus rien ne fait avancer la course -> le client
 * reste indefiniment sur « recherche d'un chauffeur ».
 *
 * Au bootstrap applicatif, on balaie ces courses : re-dispatch pour les plus recentes,
 * annulation automatique + notification WS du client pour les autres.
 */
@Injectable()
export class DispatchRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DispatchRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setTimeout(() => {
      void this.run();
    }, STARTUP_DELAY_MS);
    // Ne pas maintenir le process en vie juste pour ce timer.
    timer.unref();
  }

  /** Balaie les courses `pending` orphelines. Idempotent. */
  async run(): Promise<void> {
    let pending: {
      id: string;
      serviceType: string;
      vehicleTypeId: string;
      createdAt: Date;
    }[];

    try {
      pending = await this.prisma.trip.findMany({
        where: { status: 'pending' },
        select: { id: true, serviceType: true, vehicleTypeId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
    } catch (err) {
      // DB indisponible au demarrage : non fatal, on log et on laisse tomber la reprise.
      this.logger.error(`Balayage des courses orphelines echoue: ${(err as Error).message}`);
      return;
    }

    if (pending.length === 0) {
      this.logger.log('Aucune course pending orpheline au demarrage');
      return;
    }

    this.logger.warn(
      `${pending.length} course(s) pending orpheline(s) detectee(s) au demarrage — reprise en cours`,
    );

    const now = Date.now();
    for (const trip of pending) {
      const ageMs = now - trip.createdAt.getTime();
      const ageSec = Math.round(ageMs / 1000);
      try {
        if (ageMs > REDISPATCH_MAX_AGE_MS) {
          this.dispatch.failTrip(trip.id, 'server_restarted');
          this.logger.log(`Trip ${trip.id} (age ${ageSec}s) -> cancelled_auto`);
          continue;
        }

        // Assez recente : on purge les tentatives / verrous residuels d'avant le crash
        // puis on relance un cycle de dispatch complet.
        await this.dispatch.releaseLocksForTrip(trip.id);
        const pickup = await this.getPickup(trip.id);
        if (!pickup) {
          this.dispatch.failTrip(trip.id, 'server_restarted');
          this.logger.warn(`Trip ${trip.id} sans coordonnees pickup -> cancelled_auto`);
          continue;
        }
        await this.dispatch.attemptDispatch(trip.id, pickup, trip.serviceType, trip.vehicleTypeId);
        this.logger.log(`Trip ${trip.id} (age ${ageSec}s) -> re-dispatch`);
      } catch (err) {
        this.logger.error(`Reprise de la course ${trip.id} echouee: ${(err as Error).message}`);
      }
    }
  }

  // Colonne PostGIS geometry (Unsupported par Prisma) -> SQL brut parametre.
  private async getPickup(tripId: string): Promise<{ lat: number; lng: number } | null> {
    const rows = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(pickup_location)::float AS lat, ST_X(pickup_location)::float AS lng
      FROM trips WHERE id = ${tripId}
    `;
    return rows[0] ?? null;
  }
}
