export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface NearbyDriver {
  driverId: string;
  distanceMeters: number;
  lat: number;
  lng: number;
  rating: number;
  vehicleTypeId: string;
  vehicleBrand: string;
  vehicleModel: string;
  plateNumber: string;
}
