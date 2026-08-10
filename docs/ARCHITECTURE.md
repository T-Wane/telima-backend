# Architecture Telima Backend — Sprint 2+ Design

> Document de conception architecturale pour les modules Trips, Dispatch, Pricing,
> Payments, Events, WebSocket, BullMQ, Geolocation et Domain Events.
>
> Objectif : une architecture qui évolue sans refonte lorsque nous ajouterons de
> nouveaux services, modes de paiement, promotions, battery swap ou autres fonctionnalités.

---

## 1. Vue d'ensemble des modules

```
src/
├── common/                    (Sprint 1 — existant)
│   ├── decorators/            @Public, @Roles, @CurrentUser
│   ├── filters/               HttpExceptionFilter
│   ├── guards/                RolesGuard
│   └── interceptors/          ResponseInterceptor
│
├── config/                    (Sprint 1 — existant)
│   └── env.validation.ts
│
├── prisma/                    (Sprint 1 — existant, @Global)
├── redis/                     (Sprint 1 — existant, @Global, shared Redis client)
│
├── modules/
│   ├── auth/                  (Sprint 1 — existant)
│   ├── users/                 (Sprint 1 — existant)
│   ├── drivers/               (Sprint 1 — existant)
│   ├── vehicle-types/         (Sprint 1 — existant)
│   ├── health/                (Sprint 1 — existant)
│   ├── sms/                   (Sprint 1 — existant, provider interne)
│   ├── storage/               (Sprint 1 — existant, provider interne)
│   │
│   ├── providers/             (Sprint 1 — providers externes abstraits)
│   │   ├── payment/           PaymentProvider (mock + Orange Money stub)
│   │   ├── distance/          DistanceProvider (mock + Google Maps stub)
│   │   └── push/              PushProvider (mock + FCM stub)
│   │
│   ├── domain-events/         (Sprint 2 — IMPLÉMENTÉ, Event Bus interne EventEmitter2)
│   │   ├── domain-events.module.ts    @Global, wrap EventEmitterModule
│   │   ├── domain-events.constants.ts Noms canoniques de tous les événements
│   │   └── events/domain-events.ts    Interfaces typées des payloads
│   │
│   ├── geolocation/           (Sprint 2 — IMPLÉMENTÉ, abstraction PostGIS UNIQUE)
│   │   ├── geolocation.module.ts
│   │   ├── geolocation.service.ts     updateDriverLocation, findNearbyDrivers, calculateDistance
│   │   └── geolocation.types.ts       GeoPoint, NearbyDriver
│   │
│   ├── pricing/               (Sprint 2 — IMPLÉMENTÉ, moteur basé sur règles)
│   │   ├── pricing.module.ts
│   │   ├── pricing.service.ts          calculatePrice() — point d'entrée
│   │   ├── pricing-engine.service.ts   Parcourt les règles par priorité
│   │   ├── interfaces/pricing-context.interface.ts
│   │   └── rules/
│   │       ├── pricing-rule.interface.ts
│   │       └── base-fare.rule.ts       base_fare + price_per_km + price_per_min
│   │
│   ├── events/                (Sprint 2 — IMPLÉMENTÉ, Gateway WebSocket + Redis adapter)
│   │   ├── events.module.ts
│   │   ├── events.gateway.ts           @WebSocketGateway, délègue aux sous-services
│   │   ├── events.constants.ts         Noms d'événements WS canoniques
│   │   ├── guards/ws-jwt.guard.ts      Auth JWT sur WebSocket
│   │   ├── services/
│   │   │   ├── rooms.service.ts        Gestion des rooms (user, driver, trip)
│   │   │   ├── presence.service.ts     Présence chauffeurs (Redis sorted set)
│   │   │   └── broadcast.service.ts    emitToUser, emitToDriver, emitToTrip
│   │   └── handlers/
│   │       ├── connection.handler.ts   Auth, join rooms, set online
│   │       └── disconnection.handler.ts Cleanup, set offline
│   │
│   ├── queue/                 (Sprint 2 — IMPLÉMENTÉ, BullMQ)
│   │   ├── queue.module.ts             BullModule.forRoot + registerQueue
│   │   ├── queue.constants.ts          Noms des queues
│   │   ├── queue.service.ts            scheduleDispatchTimeout, cancelDispatchTimeout
│   │   └── processors/dispatch/
│   │       └── dispatch-timeout.processor.ts  Timeout → DispatchService
│   │
│   ├── dispatch/              (Sprint 2 — IMPLÉMENTÉ, DÉCOUPLÉ de Trips via events)
│   │   ├── dispatch.module.ts
│   │   ├── dispatch.service.ts         attemptDispatch, handleDriverTimeout, handleDriverAccept
│   │   ├── dispatch.constants.ts       Rayon, max tentatives, TTL lock
│   │   ├── handlers/
│   │   │   └── trip-created.handler.ts @OnEvent(TripCreated) → démarre dispatch
│   │   └── strategies/
│   │       └── dispatch-strategy.interface.ts
│   │
│   ├── trips/                 (Sprint 2 — IMPLÉMENTÉ, cycle de vie des courses)
│   │   ├── trips.module.ts
│   │   ├── trips.controller.ts         POST /trips, GET /trips/me, GET /trips/:id, PATCH /trips/:id/status
│   │   ├── trips.service.ts            Orchestration + publication Domain Events
│   │   ├── handlers/
│   │   │   └── trip-event.handler.ts   @OnEvent(DispatchFailed, DriverAssigned)
│   │   ├── dto/
│   │   │   ├── create-trip.dto.ts
│   │   │   └── update-trip-status.dto.ts
│   │   └── interfaces/
│   │       └── trip-lifecycle.interface.ts   États + transitions autorisées
│   │
│   ├── tracking/              (Sprint 3 — tracking GPS temps réel)
│   ├── chat/                  (Sprint 3 — messagerie in-app + audio S3)
│   ├── notifications/         (Sprint 3 — orchestration push notifications)
│   │
│   ├── payments/              (Sprint 4 — commissions + webhook Orange Money)
│   ├── commissions/           (Sprint 4 — agrégation et suivi des commissions)
│   │
│   ├── battery-swap/          (Sprint 5 — annuaire stations + CRUD admin)
│   └── back-office/           (Sprint 5 — endpoints admin globaux)
```

---

## 2. Domain Events (Event Bus interne)

**Responsabilité** : Permettre aux modules de réagir aux événements métier sans couplage
fort. Les modules publient des événements ; les modules intéressés s'y abonnent.
Aucun module ne connaît les abonnés.

```
domain-events/
├── domain-events.module.ts          @Global module, fournit EventBus
├── domain-event.bus.ts              publish(event), subscribe(eventType, handler)
├── domain-events.constants.ts       Noms de tous les événements
└── events/                          Définitions typées des payloads
    ├── trip-created.event.ts
    ├── trip-accepted.event.ts
    ├── trip-started.event.ts
    ├── trip-completed.event.ts
    ├── trip-cancelled.event.ts
    ├── payment-succeeded.event.ts
    ├── driver-online.event.ts
    └── driver-offline.event.ts
```

**Événements canoniques** :

