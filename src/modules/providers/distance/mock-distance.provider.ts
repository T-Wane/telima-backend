import { Injectable, Logger } from '@nestjs/common';
import { DistanceMatrixResult, DistanceProvider } from './distance-provider.interface';

// Implementation active tant que la cle API Google Maps n'est pas disponible.
// Calcule la distance a vol d'oiseau (Haversine) et estime la duree a 30 km/h en ville.
// Sert de repli pour les tests et le developpement local sans dependance externe.
@Injectable()
export class MockDistanceProvider implements DistanceProvider {
  private readonly logger = new Logger('MockDistanceProvider');

  async getDistanceMatrix(params: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  }): Promise<DistanceMatrixResult> {
    const distanceMeters = this.haversine(params.origin, params.destination);
    const durationSeconds = Math.round((distanceMeters / 1000 / 30) * 3600);

    this.logger.log(
      `[MOCK DISTANCE] ${distanceMeters}m, ${durationSeconds}s (Haversine, 30km/h estime)`,
    );

    return {
      origin: params.origin,
      destination: params.destination,
      distanceMeters,
      durationSeconds,
      distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
      durationText: `${Math.round(durationSeconds / 60)} min`,
    };
  }

  async getRouteDistance(params: { waypoints: { lat: number; lng: number }[] }): Promise<{
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
      });
      legs.push(leg);
      totalDistanceMeters += leg.distanceMeters;
      totalDurationSeconds += leg.durationSeconds;
    }

    return { totalDistanceMeters, totalDurationSeconds, legs };
  }

  private haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }
}
