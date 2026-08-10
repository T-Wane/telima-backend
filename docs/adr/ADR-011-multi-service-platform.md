# ADR-011: Multi-Service Platform Architecture

**Date:** 2026-07-07  
**Status:** Accepted  
**Sprint:** 2.5 (Architecture Review)

## Context

The Telima backend was initially designed for two services: VTC (`ride`) and delivery (`delivery`). The platform must now support future services — meal delivery (`food`), roadside assistance (`assistance`), intercity transport (`intercity`), and potentially others — without requiring a complete refactoring for each new service.

### Problems Identified in Current Architecture

1. **`ServiceType` enum** limited to `ride | delivery` — adding a service required code changes across multiple modules
2. **Delivery fields on `Trip` table** (`recipientName`, `recipientPhone`, `parcelDescription`) — mixing service-specific data with generic trip data
3. **No multi-stop support** — only `pickup` and `dropoff` on `Trip`, no intermediate waypoints
4. **Hard-coded lifecycle** — single `TRANSITIONS` map for all services
5. **Hard-coded WS events** — `ride:*` and `delivery:*` event names mapped directly in `TripsService`
6. **`PriceQuoteInput.serviceType`** typed as `'ride' | 'delivery'` (closed union)
7. **Dispatch fallback** hard-coded `serviceType: 'ride'` and `{ lat: 0, lng: 0 }` for pickup
8. **No driver/vehicle capabilities** — impossible to filter drivers by equipment (thermal bag, tow rope, etc.)
9. **All dispatch config hard-coded** in `DispatchConstants` — same radius, timeout, max attempts for all services

## Alternatives Considered

### Option A: Enum extensible + Detail tables + TripStop + Capabilities + ServiceConfig (Chosen)

- Extend `ServiceType` enum via Prisma migration
- `TripStop` table for ordered multi-stop trips
- `RideDetails` / `DeliveryDetails` tables (1:1 with Trip)
- `Capability` / `DriverCapability` / `VehicleTypeCapability` for filtering
- `ServiceConfig` table for data-driven dispatch/pricing configuration

**Pros:** Type-safe, queryable, clean separation, each service owns its details, extensible without code changes
**Cons:** More tables, joins required, more migrations

### Option B: JSONB + ServiceType string

- Store service-specific details as JSONB on Trip
- `ServiceType` as free-form string

**Pros:** No new tables, maximum flexibility
**Cons:** No type safety, validation complexity, schema drift, difficult to index/query

### Option C: Single Table Inheritance (STI)

- All possible columns on Trip, `serviceType` determines relevant ones

**Pros:** Simple, single table
**Cons:** Sparse table, many nullable columns, schema pollution as services grow

### Option D: Class Table Inheritance (CTI)

- Base `Trip` + sub-tables per service type

**Pros:** Normalized
**Cons:** Prisma does not support CTI natively, complex queries (UNION), poor ORM fit

## Decision

**Option A** was chosen as the most scalable and pragmatic approach:

### Schema Changes

1. **`ServiceType` enum** extended with `food`, `assistance`, `intercity`
   - Adding a new service = `ALTER TYPE ADD VALUE` migration + `ServiceConfig` entry
   - No code changes needed for the enum itself

2. **`TripStop` model** — ordered multi-stop trips
   - `sequence` field for ordering, `StopType` enum (`pickup`, `dropoff`, `waypoint`)
   - PostGIS `location` column (same pattern as Trip)
   - `arrivedAt` / `completedAt` for tracking stop progression
   - Trip retains `pickup`/`dropoff` for backward compatibility

3. **`RideDetails` / `DeliveryDetails`** — 1:1 with Trip
   - `RideDetails`: `passengerCount`, `notes`
   - `DeliveryDetails`: `recipientName`, `recipientPhone`, `parcelDescription`, `parcelWeightKg`, `parcelDimensions`, `isFragile`, `notes`
   - Created conditionally based on `serviceType` in `TripsService.createTrip()`
   - Old delivery fields removed from `Trip` table

