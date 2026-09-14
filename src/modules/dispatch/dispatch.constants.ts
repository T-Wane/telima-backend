export const DispatchConstants = {
  SearchRadiusMeters: 5000,
  MaxAttempts: 3,
  LockTtlSeconds: 30,
  TimeoutMs: 15000,
} as const;

export const DispatchLockKey = (driverId: string) => `telima:driver:dispatch:${driverId}`;

export const DispatchTimeoutJobKey = (tripId: string, driverId: string) =>
  `telima:dispatch:timeout_job:${tripId}:${driverId}`;

// Nombre de "rounds" de dispatch tentes pour une course (1 round = 1 vague de
// notifications a un ou plusieurs chauffeurs). Sert a plafonner les retries :
// avec un seul chauffeur candidat, l'ancien code comptait les lignes
// DispatchAttempt (upsert -> toujours 1 ligne pour ce chauffeur), donc le
// seuil maxDispatchAttempts n'etait jamais atteint et le refus relancait ce
// meme chauffeur a l'infini (cf. bug constate en test le 2026-09-14).
export const DispatchRoundsKey = (tripId: string) => `telima:dispatch:rounds:${tripId}`;
