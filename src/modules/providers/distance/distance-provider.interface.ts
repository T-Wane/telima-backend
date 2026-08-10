// Interface decouplee de toute implementation concrete de calcul de distance/duree.
// Permet de brancher Google Distance Matrix (ou un autre fournisseur) sans toucher
// au module Pricing ou Dispatch : seul ce contrat compte pour les consommateurs.
//
// Utilisee pour:
//   - Estimation de tarif (Pricing, Sprint 2)
//   - Estimation de temps d'arrivee chauffeur (Dispatch, Sprint 2)
//   - Recalcul d'itineraire en cours de course (Tracking, Sprint 3)

export interface DistanceMatrixResult {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  distanceMeters: number;
  durationSeconds: number;
  distanceText: string;
  durationText: string;
}

export interface DistanceProvider {
  // Calcule la distance et la duree entre deux points.
  getDistanceMatrix(params: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    mode?: 'driving' | 'walking' | 'motorcycle';
  }): Promise<DistanceMatrixResult>;

  // Calcule la distance et la duree pour un itineraire a plusieurs etapes
  // (utile pour les courses de livraison avec points de passage).
  getRouteDistance(params: {
    waypoints: { lat: number; lng: number }[];
    mode?: 'driving' | 'walking' | 'motorcycle';
  }): Promise<{
    totalDistanceMeters: number;
    totalDurationSeconds: number;
    legs: DistanceMatrixResult[];
  }>;
}

export const DISTANCE_PROVIDER = Symbol('DISTANCE_PROVIDER');
