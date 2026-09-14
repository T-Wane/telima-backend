import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchService } from './dispatch.service';
import { BroadcastService } from '../events/services/broadcast.service';
import { getWsEventForService } from '../events/events.constants';

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

// Balayage periodique : rattrape les courses restees `pending` alors que le serveur
// tourne (dispatch initial qui n'a trouve personne parce que le seul chauffeur etait
// occupe, job de timeout BullMQ perdu, etc.). Sans ca la course restait bloquee
// jusqu'a l'abandon cote client.
const SWEEP_INTERVAL_MS = 30_000;

// On ne retouche pas une course trop fraiche : son dispatch initial est peut-etre
// encore en cours (attente de reponse chauffeur, job de timeout arme). Doit rester
// superieur au plus grand dispatchTimeoutMs configure (60s pour ride/delivery, cf.
// ServiceConfigService) sous peine d'interrompre un dispatch encore legitime — bug
// constate le 2026-09-11 : une livraison etait re-dispatchee/annulee a 30-35s alors
// que le chauffeur avait jusqu'a 60s pour repondre.
const REDISPATCH_MIN_AGE_MS = 90_000;

// Course acceptee par un chauffeur mais qui n'avance plus (course de test
// abandonnee, chauffeur qui ne finira jamais). Delai volontairement large : un
// chauffeur qui perd le reseau en allant chercher le client (zone morte, tunnel)
// doit pouvoir reprendre sa course a la reconnexion — on n'annule que ce qui est
// clairement mort. On ne touche JAMAIS `in_progress` (client a bord / colis pris ;
// le client dispose du bouton "Quitter" s'il abandonne).
const STALE_ASSIGNED_MS = 45 * 60 * 1000;

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
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly broadcast: BroadcastService,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setTimeout(() => {
      void this.run();
    }, STARTUP_DELAY_MS);
    // Ne pas maintenir le process en vie juste pour ce timer.
    timer.unref();

    // Balayage periodique en regime de croisiere.
    const sweep = setInterval(() => {
      if (this.sweeping) return; // evite le chevauchement si un cycle traine
      this.sweeping = true;
      void Promise.allSettled([
        this.run({ quiet: true }),
        this.sweepStaleAssigned(),
      ]).finally(() => {
        this.sweeping = false;
      });
    }, SWEEP_INTERVAL_MS);
    sweep.unref();
  }

  /**
   * Annule les courses acceptees par un chauffeur mais bloquees (aucune transition
   * de statut depuis STALE_ASSIGNED_MS) et libere ainsi le chauffeur, qui sinon
   * restait exclu de tout dispatch (garde-fou anti double-course).
   */
  async sweepStaleAssigned(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_ASSIGNED_MS);
    let stale: { id: string; serviceType: string; driverId: string | null }[];
    try {
      stale = await this.prisma.trip.findMany({
        where: {
          status: { in: [TripStatus.accepted, TripStatus.driver_arriving] },
          updatedAt: { lt: cutoff },
        },
        select: { id: true, serviceType: true, driverId: true },
      });
    } catch (err) {
      this.logger.error(`Balayage courses assignees bloquees echoue: ${(err as Error).message}`);
      return;
    }
    for (const trip of stale) {
      try {
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: { status: TripStatus.cancelled_auto, cancelReason: 'driver_unresponsive' },
        });
        await this.dispatch.releaseLocksForTrip(trip.id);
        const wsEvent = getWsEventForService(trip.serviceType, TripStatus.cancelled_auto);
        if (wsEvent) {
          this.broadcast.emitToTrip(trip.id, wsEvent, {
            tripId: trip.id,
            reason: 'driver_unresponsive',
          });
        }
        this.logger.warn(
          `Course ${trip.id} bloquee (chauffeur ${trip.driverId ?? '?'} injoignable) -> cancelled_auto, chauffeur libere`,
        );
      } catch (err) {
        this.logger.error(
          `Annulation course bloquee ${trip.id} echouee: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Balaie les courses `pending` orphelines. Idempotent.
   * [quiet] : appel periodique — ne log que si une action a ete prise, et ignore
   * les courses trop fraiches (dispatch initial encore en cours).
   */
  async run(opts: { quiet?: boolean } = {}): Promise<void> {
    const { quiet = false } = opts;
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
      if (!quiet) this.logger.log('Aucune course pending orpheline au demarrage');
      return;
    }

    if (!quiet) {
      this.logger.warn(
        `${pending.length} course(s) pending orpheline(s) detectee(s) au demarrage — reprise en cours`,
      );
    }

    const now = Date.now();
    const failReason = quiet ? 'no_drivers_available' : 'server_restarted';
    for (const trip of pending) {
      const ageMs = now - trip.createdAt.getTime();
      const ageSec = Math.round(ageMs / 1000);
      // Balayage periodique : on ignore une course dont le dispatch initial est
      // sans doute encore en cours.
      if (quiet && ageMs < REDISPATCH_MIN_AGE_MS) continue;
      try {
        if (ageMs > REDISPATCH_MAX_AGE_MS) {
          this.dispatch.failTrip(trip.id, failReason);
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