4. **`Capability` model** — reusable capabilities
   - `DriverCapability` (many-to-many: Driver ↔ Capability)
   - `VehicleTypeCapability` (many-to-many: VehicleType ↔ Capability)
   - `ServiceRequirement` (ServiceConfig ↔ Capability, with `required` / `preferred` level)

5. **`ServiceConfig` model** — data-driven configuration
   - `dispatchRadiusMeters`, `maxDispatchAttempts`, `lockTtlSeconds`, `dispatchTimeoutMs`
   - `surgeEnabled`, `maxSurgeMultiplier`
   - `isEnabled` flag to activate/deactivate services without code changes
   - `ServiceConfigService` reads config with in-memory cache (60s TTL)

### Code Changes

1. **`TripRepository`** — removed delivery fields from `insertWithGeometry`, added `createDeliveryDetails()`, `createRideDetails()`, `createTripStop()`, `markStopArrived()`, `markStopCompleted()`

2. **`TripsService.createTrip()`** — creates service-specific details after trip insertion based on `serviceType`

3. **`DispatchService`** — uses `ServiceConfigService.getDispatchConfig()` instead of hard-coded `DispatchConstants`; retry fetches actual `serviceType` and pickup from DB

4. **`QueueService.scheduleDispatchTimeout()`** — `delayMs` is now a required parameter (passed from service config)

5. **`PricingService.PriceQuoteInput`** — `serviceType` changed from `'ride' | 'delivery'` to `ServiceType` enum

6. **WS Events** — `getWsEventForService(serviceType, status)` function replaces hard-coded `eventMap` in `TripsService.broadcastStatusEvent()`, `handleDispatchFailed()`, `handleDriverAssigned()`

7. **`TripCreatedEvent`** — `serviceType` typed as `ServiceType` enum instead of `string`

8. **`ServiceConfigModule`** — global module providing `ServiceConfigService` to all modules

### Seed Data

`prisma/seed-service-config.ts` initializes:
- 5 `ServiceConfig` entries (ride, delivery, food, intercity, assistance)
- 9 `Capability` entries (thermal_bag, cargo_box, first_aid_kit, tow_rope, jump_starter, 4_seats, 2_wheels, ac, first_aid_cert)

## Consequences

### Positive

- **Adding a new service** requires only: (1) `ALTER TYPE` migration, (2) `ServiceConfig` DB entry, (3) optional detail table, (4) optional WS event mapping. No core code changes.
- **Service-specific dispatch config** — intercity can have 10km radius and 30s timeout while food has 4km and 12s
- **Capability-based driver filtering** — food service can require `thermal_bag`, assistance can require `tow_rope`
- **Multi-stop trips** — enables complex routes for delivery and intercity
- **Type safety preserved** — Prisma generates types for all new models

### Negative

- **More complex schema** — 7 new tables, more joins in queries
- **Migration required** for new ServiceType values (but simple `ALTER TYPE ADD VALUE`)
- **ServiceConfig cache** — 60s TTL means config changes take up to 1 minute to propagate (acceptable for non-hot-path config)
- **`DispatchConstants` deprecated** but kept as fallback defaults in `ServiceConfigService`

### Migration Path

- Existing trips: delivery fields (`recipientName`, `recipientPhone`, `parcelDescription`) were removed from the `Trip` table. The migration drops these columns. Existing data would need to be migrated to `DeliveryDetails` if present. Since the database was reset during development, no data migration was needed.
- `DispatchConstants` kept as code-level fallback when no `ServiceConfig` exists in DB.

## References

- [Prisma Schema](../../prisma/schema.prisma) — new models and extended enum
- [ServiceConfigService](../../src/modules/service-config/service-config.service.ts) — data-driven config reader
- [WS Event Mapper](../../src/modules/events/events.constants.ts) — `getWsEventForService()` function
- [Seed Script](../../prisma/seed-service-config.ts) — initial service configs and capabilities
- ADR-003: Dispatch↔Trips direct call exception (still applies)
- ADR-004: Redis SETNX dispatch locks (now uses per-service TTL from ServiceConfig)
