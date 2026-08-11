import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingContext } from './interfaces/pricing-context.interface';

interface DynamicCondition {
  type: 'zone' | 'time_range';
  zoneId?: string;
  from?: string; // "HH:mm"
  to?: string;
}

// Surge dynamique (Sprint 5) : calcule le multiplicateur a appliquer au prix
// en fonction des zones de service actives (surge zone-specifique si le pickup
// est dans le rayon) et des regles de tarification actives (PricingRule).
// Cache court (60s) pour eviter une requete DB par calcul de prix.
@Injectable()
export class DynamicPricingService {
  private readonly logger = new Logger(DynamicPricingService.name);
  private cache: { zones: ZoneEntry[]; rules: RuleEntry[]; loadedAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  private async loadData(): Promise<{ zones: ZoneEntry[]; rules: RuleEntry[] }> {
    if (this.cache && Date.now() - this.cache.loadedAt < DynamicPricingService.CACHE_TTL_MS) {
      return { zones: this.cache.zones, rules: this.cache.rules };
    }
    const [zones, rules] = await Promise.all([
      this.prisma.serviceZone.findMany({ where: { isActive: true } }),
      this.prisma.pricingRule.findMany({
        where: { isActive: true },
        orderBy: { priority: 'asc' },
      }),
    ]);
    this.cache = {
      zones: zones.map((z) => ({
        id: z.id,
        centerLat: z.centerLat,
        centerLng: z.centerLng,
        radiusKm: z.radiusKm,
        surgeMultiplier: Number(z.surgeMultiplier),
      })),
      rules: rules.map((r) => ({
        serviceType: r.serviceType,
        vehicleTypeId: r.vehicleTypeId,
        zoneId: r.zoneId,
        condition: r.condition as unknown as DynamicCondition,
        modifier: Number(r.modifier),
      })),
      loadedAt: Date.now(),
    };
    return this.cache;
  }

  // Invalide le cache (appele par les mutations admin zones/regles).
  invalidateCache(): void {
    this.cache = null;
  }

  // Multiplicateur combine : surge de la zone contenant le pickup x modificateurs
  // des regles applicables (serviceType/vehicleType/condition matchees).
  async getSurgeMultiplier(context: PricingContext): Promise<number> {
    const { zones, rules } = await this.loadData();
    let multiplier = 1;

    // Surge de zone : si le pickup est dans une zone active, appliquer son surge.
    const containingZone = zones.find((z) =>
      this.isWithinRadius(context.pickupLat, context.pickupLng, z),
    );
    if (containingZone) {
      multiplier *= containingZone.surgeMultiplier;
    }

    // Regles dynamiques applicables.
    for (const rule of rules) {
      if (rule.serviceType && rule.serviceType !== context.serviceType) continue;
      if (rule.vehicleTypeId && rule.vehicleTypeId !== context.vehicleTypeId) continue;
      if (this.isConditionMatched(rule.condition, context, containingZone?.id)) {
        multiplier *= rule.modifier;
      }
    }

    if (multiplier !== 1) {
      this.logger.debug(`Surge dynamique applique : x${multiplier.toFixed(2)}`);
    }
    return Math.round(multiplier * 100) / 100;
  }

  private isConditionMatched(
    condition: DynamicCondition,
    context: PricingContext,
    matchedZoneId?: string,
  ): boolean {
    if (!condition || !condition.type) return false;
    if (condition.type === 'zone') {
      return condition.zoneId != null && condition.zoneId === matchedZoneId;
    }
    if (condition.type === 'time_range') {
      if (!condition.from || !condition.to) return false;
      const hh = context.requestedAt.getHours();
      const mm = context.requestedAt.getMinutes();
      const now = hh * 60 + mm;
      const [fh, fm] = condition.from.split(':').map(Number);
      const [th, tm] = condition.to.split(':').map(Number);
      const from = fh * 60 + fm;
      const to = th * 60 + tm;
      // Plage horaire simple (meme journee) ; les plages traversant minuit ne sont pas gerees.
      return now >= from && now < to;
    }
    return false;
  }

  // Distance haversine en km entre le point et le centre de la zone.
  private isWithinRadius(lat: number, lng: number, zone: ZoneEntry): boolean {
    const R = 6371;
    const dLat = this.toRad(zone.centerLat - lat);
    const dLng = this.toRad(zone.centerLng - lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat)) * Math.cos(this.toRad(zone.centerLat)) * Math.sin(dLng / 2) ** 2;
    const distance = 2 * R * Math.asin(Math.sqrt(a));
    return distance <= zone.radiusKm;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

interface ZoneEntry {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  surgeMultiplier: number;
}

interface RuleEntry {
  serviceType: string | null;
  vehicleTypeId: string | null;
  zoneId: string | null;
  condition: DynamicCondition;
  modifier: number;
}