| Événement | Émis par | Payload | Abonnés futurs |
|---|---|---|---|
| `TripCreated` | TripsService | tripId, clientId, pickup, dropoff, vehicleTypeId | Dispatch, Pricing |
| `TripAccepted` | TripsService | tripId, driverId | Events (WS broadcast), Notifications |
| `TripStarted` | TripsService | tripId, driverId | Events (WS broadcast), Tracking |
| `TripCompleted` | TripsService | tripId, driverId, finalPrice | Commissions, Notifications |
| `TripCancelled` | TripsService | tripId, cancelledBy, reason | Dispatch (libération locks), Notifications |
| `PaymentSucceeded` | PaymentsService | transactionId, driverId, amount | Commissions, Notifications |
| `DriverOnline` | TrackingService | driverId, location | Dispatch (pool disponible) |
| `DriverOffline` | TrackingService | driverId | Dispatch (retrait du pool) |

**Implémentation** : NestJS `EventEmitter2` avec wildcard et maxListeners configurés.
Les handlers utilisent `@OnEvent(DomainEvents.TripCreated)`. Le bus est synchrone par
défaut, asynchrone si nécessaire via `async` handlers.

**Règle** : Un module ne peut pas appeler directement un autre module métier. Il doit
publier un événement. Exemple : `TripsService` ne peut pas appeler `NotificationsService.send()`.
Il publie `TripAccepted`, et `NotificationsService` s'y abonne.

**Exception documentée** : `TripsService` importe `DispatchService` pour les méthodes
`handleDriverAccept()`, `handleDriverDecline()` et `releaseLocksForTrip()`. Cette
dépendance directe est un compromis pragmatique : le flux accept/decline nécessite
une coordination synchrone (libération des locks Redis, mise à jour des dispatch_attempts).
La création de course et le dispatch restent découplés via `TripCreated` → `TripCreatedHandler`.
Le flux `DispatchFailed` → `TripsService` reste event-driven via `TripEventHandler`.

---

## 3. Modules Sprint 2 — Responsabilités et dépendances

### 3.1 Trips Module

**Responsabilité** : Cycle de vie d'une course (création, acceptation, démarrage,
completion, annulation). Point d'entrée HTTP pour les clients et chauffeurs.
**Orchestrateur uniquement** — aucune logique de matching, tarification ou géolocalisation.

```
trips/
├── trips.module.ts
├── trips.controller.ts          Endpoints REST
├── trips.service.ts             Orchestration + publication Domain Events
├── dto/
│   ├── create-trip.dto.ts
│   ├── update-trip-status.dto.ts
│   └── trip-query.dto.ts
└── interfaces/
    └── trip-lifecycle.interface.ts   États + transitions autorisées
```

**Dépendances** :
- `EventEmitter2` — publie TripCreated, TripAccepted, TripStarted, TripCompleted, TripCancelled
- `PricingService` — calcule le prix à la création (appel direct, synchrone)
- `DispatchService` — handleDriverAccept, releaseLocksForTrip (exception documentée ci-dessus)
- `BroadcastService` — broadcast WS des changements de statut
- `PrismaService` — persistance (trip create via `$queryRaw` pour PostGIS geometry)

**Règle de découplage Dispatch ↔ Trips** :
- `TripsService` publie `TripCreated` → `TripCreatedHandler` (dans Dispatch) démarre le matching
- `DispatchService` publie `DriverAssigned` → `TripEventHandler` (dans Trips) met à jour le trip
- `DispatchService` publie `DispatchFailed` → `TripEventHandler` annule le trip (cancelled_auto)
- Appel direct `TripsService → DispatchService` uniquement pour accept/decline/cancel (coordination synchrone des locks)

**Machine à états Trip** :
```
pending → accepted → driver_arriving → in_progress → completed
    ↓        ↓           ↓                 ↓
cancelled_by_client / cancelled_by_driver / cancelled_auto
```

### 3.2 Dispatch Module (entièrement découplé de Trips)

**Responsabilité** : Trouver le chauffeur le plus proche, gérer le locking Redis,
gérer les timeouts. **Aucune référence à TripsService** — communication par événements uniquement.

```
dispatch/
├── dispatch.module.ts
├── dispatch.service.ts          attemptDispatch(), handleTimeout(), assignDriver()
├── dispatch.constants.ts        Rayon, max tentatives, TTL lock
├── handlers/
│   └── trip-created.handler.ts  @OnEvent('TripCreated') → démarre le dispatch
├── strategies/
│   └── dispatch-strategy.interface.ts   Interface pour algorithmes de dispatch
└── dto/
    └── nearby-driver.dto.ts     Résultat de recherche de chauffeurs
```

**Dépendances** :
- `GeolocationService` — requêtes PostGIS (findNearbyDrivers)
- `QueueService` (BullMQ) — job de timeout (scheduleDispatchTimeout)
- `BroadcastService` — notifier le chauffeur (trip:new_request via WS)
- `Redis` — SETNX pour le locking (SET key value EX ttl NX)
- `EventEmitter2` — s'abonne à TripCreated via handler, publie DriverAssigned ou DispatchFailed
- `PrismaService` — persistance des DispatchAttempt

**Flow de dispatch découplé** :
1. `TripsService.create()` → persiste le trip → publie `TripCreated`
2. `TripCreatedHandler` (dans Dispatch) reçoit l'événement → appelle `DispatchService.attemptDispatch()`
3. `DispatchService` interroge `GeolocationService.findNearbyDrivers()`
4. Pour chaque candidat : `SETNX driver:dispatch:{driverId} {tripId} TTL 30s`
5. Si lock acquis → emit `trip:new_request` via WebSocket + push notification
6. BullMQ job `dispatch-timeout` programmé (15s par chauffeur)
7. Si le chauffeur accepte → `TripsService` publie `TripAccepted` → `DispatchService` libère les locks
8. Si timeout → `DispatchService` essaie le suivant ou publie `DispatchFailed`
9. `TripsService` s'abonne à `DispatchFailed` → annule le trip (cancelled_auto)

**Extensibilité** : `DispatchStrategy` interface permet de remplacer l'algorithme
sans toucher au reste du module.

### 3.3 Pricing Module (moteur indépendant basé sur des règles)

**Responsabilité** : Calculer le prix d'une course. Moteur basé sur des stratégies
et des règles, pas des calculs dispersés. Sprint 2 = tarif de base. Sprint 4 = moteur
dynamique complet (zones, surge, promotions, événements spéciaux).

```
pricing/
├── pricing.module.ts
├── pricing.service.ts              calculatePrice() — point d'entrée unique
├── pricing-engine.service.ts       Moteur: sélectionne et exécute les règles applicables
├── rules/
│   ├── pricing-rule.interface.ts   Interface d'une règle de tarification
│   ├── base-fare.rule.ts           base_fare + price_per_km + price_per_min (Sprint 2)
│   ├── surge.rule.ts               Multiplicateur surge (Sprint 4 — stub)
│   ├── zone-multiplier.rule.ts     Multiplicateur par zone (Sprint 4 — stub)
│   └── promotion.rule.ts           Promotions/codes promo (Sprint 4 — stub)
├── dto/
│   └── price-quote.dto.ts
└── interfaces/
    └── pricing-context.interface.ts   Contexte passé aux règles (trip, distance, heure, zone)
```

**Dépendances** :
- `DistanceProvider` — distance et durée (getDistanceMatrix)
- `PrismaService` — lecture des VehicleType (tarifs)
- `PricingEngineService` — exécution des règles

