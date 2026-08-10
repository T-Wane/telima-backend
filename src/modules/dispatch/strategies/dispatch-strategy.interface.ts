import { NearbyDriver } from '../../geolocation/geolocation.types';

export interface DispatchResult {
  success: boolean;
  notifiedDrivers: NearbyDriver[];
  tripId: string;
}

export interface DispatchStrategy {
  findCandidates(
    point: { lat: number; lng: number },
    serviceType?: string,
  ): Promise<NearbyDriver[]>;
}
