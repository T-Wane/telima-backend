export const DispatchConstants = {
  SearchRadiusMeters: 5000,
  MaxAttempts: 3,
  LockTtlSeconds: 30,
  TimeoutMs: 15000,
} as const;

export const DispatchLockKey = (driverId: string) => `telima:driver:dispatch:${driverId}`;