**Architecture du moteur** :
1. `PricingService.calculatePrice()` crée un `PricingContext` (trip, distance, durée, heure, position)
2. `PricingEngine` parcourt toutes les règles enregistrées
3. Chaque règle décide si elle est applicable (`isApplicable(context)`) et applique son calcul (`apply(context, currentPrice)`)
4. Le prix final est la composition de toutes les règles applicables
5. Les règles sont ordonnées par priorité (base-fare d'abord, puis multiplicateurs)

**Extensibilité** : Ajouter une règle = créer une nouvelle classe implémentant
`PricingRule` et l'enregistrer dans le module. Aucun changement aux services existants.

### 3.4 Geolocation Module (centralisation PostGIS UNIQUE)

**Responsabilité** : Abstraction unique pour toutes les opérations PostGIS.
**Aucun `$queryRaw` ne doit apparaître ailleurs dans le projet.**

```
geolocation/
├── geolocation.module.ts
├── geolocation.service.ts
│   ├── updateDriverLocation(driverId, lat, lng)    ST_SetSRID(ST_MakePoint, 4326)
│   ├── findNearbyDrivers(point, radiusMeters)       ST_DWithin + ST_Distance
│   ├── calculateDistance(a, b)                      ST_Distance
│   └── getDriverLocation(driverId)                  Lecture simple
└── geolocation.types.ts                             GeoPoint, NearbyDriver
```

**Dépendances** :
- `PrismaService` — `$queryRaw` avec `Prisma.sql` (templates paramétrés)
- `REDIS_CLIENT` — cache optionnel pour les positions récentes (TTL 10s)

**Règle absolue** : Tout `$queryRaw` contenant des fonctions PostGIS (ST_*) doit
être dans `GeolocationService`. Les autres modules utilisent les méthodes publiques
de ce service. Un test automatisé vérifiera cette règle (grep sur `$queryRaw` +
`ST_` en dehors de `geolocation/`).

### 3.5 Events Module (Gateway propre, pas de "god object")

**Responsabilité** : Gateway Socket.io avec Redis adapter. Gestion des rooms,
présence des chauffeurs, connexions et reconnexions. **Découpé en sous-services
pour éviter qu'un seul fichier devienne un god object.**

```
events/
├── events.module.ts
├── events.gateway.ts              @WebSocketGateway — orchestration uniquement
├── events.adapter.ts              Configuration Redis adapter
├── events.constants.ts            Noms d'événements canoniques
├── services/
│   ├── rooms.service.ts           Gestion des rooms: joinRoom(), leaveRoom(), getUserRoom()
│   ├── presence.service.ts        Présence chauffeurs: setOnline(), setOffline(), getOnlineDrivers()
│   └── broadcast.service.ts       emitToUser(), emitToDriver(), broadcastTripUpdate()
├── handlers/
│   ├── connection.handler.ts      handleConnection(): auth JWT, join rooms, reconnexion
│   └── disconnection.handler.ts   handleDisconnect(): cleanup rooms, marquer offline
├── guards/
│   └── ws-jwt.guard.ts            Authentification WebSocket par JWT
└── decorators/
    └── ws-current-user.decorator.ts
```

**Séparation des responsabilités dans le Gateway** :
- `EventsGateway` : déclare les `@SubscribeMessage()` et délègue aux handlers/services
- `RoomsService` : gère l'association socket → room (user:userId, driver:driverId, trip:tripId)
- `PresenceService` : gère le statut online/offline des chauffeurs (Redis sorted set)
- `BroadcastService` : méthodes publiques pour émettre des événements (utilisé par Trips, Dispatch, etc.)
- `ConnectionHandler` : logique de connexion (validation JWT, rejoindre les rooms, reconnexion après déconnexion réseau)
- `DisconnectionHandler` : cleanup (quitter les rooms, marquer offline si pas d'autre socket actif)

**Namespaces et événements** (contrat hybride, cf. décisions actées §1) :
```
/rides     → ride:driver_accepted, ride:driver_arrived, ride:started, ride:completed, ride:cancelled
/delivery  → delivery:pickup_en_route, delivery:parcel_picked_up, delivery:delivered, delivery:client_confirmed, delivery:cancelled
/drivers   → driver:location_update, driver:join_room, driver:rejoin_room, driver:position, driver:online, driver:offline
/trips     → trip:new_request, trip:accept, trip:decline
/payments  → payment:confirmed
/chat      → message:send, message:received (Sprint 3)
```

**Authentification** : JWT dans `socket.handshake.auth.token`. Le `WsJwtGuard`
valide le token et attache l'utilisateur au socket.

**Reconnexion** : Le client envoie `driver:rejoin_room` avec son `driverId` après
reconnexion. `ConnectionHandler` vérifie le JWT, rejoint les rooms, et
`PresenceService` restaure le statut online si le chauffeur était online avant
la déconnexion.

**Dépendances** :
- `JwtModule` — validation token via WsJwtGuard
- `REDIS_CLIENT` — adapter Socket.io (pub/sub duplicate) + présence (sorted set)
- `PrismaService` — résolution userId → driverId dans ConnectionHandler

### 3.6 Queue Module (BullMQ — workers SÉPARÉS par responsabilité)

**Responsabilité** : Workers pour les tâches asynchrones. **Chaque responsabilité
a sa propre queue et son propre processor** — pas de worker unique.

```
queue/
├── queue.module.ts              Enregistre toutes les queues
├── queue.constants.ts           Noms des queues
├── queue.service.ts             addJob(), scheduleRecurring()
└── processors/
    ├── dispatch/
    │   ├── dispatch-queue.module.ts       Queue 'dispatch-timeout'
    │   └── dispatch-timeout.processor.ts  Timeout: chauffeur ne répond pas → suivant
    ├── notifications/
    │   ├── notifications-queue.module.ts  Queue 'notifications'
    │   └── send-notification.processor.ts Envoi push/WS (Sprint 3)
    ├── payments/
    │   ├── payments-queue.module.ts       Queue 'payments-reconciliation'
    │   └── reconcile-payment.processor.ts Vérification statut transaction (Sprint 4)
    └── maintenance/
        ├── maintenance-queue.module.ts    Queue 'maintenance'
        ├── push-cleanup.processor.ts      Nettoyage tokens invalides (Sprint 3)
        └── commission-aggregation.processor.ts  Agrégation quotidienne (Sprint 4)
```

**Queues séparées** :

| Queue | Module | TTL | Retry | Cron | Sprint |
|---|---|---|---|---|---|
| `dispatch-timeout` | dispatch/ | 15s | 0 | — | Sprint 2 |
| `notifications` | notifications/ | — | 3 | — | Sprint 3 |
| `payments-reconciliation` | payments/ | — | 3 | `0 */6 * * *` (toutes les 6h) | Sprint 4 |
| `maintenance` | maintenance/ | — | 3 | — | Sprint 3+ |
| └ push-cleanup | maintenance/ | — | 3 | `0 4 * * 0` (dimanche 4h) | Sprint 3 |
| └ commission-aggregation | maintenance/ | — | 3 | `0 2 * * *` (2h du matin) | Sprint 4 |

**Dépendances** :
- `@nestjs/bullmq` + `bullmq` — framework de queues
- `Redis` — backend BullMQ (même instance que Socket.io adapter, connexion dédiée via BullModule.forRootAsync)
- `DispatchModule` — `forwardRef` pour casser la dépendance circulaire (Queue → Dispatch → Queue)

**Préfixe des queues** : `bull:telima:` (configuré dans BullModule.forRootAsync)

---

## 4. Modules Sprint 3+ (préparation)

### 4.1 Tracking Module (Sprint 3)
- `tracking.controller.ts` — POST `/v1/tracking/location` (chauffeur envoie sa position)
- `tracking.service.ts` — délègue à `GeolocationService.updateDriverLocation()` + broadcast via `BroadcastService`
- Publie `DriverOnline` / `DriverOffline` via DomainEventBus
- Fréquence : 1 update / 3s par chauffeur, cache Redis TTL 10s

### 4.2 Chat Module (Sprint 3)
- `chat.controller.ts` — GET `/v1/trips/:tripId/messages`, POST `/v1/trips/:tripId/messages`
- `chat.service.ts` — persistance `chat_messages` + upload audio via `StorageProvider`
- `chat.gateway.ts` — events `message:send`, `message:received` sur le namespace `/chat`
- Table `ChatMessage` (tripId, senderId, content, audioUrl, createdAt)

### 4.3 Notifications Module (Sprint 3)
- `notifications.service.ts` — orchestre `PushProvider` + `BroadcastService`
- S'abonne aux Domain Events : `TripAccepted`, `TripStarted`, `TripCompleted`, `TripCancelled`, `PaymentSucceeded`, `MessageReceived`
- Décide du canal : push si app fermée, WebSocket si app ouverte
- Table `NotificationLog` pour le suivi et l'évitement de doublons
- Worker BullMQ `notifications` pour l'envoi asynchrone

### 4.4 Payments Module (Sprint 4)
- `payments.controller.ts` — POST `/v1/payments/webhook` (Orange Money), GET `/v1/payments/history`
- `payments.service.ts` — utilise `PaymentProvider`, idempotence via table `payment_webhooks`
- Publie `PaymentSucceeded` via DomainEventBus
- Le client ne paie jamais via cette interface (cash uniquement)

### 4.5 Commissions Module (Sprint 4)
- `commissions.service.ts` — s'abonne à `TripCompleted`, agrège les commissions dues
- BullMQ job `commission-aggregation` à 2h du matin
- S'abonne à `PaymentSucceeded` pour marquer les commissions comme payées
- Endpoint admin : GET `/v1/admin/commissions`, POST `/v1/admin/commissions/:id/mark-paid`

### 4.6 Battery-Swap Module (Sprint 5)
- `battery-swap.controller.ts` — GET `/v1/stations` (public), CRUD admin `/v1/admin/stations`
- `battery-swap.service.ts` — lecture seule pour clients, CRUD pour admin
- Tables : `BatteryStation`, `BatteryStock`

---

## 5. Interfaces de providers (déjà créées)

### 5.1 PaymentProvider
```typescript
interface PaymentProvider {
  initiatePayment(params): Promise<PaymentInitiationResult>;
  queryTransaction(transactionId): Promise<PaymentQueryResult>;
  parseWebhook(headers, body): Promise<PaymentWebhookPayload>;
}
```
- **Mock** : simule un paiement réussi, log les appels
- **OrangeMoney** : stub `NotImplementedException` (Sprint 4)

### 5.2 DistanceProvider
```typescript
interface DistanceProvider {
  getDistanceMatrix(params): Promise<DistanceMatrixResult>;
  getRouteDistance(params): Promise<{ totalDistanceMeters, totalDurationSeconds, legs }>;
}
```
- **Mock** : Haversine + estimation 30 km/h
- **Google** : stub `NotImplementedException` (Sprint 2)

### 5.3 PushProvider
```typescript
interface PushProvider {
  send(notification): Promise<PushResult>;
  sendMulticast(notifications): Promise<PushResult[]>;
  validateToken(token): Promise<boolean>;
}
```
- **Mock** : log les notifications
- **FCM** : stub `NotImplementedException` (Sprint 3)

---

## 6. Graphe de dépendances (Sprint 2 — implémenté)

```
TripsController
    └── TripsService
        ├── PricingService (appel direct, synchrone)
        │   ├── DistanceProvider
        │   ├── PricingEngineService → BaseFareRule
        │   └── PrismaService
        ├── DispatchService (exception: accept/decline/cancel — coordination synchrone locks)
        ├── BroadcastService (WS broadcast changements de statut)
        ├── EventEmitter2 (publie TripCreated, TripAccepted, etc.)
        └── PrismaService

EventEmitter2
    ├── TripCreatedHandler (dans Dispatch)
    │   └── DispatchService.attemptDispatch()
    │       ├── GeolocationService (PostGIS findNearbyDrivers)
    │       ├── QueueService (scheduleDispatchTimeout)
    │       ├── BroadcastService (trip:new_request via WS)
    │       └── Redis (SETNX locks, TTL 30s)
    ├── TripEventHandler (dans Trips)
    │   ├── handleDispatchFailed → cancel trip (cancelled_auto)
    │   └── handleDriverAssigned → update trip status, broadcast ride:driver_accepted
    └── [futurs abonnés: Notifications, Commissions, Analytics]

DispatchTimeoutProcessor (BullMQ worker)
    └── DispatchService.handleDriverTimeout()
        → retry dispatch ou emit DispatchFailed
```

**Dépendance circulaire Queue ↔ Dispatch** : résolue via `forwardRef()` des deux côtés.
QueueModule importe DispatchModule (forwardRef) pour que le processor accède à DispatchService.
DispatchModule importe QueueModule (forwardRef) pour que DispatchService accède à QueueService.

**Principe de découplage respecté** :
- Création de course → dispatch : par événement (TripCreated)
- Dispatch échec → trips : par événement (DispatchFailed)
- Driver assigned → trips : par événement (DriverAssigned)
- Accept/decline/cancel : appel direct (coordination synchrone des locks Redis)
- Les modules providers n'importent aucun module métier
- Les modules Sprint 3+ s'abonnent aux événements sans importer Trips

---

## 7. Extensions futures sans refonte

| Fonctionnalité future | Point d'extension | Impact |
|---|---|---|
| Nouveau mode de paiement (Wave, Moov) | Nouveau `PaymentProvider` impl | Aucun changement métier |
| Nouveau fournisseur de cartes (Mapbox) | Nouveau `DistanceProvider` impl | Aucun changement métier |
| Nouveau fournisseur push (OneSignal) | Nouveau `PushProvider` impl | Aucun changement métier |
| Algorithme de dispatch avancé | Nouvelle `DispatchStrategy` impl | Aucun changement controller |
| Tarification dynamique (zones, surge) | Nouvelle `PricingRule` impl | Aucun changement service |
| Battery-Swap avec paiement | Réutilise `PaymentProvider` | Aucun changement provider |
| Chat avec support vidéo | Réutilise `StorageProvider` | Aucun changement provider |
| Multi-pays (Sénégal, Côte d'Ivoire) | Config env + nouveau `SmsProvider` | Aucun changement métier |
| Analytics / audit | S'abonne aux Domain Events | Aucun changement métier |
| Nouveau module métier | S'abonne aux Domain Events existants | Aucun changement aux modules existants |
| **Nouveau service** (food, assistance, intercity) | **`ServiceConfig` DB entry + enum migration** | **Aucun changement code métier** |
| **Nouvelles capacités chauffeur** | **`Capability` + `DriverCapability` DB** | **Aucun changement code dispatch** |
| **Trajet multi-arrêts** | **`TripStop` table (déjà implémenté)** | **Aucun changement Trip model** |

---

## 7bis. Architecture Multi-Services (Sprint 2.5)

### 7bis.1 Vue d'ensemble

La plateforme Telima supporte désormais une architecture multi-services extensible.
Au lieu d'être limité à `ride` et `delivery`, le backend peut accueillir de nouveaux
services (food, assistance, intercity, etc.) sans modification du code métier.

**Décision architecturale : ADR-011**

### 7bis.2 Modèles ajoutés

| Modèle | Rôle | Relation |
|---|---|---|
| `ServiceConfig` | Configuration par service (dispatch, pricing, activation) | 1 par `serviceType` |
| `TripStop` | Étapes ordonnées d'un trajet (multi-arrêts) | N:1 avec `Trip` |
| `RideDetails` | Détails spécifiques transport de personnes | 1:1 avec `Trip` |
| `DeliveryDetails` | Détails spécifiques livraison (destinataire, colis) | 1:1 avec `Trip` |
| `Capability` | Capacité réutilisable (sac isotherme, trousse, etc.) | Entité de référence |
| `DriverCapability` | Capacité d'un chauffeur | N:M Driver ↔ Capability |
| `VehicleTypeCapability` | Capacité intrinsèque d'un type de véhicule | N:M VehicleType ↔ Capability |
| `ServiceRequirement` | Exigence de capacité pour un service | N:M ServiceConfig ↔ Capability |

### 7bis.3 ServiceType enum

```prisma
enum ServiceType {
  ride        // VTC urbain
  delivery    // Livraison colis
  food        // Livraison repas
  assistance  // Assistance routière
  intercity   // Transport interurbain
}
```

Ajouter un nouveau service = `ALTER TYPE ADD VALUE` + entrée `ServiceConfig`.

### 7bis.4 Configuration data-driven (ServiceConfigService)

`ServiceConfigService` (`src/modules/service-config/`) lit la configuration depuis la DB
avec un cache en mémoire de 60s. Remplace les constantes codées en dur dans `DispatchConstants`.

| Paramètre | Valeur par défaut (ride) | Configurable par service |
|---|---|---|
| `dispatchRadiusMeters` | 5000 | Oui |
| `maxDispatchAttempts` | 3 | Oui |
| `lockTtlSeconds` | 30 | Oui |
| `dispatchTimeoutMs` | 15000 | Oui |
| `surgeEnabled` | false | Oui |
| `maxSurgeMultiplier` | 2.0 | Oui |

### 7bis.5 Mapping WS events par service

`getWsEventForService(serviceType, status)` dans `events.constants.ts` remplace
le `eventMap` hard-codé dans `TripsService`. Chaque service peut mapper ses
propres événements WebSocket pour le même `TripStatus`.

| Service | `accepted` | `in_progress` | `completed` | `cancelled` |
|---|---|---|---|---|
| ride | `ride:driver_accepted` | `ride:started` | `ride:completed` | `ride:cancelled` |
| delivery | `delivery:pickup_en_route` | `delivery:parcel_picked_up` | `delivery:delivered` | `delivery:cancelled` |
| food | `delivery:pickup_en_route` | `delivery:parcel_picked_up` | `delivery:delivered` | `delivery:cancelled` |
| intercity | `ride:driver_accepted` | `ride:started` | `ride:completed` | `ride:cancelled` |
| assistance | `ride:driver_accepted` | `ride:started` | `ride:completed` | `ride:cancelled` |

### 7bis.6 Ajout d'un nouveau service — Checklist

1. `ALTER TYPE "ServiceType" ADD VALUE 'new_service'` (migration Prisma)
2. Insérer une entrée dans `ServiceConfig` (via seed ou admin)
3. Optionnel : créer une table `NewServiceDetails` (1:1 avec Trip)
4. Optionnel : ajouter un mapping WS dans `SERVICE_EVENT_MAP`
5. Optionnel : définir des `ServiceRequirement` (capacités requises)
6. Créer des `VehicleType` avec `serviceType = 'new_service'`

**Aucun changement requis dans :** TripsService, DispatchService, PricingService, QueueService, EventsGateway.

---

## 8. Conventions de code

1. **Pas de logique métier dans les controllers** — uniquement validation, appel service, formatage réponse
2. **Pas de SQL en dehors de `GeolocationService`** — tout PostGIS centralisé (vérifié par test automatisé)
3. **Pas d'appel réseau en dehors des providers** — tout externe derrière une interface
4. **Pas de `console.log`** — utiliser `Logger` NestJS (bridge Pino)
5. **Pas d'erreur brute `throw new Error()`** — utiliser les `HttpException` subclasses
6. **Tous les DTOs ont des décorateurs Swagger** — documentation automatique
7. **Toutes les routes protégées par défaut** — `@Public()` uniquement pour les routes publiques
8. **Toutes les opérations d'écriture multi-tables sont transactionnelles** — `prisma.$transaction()`
9. **Communication inter-modules par Domain Events** — pas d'import direct entre modules métier
10. **Chaque worker BullMQ a sa propre queue et son propre module** — pas de worker unique
11. **Le Gateway WebSocket est découpé en sous-services** — pas de god object
12. **Les $queryRaw utilisent des templates paramétrés** — jamais de concaténation SQL manuelle (Prisma.sql ou tagged templates)
13. **Les transitions d'état sont validées** — canTransition() avant toute mise à jour de statut Trip

---

## 9. Revue Sprint 2 — Sécurité, Performance, Architecture

### 9.1 Revue de sécurité

| Aspect | Statut | Détail |
|---|---|---|
| **Auth WebSocket** | ✅ | WsJwtGuard valide JWT sur chaque connexion, rejet si token manquant/invalide |
| **SQL injection** | ✅ | $queryRaw utilise tagged templates Prisma (paramétré), pas de concaténation |
| **Authorization par rôle** | ✅ | updateStatus vérifie role (driver/client) avant transition |
| **Locks Redis SETNX** | ✅ | TTL 30s empêche deadlocks, libération manuelle sur accept/decline |
| **Validation DTOs** | ✅ | class-validator avec contraintes (IsEnum, IsNumber, Min/Max lat/lng) |
| **Rate limiting** | ✅ | Throttler global 100 req/min, auth 10 req/min (Sprint 1, toujours actif) |
| **PostGIS geometry** | ✅ | ST_MakePoint avec ST_SetSRID 4326, pas de coordonnées brutes en SQL |
| **Trip creation** | ✅ | $queryRaw INSERT avec gen_random_uuid(), pas d'ID client contrôlable |

### 9.2 Revue de performance

| Aspect | Statut | Détail |
|---|---|---|
| **Index GiST PostGIS** | ✅ | pickup_location, dropoff_location, current_location indexés (migration manuelle) |
| **ST_DWithin** | ✅ | Utilise l'index GiST pour recherche spatiale (pas de full scan) |
| **Redis présence** | ✅ | Sorted set avec zremrangebyscore automatique (pas de croissance infinie) |
| **BullMQ jobs** | ✅ | removeOnComplete: true, removeOnFail: 100 (pas d'accumulation) |
| **Dispatch** | ✅ | Max 3 candidats notifiés simultanément (pas de broadcast massif) |
| **Pagination trips** | ✅ | skip/take avec count parallélisé (Promise.all) |
| **Pricing engine** | ✅ | Règles triées par priorité une fois à l'initialisation, pas de re-sort par appel |

### 9.3 Revue d'architecture

| Aspect | Statut | Détail |
|---|---|---|
| **Découplage Dispatch ↔ Trips** | ✅ (avec exception documentée) | Création/échec/assignation par events ; accept/decline/cancel par appel direct (coordination synchrone locks) |
| **Dépendance circulaire Queue ↔ Dispatch** | ✅ | Résolue via forwardRef() des deux côtés |
| **Geolocation centralisé** | ✅ | Tout $queryRaw avec ST_* dans GeolocationService uniquement |
| **Events module non-god-object** | ✅ | Gateway délègue à RoomsService, PresenceService, BroadcastService, ConnectionHandler, DisconnectionHandler |
| **Pricing extensible** | ✅ | PricingRule interface, BaseFareRule implémentée, ajout de règles sans modification existante |
| **Domain Events typés** | ✅ | Interfaces TypeScript pour chaque payload, constantes pour chaque nom d'événement |
| **State machine Trip** | ✅ | canTransition() valide les transitions, getValidTransitions() pour introspection |
| **BullMQ workers séparés** | ✅ | Queue dédiée dispatch-timeout, processor dédié, structure extensible pour futurs workers |
| **Repository layer** | ✅ | TripRepository centralise tout SQL brut ($queryRaw INSERT geometry), services métier sans SQL |
| **Idempotence** | ✅ | IdempotencyInterceptor global, @Idempotent() sur POST /trips et PATCH /trips/:id/status |

---

## 10. Couche Repository — Centralisation SQL

### 10.1 Principe

Tout SQL brut (`$queryRaw`, `$executeRaw`) est interdit dans les services métier.
Deux couches sont autorisées à utiliser du SQL brut :

1. **`GeolocationService`** — Toutes les requêtes PostGIS (`ST_DWithin`, `ST_MakePoint`, `ST_Distance`, `ST_Y`, `ST_X`)
2. **`TripRepository`** — INSERT de trips avec colonnes geometry `Unsupported` par Prisma ORM

Aucun autre service ne doit contenir `$queryRaw` ou `$executeRaw`.

### 10.2 TripRepository

```
src/modules/trips/trip.repository.ts
```

| Méthode | Type d'accès | Description |
|---|---|---|
| `insertWithGeometry(data)` | `$queryRaw` INSERT | Insère un trip avec ST_MakePoint pour pickup/dropoff |
| `findById(tripId)` | `prisma.trip.findUnique` | Récupère un trip avec relations |
| `findDriverByUserId(userId)` | `prisma.driver.findFirst` | Résout userId → driverId |
| `findManyByClient(clientId, skip, take)` | `prisma.trip.findMany + count` | Liste paginée pour clients |
| `findManyByDriver(driverId, skip, take)` | `prisma.trip.findMany + count` | Liste paginée pour chauffeurs |
| `updateStatus(tripId, data)` | `prisma.trip.update` | Met à jour le statut + champs associés |
| `updateStatusIfPending(tripId, status, reason)` | `prisma.trip.updateMany` | Annulation auto (condition status=pending) |
| `assignDriver(tripId, driverId)` | `prisma.trip.update` | Assigne un chauffeur + statut accepted |

**TripsService** ne contient plus aucun appel direct à `PrismaService`. Toutes les
opérations de persistance passent par `TripRepository`.

### 10.3 Convention pour les futurs modules

- Si un modèle Prisma a des colonnes `Unsupported` (PostGIS), créer un Repository dédié
- Le Repository est le seul endroit avec du `$queryRaw`/`$executeRaw` pour ce modèle
- Les services injectent le Repository, jamais `PrismaService` directement pour du SQL brut
- `GeolocationService` reste l'unique point d'accès PostGIS pour les requêtes spatiales sur `drivers`

---

## 11. Gestion de la concurrence — Acceptation simultanée

### 11.1 Problème

Plusieurs chauffeurs peuvent tenter d'accepter la même course simultanément :
- N chauffeurs sont notifiés via WebSocket (`trip:new_request`)
- Chaque chauffeur envoie `PATCH /trips/:id/status` avec `status: accepted`
- Sans protection, plusieurs chauffeurs pourraient être assignés à la même course

### 11.2 Mécanisme de protection

**Trois couches de protection** empêchent l'assignation multiple :

#### Couche 1 : Lock Redis SETNX (préventif)

Lors du dispatch, chaque chauffeur notifié a un lock Redis :
```
SET telima:driver:dispatch:{driverId} {tripId} EX 30 NX
```
Ce lock garantit qu'un chauffeur ne peut pas être notifié pour 2 courses simultanées.
Il ne garantit pas directement l'unicité d'acceptation (plusieurs chauffeurs ont des locks différents pour le même trip).

#### Couche 2 : Vérification du lock dans `handleDriverAccept`

```typescript
async handleDriverAccept(tripId: string, driverId: string): Promise<void> {
  const lockValue = await this.redis.get(lockKey);
  if (lockValue !== tripId) {
    // Le chauffeur n'a pas de lock valide pour ce trip → refus
    return;
  }
  // ... assignation
}
```

#### Couche 3 : Condition `status = 'pending'` dans `updateStatusIfPending`

L'annulation auto utilise `updateMany` avec condition :
```sql
WHERE id = {tripId} AND status = 'pending'
```
Si le trip n'est plus `pending` (déjà accepté), l'update affecte 0 lignes.

### 11.3 Flow détaillé — Acceptation simultanée

```
Trip T en statut 'pending'
Driver A et Driver B reçoivent trip:new_request

Driver A → PATCH /trips/T/status {status: accepted}
  → TripsService.updateStatus()
    → canTransition('pending', 'accepted') = true ✓
    → dispatchService.handleDriverAccept(T, A)
      → redis.get(driver:dispatch:A) === T ✓
      → dispatchAttempt.updateMany(A → driver_accepted)
      → redis.del(driver:dispatch:A)
      → emit DriverAssigned {tripId: T, driverId: A}
    → tripRepo.updateStatus(T, {driverId: A, status: accepted})

Driver B → PATCH /trips/T/status {status: accepted} (concurrent)
  → TripsService.updateStatus()
    → canTransition('pending', 'accepted') = true ✓ (race: trip encore 'pending' en cache)
    → dispatchService.handleDriverAccept(T, B)
      → redis.get(driver:dispatch:B) === T ✓ (lock encore valide)
      → dispatchAttempt.updateMany(B → driver_accepted)
      → redis.del(driver:dispatch:B)
      → emit DriverAssigned {tripId: T, driverId: B}
    → tripRepo.updateStatus(T, {driverId: B, status: accepted})
```

**Note** : Dans le cas concurrent, le dernier `updateStatus` gagne (last-write-wins).
L'événement `DriverAssigned` est émis deux fois, mais `TripEventHandler.handleDriverAssigned`
fait un `prisma.trip.update` qui est idempotent (le trip est déjà `accepted`).

### 11.4 Amélioration future (Sprint 3)

Pour garantir l'atomicité stricte (premier accept gagne, autres rejetés) :
- Utiliser `prisma.$transaction` avec `SELECT ... FOR UPDATE` sur le trip
- Ou utiliser un lock Redis au niveau du trip : `SET trip:accept:{tripId} NX EX 5`
- Le premier chauffeur acquiert le lock, fait l'acceptation, les autres sont rejetés

---

## 12. Idempotence — Idempotency-Key

### 12.1 Principe

Un client peut envoyer la même requête deux fois (réseau instable, retry automatique).
L'`Idempotency-Key` permet de retourner la réponse initiale sans ré-exécuter la logique.

### 12.2 Implémentation

**Interceptor global** : `IdempotencyInterceptor` (enregistré dans `AppModule`)

**Fonctionnement** :
1. Le client envoie un header `Idempotency-Key: <uuid>` (optionnel)
2. L'interceptor vérifie si la clé existe dans Redis (`telima:idem:{key}`)
3. Si oui : retourne la réponse cachée (JSON.parse)
4. Si non : pose un lock (`telima:idem:{key}:lock` TTL 300s NX)
   - Si le lock échoue : une requête identique est en cours → `409 Conflict`
   - Si le lock réussit : exécute la requête, cache la réponse, supprime le lock

**Décorateur** : `@Idempotent()` sur les endpoints sensibles
- Sans le décorateur, l'interceptor est transparent (no-op)
- Avec le décorateur + sans header → l'interceptor est transparent (no-op)

### 12.3 Endpoints protégés

| Endpoint | Décorateur | Raison |
|---|---|---|
| `POST /trips` | `@Idempotent()` | Évite la création de courses dupliquées |
| `PATCH /trips/:id/status` | `@Idempotent()` | Évite les transitions d'état dupliquées |
| `POST /payments/webhook` (Sprint 4) | À ajouter | Idempotence webhook Orange Money (critique) |

### 12.4 Configuration Redis

| Clé | TTL | Description |
|---|---|---|
| `telima:idem:{key}` | 300s (5 min) | Réponse en cache (JSON) |
| `telima:idem:{key}:lock` | 300s (5 min) | Lock de traitement (SETNX) |

---

## 13. BullMQ — Retry, Backoff, Dead-Letter Queues

### 13.1 Configuration actuelle (Sprint 2)

| Queue | attempts | backoff | removeOnComplete | removeOnFail | DLQ |
|---|---|---|---|---|---|
| `dispatch-timeout` | 0 (manuel) | N/A | `true` | `100` | Non (gestion manuelle) |

Le dispatch-timeout n'utilise pas les retries BullMQ car la logique de retry est gérée
manuellement par `DispatchService` (comptage des attempts, décision de retry ou échec).

### 13.2 Configuration prévue (Sprint 3+)

| Queue | attempts | backoff | removeOnComplete | removeOnFail | DLQ |
|---|---|---|---|---|---|
| `notifications` | 3 | exponentiel: `exponential`, `delay: 5000` | `100` | `100` | `notifications-dlq` |
| `payments-reconciliation` | 3 | exponentiel: `exponential`, `delay: 30000` | `100` | `100` | `payments-dlq` |
| `maintenance` | 3 | exponentiel: `exponential`, `delay: 10000` | `100` | `100` | `maintenance-dlq` |

### 13.3 Stratégie de retry

```
Job échoue
  → BullMQ attend backoff (exponentiel: 5s, 10s, 20s)
  → Retry attempt 2
  → Si échec → retry attempt 3
  → Si échec → job déplacé vers dead-letter queue (DLQ)
```

**Backoff exponentiel** : `delay = baseDelay * 2^(attempt - 1)`
- Attempt 1 → 5s
- Attempt 2 → 10s
- Attempt 3 → 20s

### 13.4 Dead-Letter Queue (DLQ)

Une DLQ est une queue séparée où les jobs échoués après tous les retries sont déplacés.
Cela permet :
- D'inspecter les jobs échoués sans polluer la queue principale
- De re-jouer manuellement les jobs après correction
- D'alerter sur le nombre de jobs dans la DLQ (monitoring)

**Implémentation prévue** (Sprint 3) :
```typescript
@Processor('notifications-dlq')
export class NotificationsDLQProcessor {
  // Log only + alert (Sentry/metrics)
}
```

### 13.5 Monitoring BullMQ

- `Queue.getJobCounts()` : active, completed, failed, delayed, waiting
- À exposer via un endpoint `/v1/health/queues` (Sprint 3, admin only)
- Alerting : alerte si `failed > 10` ou `delayed > 100`

---

## 14. WebSocket — Reconnexion, Heartbeat, Cleanup, Présence

### 14.1 Cycle de vie d'une connexion

```
Client connecte → handleConnection()
  → Vérifie JWT (WsJwtGuard)
  → ConnectionHandler.handleConnection()
    → joinUserRoom(userId)
    → Si driver: joinDriverRoom(driverId), presence.setOnline(driverId)
    → emit 'connected'

Client actif → driver:location_update
  → presence.heartbeat(driverId) — met à jour le score dans le sorted set
  → broadcast position aux chauffeurs proches

Client déconnecte → handleDisconnect()
  → DisconnectionHandler.handleDisconnect()
    → rooms.leaveAllRooms(client)
    → Si driver: presence.setOffline(driverId)
```

### 14.2 Heartbeat

**Côté client** : Le chauffeur envoie `driver:location_update` régulièrement (toutes les 3s en Sprint 3).
Chaque appel déclenche `presence.heartbeat(driverId)` qui met à jour le timestamp dans le sorted set Redis.

**Côté serveur** : Pas de ping/pong explicite pour l'instant. Socket.io a un mécanisme
interne de ping/pong (configurable via `pingInterval` et `pingTimeout` dans les options du gateway).

**Configuration recommandée** (Sprint 3) :
```typescript
@WebSocketGateway({
  namespace: '/',
  cors: { origin: true, credentials: true },
  pingInterval: 10000,  // 10s
  pingTimeout: 5000,    // 5s sans pong → déconnexion
})
```

### 14.3 Reconnexion

**Côté client** : Socket.io se reconnecte automatiquement avec backoff exponentiel.
Le client doit envoyer `driver:rejoin_room` après reconnexion pour restaurer les rooms.

**Côté serveur** : `handleDriverRejoinRoom` :
1. Rejoint la driver room (`rooms.joinDriverRoom`)
2. Restaure la présence (`presence.setOnline`)
3. Log la reconnexion

**Présence après reconnexion** : Si le chauffeur était offline (déconnexion > 120s),
sa présence a été nettoyée par `zremrangebyscore`. La reconnexion restaure sa présence.

### 14.4 Cleanup des connexions mortes

**Mécanisme actuel** :
- `handleDisconnect` est appelé par Socket.io quand la connexion TCP se ferme proprement
- Pour les connexions mortes (TCP timeout, crash réseau), Socket.io détecte la mort via ping/pong
- Après `pingTimeout` sans pong, Socket.io déclenche `handleDisconnect`

**Présence stale** :
- `getOnlineDriverIds()` nettoie automatiquement les entrées > 120s via `zremrangebyscore`
- Un chauffeur dont la connexion est morte mais dont la présence n'est pas nettoyée
  sera considéré offline après 120s (nettoyage paresseux)

**Amélioration prévue** (Sprint 3) : Cron de cleanup périodique
```typescript
@Cron('*/60 * * * * *')  // Chaque minute
async cleanupStalePresence() {
  await this.presence.getOnlineDriverIds(); // Déclenche zremrangebyscore
}
```

### 14.5 Redis adapter — Scaling multi-instance

Le `@socket.io/redis-adapter` permet à plusieurs instances du backend de partager
les événements WebSocket via Redis pub/sub :
- `pubClient` : publie les événements sur Redis
- `subClient` : souscrit aux événements Redis
- Les rooms sont partagées entre instances

**Limitation** : La présence (sorted set) est déjà partagée via Redis.
Les locks de dispatch sont également partagés. Le scaling horizontal est donc supporté.

---

## 15. Google Maps — Optimisation des coûts

### 15.1 Stratégie à trois niveaux

```
Niveau 1: Cache Redis (TTL 1h)
  → Hit ? Retourne la valeur cachée. Aucun appel API.
  → Miss ? Passe au niveau 2.

Niveau 2: Appel Google Distance Matrix API
  → Succès ? Cache le résultat dans Redis. Retourne.
  → Échec (quota, réseau, erreur) ? Passe au niveau 3.

Niveau 3: Fallback Haversine (calcul local)
  → Distance à vol d'oiseau + estimation 30 km/h.
  → Cache le résultat dans Redis (pour éviter de réessayer Google immédiatement).
  → Log warning pour monitoring.
```

### 15.2 Cache Redis

**Clé** : `telima:distance:{origin_lat},{origin_lng}:{dest_lat},{dest_lng}:{mode}`
- Arrondi à 4 décimales (~11m de précision) pour maximiser les hits de cache
- TTL : `GOOGLE_MAPS_CACHE_TTL` (défaut: 3600s = 1h)

**Efficacité** : Dans un contexte VTC, les mêmes trajets (même quartier → même destination)
sont fréquents. Le cache devrait avoir un hit rate > 70% en régime stationnaire.

### 15.3 Fallback Haversine

Quand l'API Google échoue, le fallback Haversine calcule :
- Distance = formule de Haversine (distance géodésique à vol d'oiseau)
- Durée = distance / 30 km/h (estimation vitesse moyenne en ville)
- Le résultat est également caché dans Redis pour éviter de réessayer Google immédiatement

**Précision** : Haversine surestime la distance réelle (pas de routes) et l'estimation
à 30 km/h est grossière. Mais c'est suffisant pour un fallback temporaire.

### 15.4 Mode motorcycle

Google Distance Matrix ne supporte pas le mode motorcycle. Le provider applique
une correction sur le mode `driving` :
- Distance × 0.7 (les motos prennent des raccourcis)
- Durée × 0.6 (les motos sont plus rapides en ville)

### 15.5 Monitoring des coûts

À surveiller via la console Google Cloud :
- Nombre d'appels API par jour
- Hit rate du cache Redis (via métriques `telima:distance:*` keys)
- Nombre de fallbacks Haversine (log warning)

**Quota gratuit** : 200$/mois de crédit Google Maps. Surveiller l'usage dans la console GCP.

---

## 16. Observabilité — Roadmap Prometheus, OpenTelemetry, Sentry

### 16.1 État actuel (Sprint 2)

- **Logs** : Pino (JSON structuré) avec niveaux configurable via `LOG_LEVEL`
- **Healthcheck** : `GET /v1/health` (DB + Redis)
- **Pas de métriques** : Pas de Prometheus, pas de tracing distribué, pas d'error tracking

### 16.2 Roadmap d'intégration

#### Phase 1 : Sentry (Sprint 3) — Error tracking

```bash
npm install @sentry/node @sentry/tracing
```

**Configuration** dans `main.ts` :
```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% des transactions
});
```

**Variables d'environnement à ajouter** :
| Variable | Description | Dev | Prod |
|---|---|---|---|
| `SENTRY_DSN` | DSN Sentry (vide = désactivé) | (vide) | DSN Sentry prod |
| `SENTRY_TRACES_SAMPLE_RATE` | Taux d'échantillonnage | `0.1` | `0.1` |

**Scope** : Capturer toutes les exceptions non gérées, les erreurs 5xx, les timeouts.

#### Phase 2 : Prometheus (Sprint 3-4) — Métriques

```bash
npm install @willsoto/nestjs-prometheus
```

**Métriques à exposer** (`/metrics`) :

| Méthode | Type | Description |
|---|---|---|
| `http_requests_total` | Counter | Total requêtes HTTP par route + statut |
| `http_request_duration_seconds` | Histogram | Latence par route |
| `dispatch_attempts_total` | Counter | Tentatives de dispatch par trip |
| `dispatch_failures_total` | Counter | Échecs de dispatch par raison |
| `trips_created_total` | Counter | Courses créées |
| `trips_active_gauge` | Gauge | Courses en cours (accepted/in_progress) |
| `ws_connections_active` | Gauge | Connexions WebSocket actives |
| `ws_connections_total` | Counter | Total connexions WebSocket |
| `bullmq_jobs_total` | Counter | Jobs BullMQ par queue + statut |
| `bullmq_jobs_active` | Gauge | Jobs actifs par queue |
| `redis_operations_total` | Counter | Opérations Redis par type |
| `google_api_calls_total` | Counter | Appels Google Maps (hit/miss/fallback) |

**Variables d'environnement** :
| Variable | Description | Défaut |
|---|---|---|
| `METRICS_ENABLED` | Activer /metrics | `false` (dev), `true` (prod) |
| `METRICS_PATH` | Chemin de l'endpoint | `/metrics` |

#### Phase 3 : OpenTelemetry (Sprint 4-5) — Tracing distribué

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

**Configuration** dans un fichier `tracing.ts` chargé avant `main.ts` :
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

**Variables d'environnement** :
| Variable | Description | Dev | Prod |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Endpoint collector OTLP | (vide) | `http://otel-collector:4318` |
| `OTEL_SERVICE_NAME` | Nom du service | `telima-backend` | `telima-backend` |
| `OTEL_RESOURCE_ATTRIBUTES` | Attributs (env, version) | `environment=dev` | `environment=prod,version=x.y.z` |

**Backend** : Jaeger, Tempo, ou Honeycomb selon l'infrastructure.

### 16.3 Architecture cible

```
App → Sentry (errors)
  → Prometheus (metrics) → Grafana (dashboards)
  → OpenTelemetry (traces) → Jaeger/Tempo (trace visualization)
```

**Dashboards Grafana à créer** (Sprint 5) :
- API latency (p50, p95, p99) par endpoint
- Dispatch success rate
- Active trips + WebSocket connections
- BullMQ queue depth + failure rate
- Google Maps API usage + cache hit rate
- Redis operations + memory

### 16.4 Alerting (Sprint 5)

| Alerte | Condition | Sévérité |
|---|---|---|
| Error rate spike | `http_requests_total{status=~"5.."}` > 1% | Critical |
| Dispatch failure rate | `dispatch_failures_total / dispatch_attempts_total` > 30% | Warning |
| BullMQ DLQ depth | `bullmq_jobs_total{status="failed"}` > 10 | Warning |
| WebSocket connections drop | `ws_connections_active` < 50% baseline | Warning |
| Google Maps quota | `google_api_calls_total` > 80% quota | Warning |
| Redis memory | `redis_used_memory` > 80% max | Critical |
