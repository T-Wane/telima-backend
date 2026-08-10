import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { DistanceMatrixResult, DistanceProvider } from './distance-provider.interface';
import { REDIS_CLIENT } from '../../../redis/redis.module';

// Implémentation Google Distance Matrix avec cache Redis et fallback Haversine.
// - Cache Redis (TTL 1h) pour éviter les appels API répétés sur les mêmes paires.
// - Fallback Haversine si l'API Google échoue (timeout, quota, erreur réseau).
// - Mode motorcycle non supporté par Google : correction x0.7 distance, x0.6 durée.
//
// Activation : DISTANCE_PROVIDER=google + GOOGLE_MAPS_API_KEY renseignée.
@Injectable()
export class GoogleDistanceProvider implements DistanceProvider {
  private readonly logger = new Logger('GoogleDistanceProvider');
  private readonly apiKey: string;
  private readonly cacheTtl: number;
  private static readonly CACHE_PREFIX = 'telima:distance:';

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY') ?? '';
    this.cacheTtl = this.config.get<number>('GOOGLE_MAPS_CACHE_TTL', 3600);
  }

  async getDistanceMatrix(params: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    mode?: 'driving' | 'walking' | 'motorcycle';
  }): Promise<DistanceMatrixResult> {
    const cacheKey = this.buildCacheKey(params.origin, params.destination, params.mode);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const result = await this.callGoogleApi(params);
      await this.redis.setex(cacheKey, this.cacheTtl, JSON.stringify(result));
      return result;
    } catch (error) {
      this.logger.warn(`Google API failed, falling back to Haversine: ${(error as Error).message}`);
      const fallback = this.haversineFallback(params);
      await this.redis.setex(cacheKey, this.cacheTtl, JSON.stringify(fallback));
      return fallback;
    }
  }

  async getRouteDistance(params: {
    waypoints: { lat: number; lng: number }[];
    mode?: 'driving' | 'walking' | 'motorcycle';
  }): Promise<{
    totalDistanceMeters: number;
    totalDurationSeconds: number;
    legs: DistanceMatrixResult[];
  }> {
    const legs: DistanceMatrixResult[] = [];
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;

    for (let i = 0; i < params.waypoints.length - 1; i++) {
      const leg = await this.getDistanceMatrix({
        origin: params.waypoints[i],
        destination: params.waypoints[i + 1],
        mode: params.mode,
      });
      legs.push(leg);
      totalDistanceMeters += leg.distanceMeters;
      totalDurationSeconds += leg.durationSeconds;
    }

    return { totalDistanceMeters, totalDurationSeconds, legs };
  }

  private async callGoogleApi(params: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    mode?: 'driving' | 'walking' | 'motorcycle';
  }): Promise<DistanceMatrixResult> {
    const mode = params.mode ?? 'driving';
    const googleMode = mode === 'walking' ? 'walking' : 'driving';

    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${params.origin.lat},${params.origin.lng}` +
      `&destinations=${params.destination.lat},${params.destination.lng}` +
      `&mode=${googleMode}&key=${this.apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google API HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
      throw new Error(`Google API status: ${data.status}`);
    }

    const element = data.rows[0].elements[0];
    let distanceMeters = element.distance.value;
    let durationSeconds = element.duration.value;

    if (mode === 'motorcycle') {
      distanceMeters = Math.round(distanceMeters * 0.7);
      durationSeconds = Math.round(durationSeconds * 0.6);
    }

    return {
      origin: params.origin,
      destination: params.destination,
      distanceMeters,
      durationSeconds,
      distanceText: element.distance.text,
      durationText: element.duration.text,
    };
  }

  private haversineFallback(params: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  }): DistanceMatrixResult {
    const R = 6371000;
    const dLat = ((params.destination.lat - params.origin.lat) * Math.PI) / 180;
    const dLng = ((params.destination.lng - params.origin.lng) * Math.PI) / 180;
    const lat1 = (params.origin.lat * Math.PI) / 180;
    const lat2 = (params.destination.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    const distanceMeters = Math.round(2 * R * Math.asin(Math.sqrt(h)));
    const durationSeconds = Math.round((distanceMeters / 1000 / 30) * 3600);

    this.logger.warn(`Haversine fallback: ${distanceMeters}m, ${durationSeconds}s (30km/h estimé)`);

    return {
      origin: params.origin,
      destination: params.destination,
      distanceMeters,
      durationSeconds,
      distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
      durationText: `${Math.round(durationSeconds / 60)} min`,
    };
  }

  private buildCacheKey(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode?: string,
  ): string {
    const o = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
    const d = `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    return `${GoogleDistanceProvider.CACHE_PREFIX}${o}:${d}:${mode ?? 'driving'}`;
  }
}
