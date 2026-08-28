# Telima — Gap Analysis (REST + WebSocket + Persistance, sans FCM)

**Date:** 2026-08-28  
**Référence:** `ARCHITECTURE.md`  
**Périmètre:** Telima Client, Telima Pro, Telima Dashboard, Telima Backend  
**FCM:** Hors périmètre — documenté mais non traité

---

## 1. Architecture Actuelle Réelle

### 1.1 Backend (NestJS)

**Ce qui fonctionne:**
- REST API avec validation, idempotency, throttling, helmet, CORS configurable, Pino logging
- State machine trip avec `canTransition()` — transitions validées côté backend
- Dispatch avec Redis locks (`SET NX EX`) + BullMQ timeouts
- WebSocket Gateway avec Socket.io + Redis adapter
- Domain events découplés (EventEmitter2)
- PostGIS pour géospatial (`findNearbyDrivers` avec `ST_DWithin`)
- `PrismaService` avec `OnModuleInit` + `OnModuleDestroy`
- Healthcheck DB + Redis
- `PATCH /drivers/me/online-status` met à jour `isOnline` en DB
- `POST /trips/:id/accept` et `/decline` via REST (en plus du WS)
- `POST /tracking/position` fallback REST pour GPS

**Ce qui ne fonctionne pas:**
- `presence.setOnline()` (WS connection handler) met à jour Redis seulement, pas `isOnline` en DB
- `presence.setOffline()` (WS disconnection handler) met à jour Redis seulement, pas `isOnline` en DB
- Pas de délai de grâce sur déconnexion WS
- Pas de heartbeat WS indépendant du GPS
- Pas de reprise après redémarrage serveur (trips `pending` orphelins)
- Pas de retry exponentiel sur dispatch
- `broadcastStatusEvent()` émet seulement à la trip room, pas à la user room (sauf pour `accepted`)
- Pas de room `admin` pour WebSocket
- `completeTrip()` côté Pro: deux appels REST séquentiels non atomiques
- `declineTrip()` côté Pro: fire-and-forget (`.catchError((_) {})`)
- Pas de `GET /trips/me/active` dédié

### 1.2 Telima Client (Flutter)

**Ce qui fonctionne:**
- Riverpod, Dio, socket_io_client, Hive
- Token refresh automatique sur 401
- `restoreActiveTrip()` au démarrage via Hive + `GET /trips/:id`
- `joinTripRoom()` anticipé dès `createTrip()`
- `refreshTripStatus()` — polling de secours qui mappe les statuts backend
- Local notifications
- WS listeners pour `ride:driver_accepted/arrived/started/completed`, `ride:cancelled`, `driver:location_update`, `message:received`
- `onConnect` rejoint la trip room si `_currentTripId` est set

**Ce qui ne fonctionne pas:**
- `refreshTripStatus()` n'est jamais appelé automatiquement — pas de timer périodique
- Pas de resynchronisation à la reconnexion WS (le `onConnect` rejoint la room mais n'appelle pas `GET /trips/:id`)
- `restoreActiveTrip()` mappe `driver_arriving` → `driverAccepted` au lieu de `driverArrived` (ligne 363-364)
- `restoreActiveTrip()` cherche le statut `arrived` qui n'existe pas en backend (ligne 367)
- `ride:completed` efface le trip persisté mais ne notifie pas le backend de la réception

### 1.3 Telima Pro (Flutter)

**Ce qui fonctionne:**
- Provider, http, socket_io_client, SharedPreferences
- `acceptTrip()` via REST `POST /trips/:id/accept` (synchrone, fiable)
- `restoreActiveTrip()` au démarrage via SharedPreferences + `GET /trips/:id`
- `onConnect` émet `driver:rejoin_room` pour rétablir la présence
- GPS via `Geolocator.getPositionStream()` (distanceFilter: 10m, high accuracy)
- Position initiale émise immédiatement (`getCurrentPosition()` avant le stream)
- Son + vibration à la réception d'une demande
- `joinTripRoom()` après acceptation

**Ce qui ne fonctionne pas:**
- Pas de heartbeat WS indépendant du GPS (présence expire si stationnaire)
- `declineTrip()` est fire-and-forget — `.catchError((_) {})` ignore les erreurs
- `completeTrip()` fait `confirmPaymentReceived` puis `updateStatus('completed')` en deux appels non atomiques
- Pas de resynchronisation à la reconnexion WS (le `onConnect` émet `driver:rejoin_room` mais n'appelle pas `GET /trips/:id`)
- Pas de fallback REST pour la position GPS (`POST /tracking/position` jamais appelé)
- Pas de GPS en arrière-plan (pas de `flutter_background_service`)
- `restoreActiveTrip()` cherche le statut `arrived` qui n'existe pas en backend (ligne 424)
- `setOnline()` (bouton toggle) fait d'abord l'appel REST puis `socket.setOnline()` — si le WS n'est pas connecté, le `setOnline` WS est perdu

### 1.4 Telima Dashboard (React)

**Ce qui fonctionne:**
- API client centralisé avec refresh token automatique
- Routes protégées via `RequireAuth`
- Polling 30s sur Dashboard et Courses
- `Promise.all` pour stats + finances en parallèle

**Ce qui ne fonctionne pas:**
- Pas de WebSocket — polling 30s uniquement
- `STATUS_LABELS` utilise `ongoing` au lieu de `in_progress` — les filtres `c.status === "ongoing"` ne matcheront jamais
- `STATUS_LABELS` n'a pas de labels pour `driver_arriving`, `cancelled_by_client`, `cancelled_by_driver`, `cancelled_auto`
- `visibleCourses = filteredCourses.slice(0, 4)` — seulement 4 courses affichées
- Pas d'error boundary React
- Pas de reconnexion/resynchronisation (refresh navigateur = repart de zéro)

---

## 2. Architecture Cible (rappel de `ARCHITECTURE.md`)

> **PostgreSQL = source de vérité unique.**  
> WebSocket = notification temps réel (déclenche une resynchronisation REST).  
> FCM = hors périmètre.  
> Reconnexion = toujours resynchroniser via REST.

---

## 3. Analyse des Flux Inter-Composants

### 3.1 Flux: Création de course

```
Client: POST /trips
  → Backend: createTrip() → DB insert (status=pending)
  → Emit DomainEvents.TripCreated
  → TripEventHandler? NON — TripCreated est émis mais qui l'écoute?
```

**Gap critique:** `DomainEvents.TripCreated` est émis dans `trips.service.ts:109` mais **aucun handler ne l'écoute**. Le dispatch n'est jamais déclenché automatiquement.

Vérification: `trip-event.handler.ts` écoute `DispatchFailed`, `DriverAssigned`, `WsDriverAcceptRequested`. Pas `TripCreated`.

**Qui déclenche le dispatch alors?** Il faut vérifier si `createTrip` appelle `dispatchService.attemptDispatch()` directement.

En regardant `trips.service.ts:48-114`: `createTrip()` émet l'événement mais n'appelle pas `attemptDispatch()`. Et aucun handler n'écoute `TripCreated`.

> **P0 — Le dispatch n'est jamais déclenché.** `TripCreated` est émis mais personne ne l'écoute. Il faut soit ajouter un handler, soit appeler `attemptDispatch()` directement dans `createTrip()`.

### 3.2 Flux: Dispatch → Chauffeur

```
DispatchService.attemptDispatch()
  → findNearbyDrivers(pickup, radius, serviceType)
    → SQL: WHERE d.status = 'validated' AND d.is_online = true AND d.current_location IS NOT NULL
  → Pour chaque candidat:
    a. Redis SET NX EX (lock)
    b. DB: DispatchAttempt.create({ status: 'driver_notified' })
    c. WS: emitToDriver(driverId, 'trip:new_request', payload)
    d. BullMQ: scheduleDispatchTimeout
```

**Gap P0 — `is_online` en DB jamais mis à true par le WS:**

Le flux de présence:
1. Chauffeur ouvre Pro → `init()` → `_socket.connect()` → WS connecté
2. Backend `connection.handler.handleConnection()` → `presence.setOnline(driverId)` → Redis `zadd` seulement
3. Pro appelle `_socket.joinDriverRoom(driverId)` → Backend `handleDriverJoinRoom()` → `presence.setOnline(driverId)` → Redis seulement
4. Pro appelle `setOnline(true)` → `_driversApi.updateOnlineStatus(true)` → `PATCH /drivers/me/online-status` → `driversService.updateOnlineStatus()` → `prisma.driver.update({ data: { isOnline: true } })` → DB ✓

**Donc `is_online` en DB est mis à true uniquement quand le chauffeur appuie sur le bouton "Go Online" dans Pro.** Le WS connection handler ne le fait pas.

**Scénario qui marche:**
- Chauffeur ouvre Pro → appuie sur "Go Online" → `PATCH /drivers/me/online-status { isOnline: true }` → DB `is_online = true` → `setOnline(true)` sur WS → Redis presence
- Dispatch: `findNearbyDrivers()` → `is_online = true` ✓ + `current_location` ✓ (si GPS émis)

**Scénario qui ne marche pas:**
- Chauffeur ouvre Pro → WS se connecte → `connection.handler` → `presence.setOnline()` → Redis seulement
- Si le chauffeur n'appuie pas sur "Go Online" (ou si l'app se reconnecte après un crash), `is_online` en DB reste `false`
- Dispatch: `findNearbyDrivers()` → `is_online = false` → chauffeur invisible

**Scénario critique:**
- Chauffeur "Go Online" → `is_online = true` en DB ✓
- WS se déconnecte (micro-coupure) → `disconnection.handler` → `presence.setOffline()` → Redis `zrem` seulement
- `is_online` en DB reste `true` → le dispatch continue de trouver le chauffeur
- Mais le WS est déconnecté → `trip:new_request` est perdu
- Le timeout BullMQ (15s) déclenche un retry → autre chauffeur notifié

> **Analyse:** `is_online` en DB et Redis presence sont **deux systèmes non synchronisés**. L'architecture cible dit que `is_online` en DB devrait être la source pour le dispatch, et Redis pour le WS. Actuellement, `is_online` en DB est mis à jour par le bouton "Go Online" (REST), et Redis par le WS. Ils divergent.

### 3.3 Flux: Acceptation

```
Pro: POST /trips/:id/accept (REST)
  → TripsService.acceptTrip() → updateStatus(tripId, userId, 'driver', { status: 'accepted' })
  → canTransition(pending → accepted) ✓
  → hasActiveDispatchAttempt(tripId, driverId) ✓
  → DB: Trip.driverId = driver.id, status = 'accepted'
  → dispatchService.handleDriverAccept(tripId, driverId)
    → DispatchAttempt → 'driver_accepted'
    → Libère locks Redis des autres chauffeurs
    → DispatchAttempt des autres → 'driver_declined'
  → Emit DomainEvents.DriverAssigned
  → TripEventHandler.handleDriverAssigned()
    → tripRepo.assignDriver()
    → broadcast.emitToUser(clientId, wsEvent, payload) ✓
    → broadcast.emitToTrip(tripId, wsEvent, payload) ✓
    → Emit DomainEvents.TripAccepted → NotificationHandler → FCM (hors périmètre)
```

**Ce flux fonctionne correctement.** La double acceptation est protégée par `canTransition`.

**Gap P1 — `broadcastStatusEvent` n'émet qu'à la trip room:**

`broadcastStatusEvent()` (ligne 329-345) émet seulement à `emitToTrip(trip.id, wsEvent, payload)`. Pour les statuts `driver_arriving`, `in_progress`, `completed`, `cancelled_by_*`, le client doit être dans la trip room pour recevoir l'événement.

Si le client perd le WS, se reconnecte, mais n'a pas encore rejoint la trip room (parce que `onConnect` ne fait que émettre `trip:join` si `_currentTripId` est set — ce qui devrait marcher), l'événement est perdu.

**Mais:** `onConnect` dans `socket_service.dart` (Client) fait:
```dart
if (_currentTripId != null) {
  _socket!.emit('trip:join', {'tripId': _currentTripId});
}
```

Donc à la reconnexion, le client rejoint la trip room. Le problème est qu'entre la déconnexion et la reconnexion, les événements sont perdus. Il faut appeler `GET /trips/:id` après reconnexion.

### 3.4 Flux: Annulation

```
Client: PATCH /trips/:id/status { status: 'cancelled_by_client' }
  → updateStatus() → canTransition ✓
  → dispatchService.releaseLocksForTrip(tripId)
  → broadcast.emitToTrip(tripId, 'ride:cancelled', { tripId, status, reason })
```

**Gap P1 — Annulation non émise à la user room du chauffeur:**

`broadcastStatusEvent` émet à la trip room seulement. Si le chauffeur n'est pas dans la trip room (par exemple, il a accepté mais n'a pas encore fait `joinTripRoom`), il ne recevra pas l'annulation.

En pratique, Pro fait `_socket.joinTripRoom(trip.id)` dans `acceptTrip()` (ligne 233), donc le chauffeur devrait être dans la room. Mais si le WS s'est reconnecté entre l'acceptation et l'annulation, et que Pro n'a pas rejoint la room à la reconnexion, l'événement est perdu.

Pro ne rejoint pas automatiquement la trip room à la reconnexion WS. Le `onConnect` émet seulement `driver:rejoin_room`, pas `trip:join`.

### 3.5 Flux: Position GPS

```
Pro: Geolocator.getPositionStream(distanceFilter: 10m)
  → _emitPosition(position)
  → socket.sendDriverPosition(driverId, tripId, lat, lng, heading)
  → Backend: handleDriverPosition()
    → presence.heartbeat(driverId) → Redis zadd
    → geolocation.updateDriverLocation(driverId, lat, lng) → PostGIS
    → broadcast.emitToTrip(tripId, 'driver:location_update', { lat, lng, heading })
  → Client: WS 'driver:location_update' → state.driverLocation → map
```

**Ce flux fonctionne en foreground.** 

**Gaps:**
- Pas de fallback REST si WS déconnecté (`POST /tracking/position` existe mais n'est pas appelé par Pro)
- Pas de GPS en arrière-plan
- Heartbeat couplé au GPS — chauffeur stationnaire → présence expire

---

## 4. Trip / Course — Incohérences de Statuts

### 4.1 Table de correspondance

| Backend (Prisma) | Client (TripStatus enum) | Pro (tripStatus string) | Dashboard (STATUS_LABELS) |
|---|---|---|---|
| `pending` | `searching` | `ping` (notifié) / `idle` (non notifié) | `pending` → "En attente" |
| `accepted` | `driverAccepted` | `approaching` | `accepted` → "Acceptée" |
| `driver_arriving` | `driverArrived` | `waiting` | **MANQUANT** — affiché en brut |
| `in_progress` | `tripStarted` | `in_progress` | **`ongoing`** → "En cours" — **BUG: `in_progress` ne matche pas** |
| `completed` | `tripCompleted` | `closing` / `rating` | `completed` → "Terminée" |
| `cancelled_by_client` | `cancelled` / `noDriverFound` | (reset to idle) | **MANQUANT** — `cancelled` matche mais pas les sous-types |
| `cancelled_by_driver` | `cancelled` | (reset to idle) | **MANQUANT** |
| `cancelled_auto` | `cancelled` / `noDriverFound` | (reset to idle) | **MANQUANT** |

### 4.2 Bugs précis

**Dashboard `Courses.jsx:13-19`:**
```javascript
const STATUS_LABELS = {
  pending: "En attente",
  accepted: "Acceptée",
  ongoing: "En cours",    // BUG: should be in_progress
  completed: "Terminée",
  cancelled: "Annulée",   // BUG: backend sends cancelled_by_client/driver/auto
};
```

**Dashboard `Courses.jsx:77`:**
```javascript
const enCours = filteredCourses.filter((c) => c.status === "ongoing" || c.status === "accepted").length;
// BUG: c.status === "ongoing" never matches. Should be "in_progress"
```

**Dashboard `Courses.jsx:79`:**
```javascript
const annulees = filteredCourses.filter((c) => c.status === "cancelled").length;
// BUG: backend sends "cancelled_by_client", "cancelled_by_driver", "cancelled_auto"
// None of these match "cancelled"
```

**Client `trip_provider.dart:363-364` (`restoreActiveTrip`):**
```dart
case 'accepted':
case 'driver_arriving':
  tripStatus = TripStatus.driverAccepted;  // BUG: driver_arriving should map to driverArrived
  break;
```

**Client `trip_provider.dart:367`:**
```dart
case 'arrived':  // BUG: no such status in backend
  tripStatus = TripStatus.driverArrived;
  break;
```

**Pro `trip_provider.dart:424`:**
```dart
case 'arrived':  // BUG: no such status in backend
  _tripStatus = 'waiting';
  _isWaiting = true;
  break;
```

### 4.3 Résumé des incohérences

| # | Fichier | Ligne | Bug | Gravité |
|---|---------|------|-----|---------|
| S-1 | `Courses.jsx` | 16 | `ongoing` au lieu de `in_progress` | P0 |
| S-2 | `Courses.jsx` | 77 | Filtre `c.status === "ongoing"` ne matche jamais | P0 |
| S-3 | `Courses.jsx` | 79 | Filtre `c.status === "cancelled"` ne matche pas les sous-types | P1 |
| S-4 | `Courses.jsx` | 13-19 | Manque labels `driver_arriving`, `cancelled_by_*` | P1 |
| S-5 | `trip_provider.dart` (Client) | 363-364 | `driver_arriving` mappé à `driverAccepted` au lieu de `driverArrived` | P1 |
| S-6 | `trip_provider.dart` (Client) | 367 | Statut `arrived` inexistant en backend | P1 |
| S-7 | `trip_provider.dart` (Pro) | 424 | Statut `arrived` inexistant en backend | P1 |

---

## 5. Dispatch — Analyse Détaillée

### 5.1 Problème P0: `TripCreated` non écouté

`trips.service.ts:109`:
```typescript
this.eventEmitter.emit(DomainEvents.TripCreated, event);
```

Aucun handler `@OnEvent(DomainEvents.TripCreated)` n'existe dans le codebase. Le dispatch n'est jamais déclenché automatiquement après la création d'un trip.

**Fichiers concernés:**
- `@/c:/Users/dev/Documents/DEV/telima-backend/src/modules/trips/trips.service.ts:109` — émet l'événement
- `@/c:/Users/dev/Documents/DEV/telima-backend/src/modules/trips/handlers/trip-event.handler.ts` — n'écoute pas `TripCreated`
- `@/c:/Users/dev/Documents/DEV/telima-backend/src/modules/dispatch/dispatch.service.ts` — `attemptDispatch()` n'est jamais appelé

### 5.2 Problème P0: `is_online` DB vs Redis

| Action | Met à jour Redis | Met à jour DB `is_online` |
|--------|-----------------|--------------------------|
| WS connect (`connection.handler`) | ✅ `zadd` | ❌ |
| WS `driver:join_room` | ✅ `zadd` | ❌ |
| WS `driver:rejoin_room` | ✅ `zadd` | ❌ |
| WS `driver:online` | ✅ `zadd` | ❌ |
| WS `driver:offline` | ✅ `zrem` | ❌ |
| WS disconnect (`disconnection.handler`) | ✅ `zrem` | ❌ |
| REST `PATCH /drivers/me/online-status` | ❌ | ✅ |
| WS `driver:position` (heartbeat) | ✅ `zadd` | ❌ |

`findNearbyDrivers()` filtre sur `d.is_online = true` en DB (PostGIS). Redis presence n'est pas consulté par le dispatch.

**Conséquence:** Un chauffeur qui se connecte au WS sans appuyer sur "Go Online" (ou dont l'app se reconnecte après un crash) est invisible au dispatch.

### 5.3 Scénarios de résilience (sans FCM)

| Scénario | Comportement actuel | Gap |
|----------|---------------------|-----|
| **Pro connecté, WS actif** | `trip:new_request` reçu via WS | ✅ OK |
| **WS temporairement déconnecté (<15s)** | BullMQ timeout (15s) → retry vers autres chauffeurs | Le chauffeur original revient mais le trip est déjà redispatché |
| **WS déconnecté >15s** | Timeout → `DispatchAttempt.timed_out` → retry | Le chauffeur ne sait pas qu'il a manqué une demande |
| **Réseau coupé** | WS déconnecté → timeout → retry | Pas de polling de secours côté Pro |
| **Pro revient avant expiration** | WS reconnecté → `driver:rejoin_room` → Redis presence rafraîchi | Mais le `trip:new_request` est déjà perdu (pas de re-livraison) |
| **Pro revient après expiration** | Timeout → retry vers autres | Le chauffeur ne peut plus accepter |
| **2 chauffeurs acceptent** | Premier `updateStatus` réussit, 2e échoue (`canTransition`) | ✅ Protégé |
| **Client annule pendant dispatch** | `releaseLocksForTrip()` → locks libérés | ✅ Mais les timeout BullMQ qui se déclenchent ensuite voient `trip.status !== 'pending'` et s'arrêtent |
| **Serveur redémarre** | BullMQ jobs persistés → repris | Mais les trips `pending` sans dispatch attempt actif restent orphelins |

### 5.4 Concurrence et race conditions

**Double acceptation:** Protégée par `canTransition(pending → accepted)`. Le premier `updateStatus` réussit, le second voit `status = accepted` et `canTransition(accepted → accepted) = false` → 400.

**Amélioration possible:** Ajouter `SELECT ... FOR UPDATE` dans `updateStatus` pour éviter que deux transactions lisent `pending` simultanément. Actuellement, Prisma ne fait pas de row-level lock. Le risque est faible mais réel.

**Lock Redis vs DB:** Les locks Redis (`SET NX EX`) protègent contre le dispatch simultané vers le même chauffeur. Mais l'acceptation est protégée par la DB state machine, pas par le lock Redis. Le lock Redis est libéré dans `handleDriverAccept` après l'acceptation.

---

## 6. WebSocket — Audit Croisé

### 6.1 Événements émis par le backend

| Événement | Émetteur | Room(s) | Fichier | Émis à user room? |
|-----------|----------|---------|---------|-------------------|
| `trip:new_request` | DispatchService | `driver:{id}` | `dispatch.service.ts:107` | N/A (driver) |
| `ride:driver_accepted` | TripsService (handleDriverAssigned) | `user:{clientId}` + `trip:{id}` | `trips.service.ts:284-285` | ✅ |
| `ride:driver_arrived` | TripsService (broadcastStatusEvent) | `trip:{id}` seulement | `trips.service.ts:332` | ❌ |
| `ride:started` | TripsService (broadcastStatusEvent) | `trip:{id}` seulement | `trips.service.ts:332` | ❌ |
| `ride:completed` | TripsService (broadcastStatusEvent) | `trip:{id}` seulement | `trips.service.ts:332` | ❌ |
| `ride:cancelled` | TripsService (broadcastStatusEvent) | `trip:{id}` seulement | `trips.service.ts:332` | ❌ |
| `driver:location_update` | EventsGateway | `trip:{id}` | `events.gateway.ts:137` | N/A |
| `message:received` | ChatService | `trip:{id}` | (chat service) | ❌ |

**Gap P1:** `broadcastStatusEvent` n'émet qu'à la trip room. Si le client n'est pas dans la trip room (WS déconnecté, pas encore rejoint), l'événement est perdu. L'architecture cible prévoit l'émission à la user room aussi.

### 6.2 Événements reçus par les apps

**Client (`socket_service.dart`):**
- ✅ `ride:driver_accepted` — écoute, traite, joinTripRoom
- ✅ `ride:driver_arrived` — écoute, traite
- ✅ `ride:started` — écoute, traite
- ✅ `ride:completed` — écoute, traite, clear persisted trip
- ✅ `ride:cancelled` — écoute via `tripCancelledStream`
- ✅ `driver:location_update` — écoute
- ✅ `message:received` — écoute
- ✅ `delivery:*` — écoute

**Pro (`socket_service.dart`):**
- ✅ `trip:new_request` — écoute
- ✅ `ride:cancelled` / `delivery:cancelled` — écoute
- ✅ `driver:location_update` — écoute (pour quoi faire? Pro n'a pas besoin de sa propre position)
- ✅ `message:received` — écoute
- ❌ `ride:driver_arrived` — non écouté (Pro déclenche ce statut, n'a pas besoin de l'écouter)
- ❌ `ride:started` — non écouté (Pro déclenche ce statut)
- ❌ `ride:completed` — non écouté (Pro déclenche ce statut)

**Dashboard:**
- ❌ Aucun WebSocket

### 6.3 Comportement à la reconnexion

**Client `socket_service.dart:72-78`:**
```dart
_socket!.onConnect((_) {
  _connectionController.add(true);
  if (_currentTripId != null) {
    _socket!.emit('trip:join', {'tripId': _currentTripId});
  }
});
```
Rejoint la trip room mais **n'appelle pas `GET /trips/:id`** pour resynchroniser.

**Pro `socket_service.dart:67-72`:**
```dart
_socket!.onConnect((_) {
  _connectionController.add(true);
  _socket!.emit('driver:rejoin_room', {'driverId': _driverId});
});
```
Rétablit la présence Redis mais **ne rejoint pas la trip room** et **n'appelle pas `GET /trips/:id`**.

### 6.4 Problèmes identifiés

| # | Problème | Composant | Gravité |
|---|----------|-----------|---------|
| W-1 | `broadcastStatusEvent` n'émet pas à la user room | Backend | P1 |
| W-2 | Client ne resynchronise pas après reconnexion WS | Client | P0 |
| W-3 | Pro ne rejoint pas la trip room après reconnexion WS | Pro | P0 |
| W-4 | Pro ne resynchronise pas après reconnexion WS | Pro | P0 |
| W-5 | Dashboard n'a pas de WebSocket | Dashboard | P0 |
| W-6 | Pas de room `admin` pour WebSocket | Backend | P0 |
| W-7 | Pas de heartbeat WS indépendant du GPS | Pro + Backend | P1 |
| W-8 | Pas de ping/timeout WS explicite côté backend | Backend | P1 |

---

## 7. Reconnexion / Resynchronisation

### 7.1 Telima Client

**Au démarrage:**
- `restoreActiveTrip()` → Hive → `GET /trips/:id` → reconstruit TripState → `joinTripRoom()` ✅

**Après reconnexion WS:**
- `onConnect` → rejoint la trip room si `_currentTripId` est set ✅
- **N'appelle pas `GET /trips/:id`** ❌ — l'état peut être désynchronisé

**Polling de secours:**
- `refreshTripStatus()` existe mais n'est jamais appelé automatiquement ❌
- Seulement appelé manuellement (si l'UI le déclenche)

**Gap:** Il faut:
1. Appeler `GET /trips/:id` (ou `refreshTripStatus()`) dans `onConnect` si `_currentTripId` est set
2. Démarrer un timer périodique qui appelle `refreshTripStatus()` quand le WS est déconnecté

### 7.2 Telima Pro

**Au démarrage:**
- `restoreActiveTrip()` → SharedPreferences → `GET /trips/:id` → reconstruit trip → `joinTripRoom()` ✅

**Après reconnexion WS:**
- `onConnect` → émet `driver:rejoin_room` → rétablit présence Redis ✅
- **Ne rejoint pas la trip room** ❌
- **N'appelle pas `GET /trips/:id`** ❌

**Gap:** Il faut:
1. Dans `onConnect`, si `_currentTrip?.id` existe, émettre `trip:join` et appeler `GET /trips/:id`
2. Démarrer un polling de secours quand le WS est déconnecté

### 7.3 Telima Dashboard

**Après refresh navigateur:**
- L'app React re-part de zéro — `useEffect` fetch les données ✅
- Pas de WebSocket à rétablir ❌

**Après reconnexion WebSocket (quand implémenté):**
- Rejoindre la room `admin`
- `GET /admin/stats` + `GET /admin/trips` pour resynchroniser

---

## 8. Présence Chauffeur — Analyse Détaillée

### 8.1 Flux actuel

```
1. Pro ouvre → init(driverId) → socket.connect()
   → Backend: connection.handler.handleConnection()
     → presence.setOnline(driverId) → Redis zadd
     → (is_online DB non modifié)

2. Pro appuie "Go Online" → setOnline(true)
   → REST: PATCH /drivers/me/online-status { isOnline: true }
     → driversService.updateOnlineStatus() → prisma.driver.update({ isOnline: true }) → DB ✓
   → WS: socket.emit('driver:online', { driverId })
     → presence.setOnline() → Redis zadd
   → Démarre GPS stream → positions émises → heartbeat Redis

3. WS se déconnecte (micro-coupure)
   → disconnection.handler.handleDisconnect()
     → presence.setOffline(driverId) → Redis zrem
     → (is_online DB reste true)

4. WS se reconnecte
   → connection.handler.handleConnection()
     → presence.setOnline(driverId) → Redis zadd
   → Pro: onConnect → emit('driver:rejoin_room')
     → handleDriverRejoinRoom() → presence.setOnline() → Redis zadd

5. Pro appuie "Go Offline" → setOnline(false)
   → REST: PATCH /drivers/me/online-status { isOnline: false }
     → DB: is_online = false ✓
   → WS: socket.emit('driver:offline', { driverId })
     → presence.setOffline() → Redis zrem

6. App tuée
   → WS déconnecté → disconnection.handler → presence.setOffline() → Redis zrem
   → (is_online DB reste true — pas de correction)
```

### 8.2 Gaps

| # | Gap | Impact | Gravité |
|---|-----|--------|---------|
| P-1 | `connection.handler` ne met pas `is_online = true` en DB | Chauffeur invisible au dispatch s'il n'appuie pas sur "Go Online" | P0 |
| P-2 | `disconnection.handler` ne met pas `is_online = false` en DB | Chauffeur reste visible au dispatch après déconnexion | P0 |
| P-3 | Pas de délai de grâce | Micro-coupure → chauffeur retiré du dispatch (Redis) | P0 |
| P-4 | Heartbeat couplé au GPS | Chauffeur stationnaire → présence Redis expire après 120s | P1 |
| P-5 | `is_online` DB et Redis non synchronisés | Deux systèmes de présence divergents | P0 |
| P-6 | App tuée → `is_online` DB reste `true` | Chauffeur visible au dispatch mais injoignable | P0 |

### 8.3 Solution (sans FCM)

1. **`setOnline()` dans `presence.service.ts`** doit aussi `UPDATE drivers SET is_online = true`
2. **`setOffline()` dans `presence.service.ts`** doit aussi `UPDATE drivers SET is_online = false`
3. **Délai de grâce:** `disconnection.handler` programme un job BullMQ (60s) au lieu de `setOffline` immédiat
4. **Heartbeat indépendant:** Pro envoie `driver:heartbeat` toutes les 30s; backend ajoute un handler
5. **Reprise:** Au démarrage du backend, corriger les `is_online = true` dont la présence Redis a expiré

---

## 9. GPS — Analyse

### 9.1 Flux actuel (foreground uniquement)

```
Pro: _startPositionStream()
  → Geolocator.getCurrentPosition() (position initiale immédiate)
  → Geolocator.getPositionStream(distanceFilter: 10m, accuracy: high)
    → _emitPosition(position)
      → socket.sendDriverPosition(driverId, tripId, lat, lng, heading)
        → Backend: handleDriverPosition()
          → presence.heartbeat() → Redis
          → geolocation.updateDriverLocation() → PostGIS
          → broadcast.emitToTrip() → Client
```

### 9.2 Gaps

| # | Gap | Impact | Gravité |
|---|-----|--------|---------|
| G-1 | Pas de fallback REST si WS déconnecté | Position perdue si WS down | P1 |
| G-2 | Pas de GPS en arrière-plan | Chauffeur invisible au dispatch en background | P1 (sans FCM, le dispatch timeout gère) |
| G-3 | Pas de buffer en cas de perte réseau | Positions perdues | P2 |
| G-4 | `distanceFilter: 10m` peut être trop en zone dense | Updates fréquents → charge réseau | P2 |

**Note:** Sans FCM, le GPS en arrière-plan est moins critique car le chauffeur ne peut pas recevoir de demandes en background de toute façon. Mais sa position reste en base pour le dispatch. Le dispatch timeout (15s) gère le cas où le chauffeur ne répond pas.

---

## 10. Dashboard — Analyse

### 10.1 Gaps

| # | Gap | Impact | Gravité |
|---|-----|--------|---------|
| D-1 | Pas de WebSocket | Pas de temps réel | P0 |
| D-2 | `ongoing` au lieu de `in_progress` | Filtres cassés | P0 |
| D-3 | `cancelled` ne matche pas les sous-types | Compteur annulées faux | P1 |
| D-4 | Manque labels `driver_arriving`, `cancelled_by_*` | Affichage brut | P1 |
| D-5 | `slice(0, 4)` — seulement 4 courses | Inutilisable | P1 |
| D-6 | Pas d'error boundary | Crash total sur erreur | P1 |
| D-7 | Pas de room `admin` backend | WebSocket dashboard impossible | P0 |

---

## 11. Contrats API — Incompatibilités

| # | Endpoint | Problème | Client | Pro | Dashboard | Gravité |
|---|----------|----------|--------|-----|-----------|---------|
| A-1 | `GET /admin/trips` | Dashboard utilise `trip.client` (string) au lieu de `trip.clientId` | - | - | `Courses.jsx:51` | P1 |
| A-2 | `GET /admin/trips` | Dashboard utilise `trip.driver` (string) au lieu de `trip.driverId` | - | - | `Courses.jsx:52` | P1 |
| A-3 | `GET /admin/trips` | Dashboard utilise `trip.vehicleType` (string) — backend retourne un objet | - | - | `Courses.jsx:53` | P1 |
| A-4 | Statuts | Dashboard `STATUS_LABELS` ne correspond pas aux statuts backend | - | - | `Courses.jsx:13` | P0 |
| A-5 | `PATCH /trips/:id/status` | Client envoie `cancelled_by_client` — backend accepte ✅ | ✅ | - | - | - |
| A-6 | `POST /trips/:id/accept` | Pro utilise REST ✅, backend a l'endpoint ✅ | - | ✅ | - | - |
| A-7 | `POST /trips/:id/decline` | Pro utilise REST ✅, backend a l'endpoint ✅ | - | ✅ | - | - |
| A-8 | `POST /trips/:id/payment-received` | Pro envoie `trip.price` — backend attend `dto.amount` | - | `trip_provider.dart:296` | - | P1 |

---

## 12. Résilience sans FCM — Scénarios

| Scénario | Client | Pro | Dashboard | Sans FCM? |
|----------|--------|-----|-----------|-----------|
| **1. Réseau coupé 5s** | WS auto-reconnect. Événements manqués perdus. Pas de polling. | WS auto-reconnect. `driver:rejoin_room` émis. Pas de resync trip. | Polling 30s couvre. | ❌ Client: pas de resync. ❌ Pro: pas de resync. ✅ Dashboard: polling |
| **2. Réseau coupé 30s** | WS reconnect. Trip peut avoir changé de statut. Pas de resync. | WS reconnect. Présence Redis expirée (120s TTL non touché). Pas de resync trip. | Polling 30s couvre. | ❌ Client + Pro: pas de resync |
| **3. Réseau coupé 2min** | WS reconnect. Présence Redis expirée. `is_online` DB toujours true. Trip probablement `cancelled_auto`. | WS reconnect. Présence Redis expirée. Pas de resync. Dispatch timeout a déjà re-dispatché. | Polling couvre. | ❌ Les deux apps ne resync pas |
| **4. WS coupé** | `onConnect` rejoint trip room mais pas de `GET /trips/:id`. | `onConnect` émet `rejoin_room` mais pas de `GET /trips/:id` ni `trip:join`. | N/A (pas de WS). | ❌ |
| **5. Backend redémarré** | WS reconnect. `GET /trips/:id` non appelé. | WS reconnect. `rejoin_room` émis. Trips `pending` orphelins (pas de reprise dispatch). | Polling couvre après redémarrage. | ❌ Pro: pas de reprise dispatch |
| **6. Redis redémarré** | WS reconnect (adapter Redis recrée). Locks dispatch perdus. Présence perdue. | Présence Redis perdue. `is_online` DB toujours true (non synchronisé). | N/A. | ❌ Présence perdue, locks perdus |
| **7. Client fermé puis rouvert** | `restoreActiveTrip()` → Hive → `GET /trips/:id` → reconstruit état. | N/A. | N/A. | ✅ Client |
| **8. Pro fermée puis rouverte** | N/A. | `restoreActiveTrip()` → SharedPreferences → `GET /trips/:id` → reconstruit. `init()` → WS connect → `joinDriverRoom`. Mais `is_online` DB? Dépend du bouton "Go Online". | N/A. | ⚠️ Pro: restore trip OK, mais présence nécessite action manuelle |
| **9. Dashboard refresh** | N/A. | N/A. | `useEffect` re-fetch. Pas de WS à rétablir. | ✅ Dashboard |
| **10. Événement WS perdu** | Pas de mécanisme de récupération. Pas de polling automatique. | Pas de mécanisme de récupération. | N/A (pas de WS). | ❌ |

### 12.1 Verdict résilience

**Sans FCM, le système n'est pas fiable en production** pour les raisons suivantes:

1. **Pas de resynchronisation automatique après reconnexion WS** (Client + Pro)
2. **Pas de polling de secours** quand le WS est déconnecté (Client a `refreshTripStatus()` mais ne l'appelle jamais)
3. **Dispatch jamais déclenché** (`TripCreated` non écouté)
4. **Présence non synchronisée** entre DB et Redis
5. **Pas de délai de grâce** sur déconnexion WS
6. **Pas de reprise après redémarrage serveur**

**Avec les corrections de ce chantier (sans FCM), le système peut être fiable si:**
- Le dispatch est déclenché (fix P0-D1)
- La présence DB/Redis est synchronisée (fix P0-P1/P2)
- Les apps resynchronisent après reconnexion WS (fix P0-W2/W3/W4)
- Le polling de secours est activé (fix P1-C1)
- Le délai de grâce est implémenté (fix P0-P3)

---

## 13. Erreurs et Timeouts

### 13.1 Backend

| Élément | État | Gap |
|---------|------|-----|
| HTTP timeout | Non configuré (`server.timeout`) | P0 — requêtes longues peuvent bloquer |
| WS ping/timeout | Non configuré explicitement | P1 — dépend des defaults socket.io |
| Healthcheck | Séquentiel (DB puis Redis) | P2 — `Promise.all` serait plus rapide |
| 401/403/404/409/422/500 | `HttpExceptionFilter` gère ✅ | ✅ |
| Redis indisponible | Erreur 500 → pas de dégradation | P1 — dispatch bloqué |
| DB indisponible | Erreur 500 → Prisma error | P1 — healthcheck degraded |

### 13.2 Client

| Élément | État | Gap |
|---------|------|-----|
| API timeout | Dio configurable mais valeur non vérifiée | P1 |
| 401 → refresh token | ✅ Implémenté dans ApiClient | ✅ |
| 403/404/400 → affichage erreur | ✅ `errorMessage` dans TripState | ✅ |
| 500 → retry? | Non — l'erreur est affichée | P1 |
| WS déconnecté → UI | `connectionStream` expose l'état | P1 — mais pas de polling de secours |
| Erreur laisse UI bloquée? | `createTrip` catch → errorMessage | ✅ mais pas de retry automatique |

### 13.3 Pro

| Élément | État | Gap |
|---------|------|-----|
| API timeout | `http` package — timeout non configuré explicitement | P1 |
| 401 → refresh token | ✅ Implémenté dans ApiClient | ✅ |
| `declineTrip()` erreur | Fire-and-forget — erreur silencieuse | P0 — le chauffeur pense avoir refusé mais le backend n'a peut-être pas reçu |
| `completeTrip()` erreur | Affichée mais trip dans état incertain | P0 — non-atomicité |
| WS déconnecté → UI | `connectionStream` expose l'état | P1 — pas de polling de secours |
| `setOnline()` échec REST | Affiché ✅, mais `socket.setOnline()` déjà appelé? | Non — REST d'abord, puis WS. Si REST échoue, WS pas appelé ✅ |

### 13.4 Dashboard

| Élément | État | Gap |
|---------|------|-----|
| API timeout | Non configuré explicitement | P1 |
| 401 → refresh | ✅ Implémenté | ✅ |
| Erreur fetch | Affichée dans la page | P1 — pas d'error boundary |
| Polling continue après erreur? | Oui — `setInterval` continue | ✅ |

---

## 14. Performance

### 14.1 Backend

| Élément | État | Gap |
|---------|------|-----|
| `findNearbyDrivers` | `ST_DWithin` avec index GiST ✅ | ✅ |
| `attemptDispatch` | Boucle séquentielle sur candidats (Redis lock + DB insert + WS emit + BullMQ) | P2 — pourrait être parallélisé pour les locks |
| `handleDriverAssigned` | Plusieurs queries séquentielles (assignDriver, getDriverLocation, getPickupCoordinates, calculateDistance) | P2 |
| `checkAndRetryDispatch` | Compte `dispatchAttempt` deux fois (`driver_notified` puis total) | P2 — pourrait être une seule query |
| Dispatch enrichi | `trip.findUnique` avec includes + `$queryRaw` pour dropoff | P2 — deux queries pour le même trip |
| Logs | Pino structured ✅ | ✅ |
| Render free | Cold start possible | P0 — mais hors code |

### 14.2 Client

| Élément | État | Gap |
|---------|------|-----|
| Appels inutiles | `GET /trips/me` au démarrage socket pour refresh token | P2 — side effect acceptable |
| Polling | Aucun polling automatique | P0 — pas de secours au WS |
| Listeners | Singleton SocketService, streams broadcast | ✅ |
| Cache local | Hive pour `activeTripId` | ✅ |
| Reconstruction d'état | `restoreActiveTrip` fait un `GET /trips/:id` complet | ✅ |

### 14.3 Pro

| Élément | État | Gap |
|---------|------|-----|
| GPS | `distanceFilter: 10m` — acceptable | ✅ |
| WebSocket | Singleton, auto-reconnect | ✅ |
| Position initiale | `getCurrentPosition()` avant stream ✅ | ✅ |
| Pas de `dio` | Utilise `http` package — pas d'interceptors centralisés | P2 |

### 14.4 Dashboard

| Élément | État | Gap |
|---------|------|-----|
| Chargement | `Promise.all` pour stats + finances ✅ | ✅ |
| Polling | 30s — acceptable pour stats | P0 pour courses actives (temps réel nécessaire) |
| `slice(0, 4)` | Seulement 4 courses affichées | P1 — pas de pagination |
| Pas de lazy loading | Toutes les pages chargées | P2 |

---

## 15. Sécurité / Concurrence

| Élément | État | Verdict |
|---------|------|---------|
| Auth JWT | ✅ `JwtAuthGuard` + `WsJwtGuard` | ✅ |
| Roles | ✅ `RolesGuard` global via `APP_GUARD` | ✅ |
| Accès trips | ✅ Vérification propriétaire/assigné dans chaque endpoint | ✅ |
| Double acceptation | ✅ `canTransition` protège | ✅ (P2: `SELECT FOR UPDATE` recommandé) |
| Double annulation | ✅ `canTransition(cancelled → cancelled) = false` | ✅ |
| Actions répétées | ✅ `@Idempotent()` sur `POST /trips` et `PATCH /trips/:id/status` | ✅ |
| `acceptTrip` idempotent? | Non marqué `@Idempotent` mais `canTransition` protège | ✅ acceptable |
| `declineTrip` idempotent? | Non marqué — refuser 2x ne change rien | ✅ acceptable |
| Événements anciens WS | Pas de vérification de `tripId` actif côté Client | P1 — Client pourrait traiter un event d'un trip précédent |
| Événements anciens WS Pro | Vérifie `tripId == _currentTrip?.id` ✅ | ✅ |
| Dashboard auth | ✅ `RequireAuth` + refresh token | ✅ |

---

## 16. Matrice de Gap

| # | Fonctionnalité | Architecture.md | Code actuel | Gap | Fichiers | Gravité | Correction |
|---|---------------|-----------------|-------------|-----|----------|---------|------------|
| **P0-1** | Dispatch déclenché après création trip | `TripCreated` → `attemptDispatch()` | `TripCreated` émis mais aucun handler | Aucun handler n'écoute `TripCreated` | `trips.service.ts:109`, `trip-event.handler.ts` | **P0** | Ajouter `@OnEvent(DomainEvents.TripCreated)` qui appelle `dispatchService.attemptDispatch()` |
| **P0-2** | `is_online` DB synchronisé avec WS | `setOnline()` → Redis + DB | `setOnline()` → Redis seulement | `connection.handler` et `presence.service` ne mettent pas à jour `is_online` en DB | `presence.service.ts:14`, `connection.handler.ts:55` | **P0** | `setOnline()` doit aussi `UPDATE drivers SET is_online = true` |
| **P0-3** | `is_online` DB mis à false sur déconnexion | `setOffline()` → Redis + DB + délai | `setOffline()` → Redis seulement, immédiat | Pas de mise à jour DB, pas de délai de grâce | `presence.service.ts:19`, `disconnection.handler.ts` | **P0** | `setOffline()` doit aussi `UPDATE drivers SET is_online = false` + BullMQ delayed job 60s |
| **P0-4** | Resynchronisation Client après reconnexion WS | `onConnect` → `GET /trips/:id` | `onConnect` → `trip:join` seulement | Pas de `GET /trips/:id` après reconnexion | `socket_service.dart:72-78` | **P0** | Appeler `restoreActiveTrip()` ou `refreshTripStatus()` dans `onConnect` |
| **P0-5** | Resynchronisation Pro après reconnexion WS | `onConnect` → `GET /trips/:id` + `trip:join` | `onConnect` → `driver:rejoin_room` seulement | Pas de `GET /trips/:id`, pas de `trip:join` | `socket_service.dart:67-72` | **P0** | Ajouter `trip:join` + `GET /trips/:id` dans `onConnect` |
| **P0-6** | Dashboard statuts corrects | `in_progress` | `ongoing` | Filtres et labels cassés | `Courses.jsx:13-19,77,79` | **P0** | Remplacer `ongoing` par `in_progress`, ajouter labels manquants |
| **P0-7** | Dashboard WebSocket | Room `admin` + events temps réel | Pas de WebSocket | Pas de temps réel | `Dashboard.jsx`, `Courses.jsx`, backend `events.gateway.ts` | **P0** | Ajouter `socket.io-client` + room `admin` backend + `emitToAdmin()` |
| **P0-8** | `broadcastStatusEvent` émet à user room | Émettre à `user:{clientId}` + `trip:{id}` | Émet à `trip:{id}` seulement | Client peut manquer l'événement si pas dans la trip room | `trips.service.ts:329-345` | **P0** | Ajouter `emitToUser(trip.clientId, ...)` dans `broadcastStatusEvent` |
| **P0-9** | `declineTrip()` Pro gère les erreurs | Afficher erreur + retry | Fire-and-forget `.catchError((_) {})` | Le backend ne reçoit pas le refus → dispatch ne re-essaie pas | `trip_provider.dart:247` | **P0** | Rendre `declineTrip` async avec try/catch + affichage erreur |
| **P0-10** | `completeTrip()` Pro atomique | Endpoint unique `POST /trips/:id/complete` | Deux appels REST séquentiels | Si le 2e échoue, trip reste `in_progress` | `trip_provider.dart:296-297`, backend `trips.service.ts` | **P0** | Endpoint unique `POST /trips/:id/complete` (transaction Prisma) |
| **P0-11** | HTTP server timeout | Configuré dans `main.ts` | Non configuré | Requêtes longues peuvent bloquer | `main.ts` | **P0** | `server.timeout = 30000`, `keepAliveTimeout = 5000` |
| **P1-1** | Polling de secours Client | Timer périodique quand WS down | `refreshTripStatus()` existe mais jamais appelé | Pas de secours au WS | `trip_provider.dart:253-301` | **P1** | Timer périodique (10s) qui appelle `refreshTripStatus()` si WS déconnecté |
| **P1-2** | Heartbeat WS indépendant du GPS | Pro envoie `driver:heartbeat` toutes les 30s | Pas de heartbeat | Chauffeur stationnaire → présence expire | `socket_service.dart` (Pro), `events.gateway.ts` | **P1** | Timer 30s dans Pro + handler `driver:heartbeat` dans backend |
| **P1-3** | Délai de grâce présence | BullMQ delayed job 60s | `setOffline` immédiat | Micro-coupure → chauffeur retiré | `disconnection.handler.ts` | **P1** | BullMQ delayed job + cancel si reconnexion |
| **P1-4** | Reprise après redémarrage serveur | Scanner trips `pending` | Pas de mécanisme | Trips orphelins | `dispatch.service.ts` ou `dispatch.module.ts` | **P1** | `OnModuleInit` scan trips `pending` < 5min → `checkAndRetryDispatch` |
| **P1-5** | Retry exponentiel dispatch | Délai entre retries (2s, 5s) | Retry immédiat | Boucle rapide si tous refusent | `dispatch.service.ts:211` | **P1** | BullMQ `add()` avec `delay` au lieu d'appel direct |
| **P1-6** | Client `restoreActiveTrip` mapping `driver_arriving` | `driverArrived` | `driverAccepted` | Mauvais état UI après restore | `trip_provider.dart:363-364` | **P1** | Séparer `accepted` → `driverAccepted` et `driver_arriving` → `driverArrived` |
| **P1-7** | Client/Pro `restoreActiveTrip` statut `arrived` | N'existe pas en backend | Cherché mais jamais matché | Code mort | `trip_provider.dart:367` (Client), `424` (Pro) | **P1** | Remplacer par `driver_arriving` |
| **P1-8** | Dashboard labels manquants | `driver_arriving`, `cancelled_by_*` | Manquants | Affichage brut du statut | `Courses.jsx:13-19` | **P1** | Ajouter tous les statuts backend |
| **P1-9** | Dashboard `cancelled` filtre | Match `cancelled_by_*` | Match `cancelled` seulement | Compteur annulées toujours 0 | `Courses.jsx:79` | **P1** | `c.status.startsWith('cancelled')` |
| **P1-10** | Fallback REST GPS Pro | `POST /tracking/position` si WS down | Jamais appelé | Position perdue si WS déconnecté | `trip_provider.dart:212-218` | **P1** | Try WS, catch → REST |
| **P1-11** | Dashboard pagination courses | Pagination | `slice(0, 4)` | Inutilisable | `Courses.jsx:81` | **P1** | Pagination côté API + UI |
| **P1-12** | Dashboard error boundary | ErrorBoundary React | Aucun | Crash total sur erreur | `App.jsx` ou `main.jsx` | **P1** | Ajouter `ErrorBoundary` |
| **P1-13** | Événements anciens WS Client | Vérifier `tripId` actif | Pas de vérification | Peut traiter un event d'un trip précédent | `trip_provider.dart:114-180` | **P1** | Vérifier `data['tripId'] == state.tripId` avant de traiter |
| **P1-14** | `pingInterval`/`pingTimeout` WS | Configuré | Defaults socket.io | Connexions zombie | `events.gateway.ts` | **P1** | Configurer dans `@WebSocketGateway({ pingInterval: 10000, pingTimeout: 5000 })` |
| **P1-15** | Healthcheck parallèle | `Promise.all` | Séquentiel | Plus lent | `health.controller.ts` | **P1** | `Promise.all` |
| **P1-16** | Dashboard champs API | `trip.client` = objet | `trip.client` = string attendu | Affichage "—" | `Courses.jsx:51,114` | **P1** | Aligner avec le format backend |
| **P2-1** | `SELECT FOR UPDATE` dans `updateStatus` | Protection race condition | Pas de row lock | Race condition théorique | `trips.service.ts` | **P2** | Transaction Prisma avec `$queryRaw SELECT FOR UPDATE` |
| **P2-2** | Buffer GPS en cas de perte réseau | Pro bufferise positions | Pas de buffer | Positions perdues | `trip_provider.dart` (Pro) | **P2** | Queue en mémoire + flush au retour réseau |
| **P2-3** | GPS en arrière-plan | `flutter_background_service` | Pas implémenté | Chauffeur invisible en background | Pro `pubspec.yaml` | **P2** | (Sans FCM, moins critique) |
| **P2-4** | Migrer Pro vers `dio` | Interceptors centralisés | `http` package | Pas de retry/timeout centralisé | Pro `pubspec.yaml` | **P2** | Migration |
| **P2-5** | Lazy loading Dashboard | `React.lazy` | Pas implémenté | Bundle complet | `App.jsx` | **P2** | `React.lazy` + `Suspense` |
| **P2-6** | Dispatch parallèle locks | `Promise.all` sur locks | Séquentiel | Plus lent | `dispatch.service.ts:90-140` | **P2** | Paralléliser les locks Redis |
| **P2-7** | `checkAndRetryDispatch` optimisation | Une seule query | Deux counts | Query supplémentaire | `dispatch.service.ts:186-193` | **P2** | Combiner en une seule query |

---

## 17. Plan d'Implémentation

### Ordre déterminé par les dépendances réelles du code

#### Phase 1 — P0: Fondations (1 semaine)

| # | Action | Composant | Dépend de | Fichiers |
|---|--------|-----------|-----------|----------|
| 1 | **Corriger `is_online` DB** — `setOnline()`/`setOffline()` doivent mettre à jour `isOnline` en DB | Backend | — | `presence.service.ts`, `connection.handler.ts`, `disconnection.handler.ts` |
| 2 | **Déclencher dispatch après `TripCreated`** — ajouter handler `@OnEvent(DomainEvents.TripCreated)` | Backend | — | `trip-event.handler.ts` ou `dispatch.service.ts` |
| 3 | **`broadcastStatusEvent` émet à user room** — ajouter `emitToUser(trip.clientId, ...)` | Backend | — | `trips.service.ts:329-345` |
| 4 | **Configurer `server.timeout`** dans `main.ts` | Backend | — | `main.ts` |
| 5 | **Endpoint `POST /trips/:id/complete`** atomique (payment + status) | Backend | — | `trips.service.ts`, `trips.controller.ts` |
| 6 | **Resynchronisation Client après reconnexion WS** — appeler `restoreActiveTrip()` dans `onConnect` | Client | #3 (user room) | `socket_service.dart:72-78` |
| 7 | **Resynchronisation Pro après reconnexion WS** — `trip:join` + `GET /trips/:id` dans `onConnect` | Pro | #3 | `socket_service.dart:67-72` |
| 8 | **Corriger `declineTrip()` Pro** — async + try/catch + affichage erreur | Pro | — | `trip_provider.dart:244-251` |
| 9 | **Corriger `completeTrip()` Pro** — utiliser `POST /trips/:id/complete` | Pro | #5 | `trip_provider.dart:289-305` |
| 10 | **Corriger Dashboard statuts** — `ongoing` → `in_progress` + labels manquants | Dashboard | — | `Courses.jsx:13-19,77,79` |
| 11 | **Ajouter WebSocket Dashboard** — `socket.io-client` + room `admin` backend | Dashboard + Backend | #3 | `events.gateway.ts`, `connection.handler.ts`, `broadcast.service.ts`, `Dashboard.jsx`, `Courses.jsx` |

#### Phase 2 — P1: Robustesse (2 semaines)

| # | Action | Composant | Dépend de | Fichiers |
|---|--------|-----------|-----------|----------|
| 12 | Délai de grâce présence (BullMQ 60s) | Backend | #1 | `disconnection.handler.ts`, `presence.service.ts` |
| 13 | Heartbeat WS indépendant (Pro 30s + backend handler) | Pro + Backend | #1 | `socket_service.dart` (Pro), `events.gateway.ts` |
| 14 | Polling de secours Client (timer 10s si WS down) | Client | #6 | `trip_provider.dart` |
| 15 | Corriger `restoreActiveTrip` mapping statuts (Client + Pro) | Client + Pro | — | `trip_provider.dart` (Client:363-367, Pro:419-424) |
| 16 | Reprise après redémarrage serveur | Backend | #2 | `dispatch.service.ts` ou `dispatch.module.ts` |
| 17 | Retry exponentiel dispatch | Backend | #2 | `dispatch.service.ts:211` |
| 18 | Fallback REST GPS Pro | Pro | — | `trip_provider.dart:212-218` |
| 19 | Vérification `tripId` actif sur événements WS Client | Client | — | `trip_provider.dart:114-180` |
| 20 | `pingInterval`/`pingTimeout` WS | Backend | — | `events.gateway.ts` |
| 21 | Healthcheck parallèle | Backend | — | `health.controller.ts` |
| 22 | Dashboard pagination courses | Dashboard | #11 | `Courses.jsx`, API client |
| 23 | Dashboard error boundary | Dashboard | — | `App.jsx` |
| 24 | Dashboard champs API alignés | Dashboard | — | `Courses.jsx` |
| 25 | Nettoyage tokens FCM invalides | Backend | — | `fcm-push.provider.ts` |

#### Phase 3 — P2: Optimisation (2-4 semaines)

| # | Action | Composant |
|---|--------|-----------|
| 26 | `SELECT FOR UPDATE` dans `updateStatus` | Backend |
| 27 | Buffer GPS en cas de perte réseau | Pro |
| 28 | GPS en arrière-plan (`flutter_background_service`) | Pro |
| 29 | Migrer Pro vers `dio` | Pro |
| 30 | Lazy loading Dashboard | Dashboard |
| 31 | Dispatch locks parallèles | Backend |
| 32 | Optimisation `checkAndRetryDispatch` | Backend |
| 33 | Tests E2E backend (supertest) | Backend |

---

## 18. Plan de Tests End-to-End

### 18.1 Client ↔ Backend

| Test | Scénario | Vérifications |
|------|----------|---------------|
| T-C-1 | Création de course | `POST /trips` → 201, trip en DB avec `status=pending` |
| T-C-2 | Annulation par client | `PATCH /trips/:id/status { status: cancelled_by_client }` → 200, dispatch locks libérés |
| T-C-3 | Restauration après fermeture app | Fermer app → rouvrir → `restoreActiveTrip()` → `GET /trips/:id` → état correct |
| T-C-4 | Reconnexion WS | Couper WS → reconnecter → `GET /trips/:id` → état synchronisé |
| T-C-5 | Polling de secours | WS déconnecté → timer déclenche `refreshTripStatus()` → statut mis à jour |
| T-C-6 | Événement WS obsolète | Recevoir `ride:driver_accepted` pour un ancien tripId → ignoré |

### 18.2 Pro ↔ Backend

| Test | Scénario | Vérifications |
|------|----------|---------------|
| T-P-1 | Go Online | `PATCH /drivers/me/online-status { isOnline: true }` → DB `is_online=true` + Redis presence |
| T-P-2 | Réception demande dispatch | WS `trip:new_request` reçu → payload complet (adresses, prix, client) |
| T-P-3 | Acceptation REST | `POST /trips/:id/accept` → 200, `Trip.driverId` set, locks libérés |
| T-P-4 | Refus REST | `POST /trips/:id/decline` → 200, lock libéré, retry dispatch |
| T-P-5 | Refus avec erreur réseau | Simuler échec `declineTrip` → erreur affichée, retry possible |
| T-P-6 | Completion atomique | `POST /trips/:id/complete` → payment + status en une transaction |
| T-P-7 | Position GPS | `driver:position` → PostGIS mis à jour + WS broadcast au client |
| T-P-8 | Heartbeat | `driver:heartbeat` → Redis presence rafraîchi sans GPS |
| T-P-9 | Reconnexion WS | Couper WS → reconnecter → `driver:rejoin_room` + `trip:join` + `GET /trips/:id` |
| T-P-10 | Fallback REST GPS | WS déconnecté → `POST /tracking/position` → PostGIS mis à jour |

### 18.3 Dashboard ↔ Backend

| Test | Scénario | Vérifications |
|------|----------|---------------|
| T-D-1 | Chargement initial | `GET /admin/stats` + `GET /admin/trips` → données correctes |
| T-D-2 | Statuts corrects | Trip `in_progress` → affiché "En cours" (pas "ongoing") |
| T-D-3 | WebSocket temps réel | Nouveau trip créé → apparaît sans attendre le polling |
| T-D-4 | Refresh navigateur | F5 → données re-chargées, WS rétabli |
| T-D-5 | Reconnexion WS | Couper WS → reconnecter → rejoint room `admin` + re-fetch |

### 18.4 Client ↔ Pro via Backend

| Test | Scénario | Vérifications |
|------|----------|---------------|
| T-CP-1 | Flux complet | Client crée → dispatch → Pro accepte → Client reçoit `ride:driver_accepted` |
| T-CP-2 | Suivi GPS | Pro envoie positions → Client reçoit `driver:location_update` → carte mise à jour |
| T-CP-3 | Annulation client pendant dispatch | Client annule → Pro reçoit `ride:cancelled` → retour idle |
| T-CP-4 | Annulation chauffeur après acceptation | Pro annule → Client reçoit `ride:cancelled` |
| T-CP-5 | Perte WS pendant course | Client perd WS → reconnecte → `GET /trips/:id` → statut correct |
| T-CP-6 | Pro perd WS pendant course | Pro perd WS → reconnecte → `GET /trips/:id` + `trip:join` → reprise |

### 18.5 Pro ↔ Dashboard via Backend

| Test | Scénario | Vérifications |
|------|----------|---------------|
| T-PD-1 | Chauffeur online | Pro "Go Online" → Dashboard voit `onlineDrivers` augmenter |
| T-PD-2 | Course en cours | Pro accepte → Dashboard voit trip apparaître en temps réel |
| T-PD-3 | Position chauffeur | Pro envoie GPS → Dashboard voit position sur carte (si implémenté) |

### 18.6 Concurrence

| Test | Scénario | Vérifications |
|------|----------|---------------|
| T-X-1 | Double acceptation | 2 Pro acceptent simultanément → 1 réussit, 1 échoue (400) |
| T-X-2 | Double annulation | Client annule 2x → 1 réussit, 1 échoue |
| T-X-3 | Accept + cancel simultanés | Pro accepte + Client annule → 1 réussit selon ordre, l'autre échoue |
| T-X-4 | Dispatch concurrent | 2 trips créés simultanément → pas de collision de locks |

### 18.7 Résilience

| Test | Scénario | Vérifications |
|------|----------|---------------|
| T-R-1 | Réseau coupé 5s | Client + Pro reconnectent → état resynchronisé |
| T-R-2 | Réseau coupé 30s | Client + Pro reconnectent → `GET /trips/:id` → état correct |
| T-R-3 | Backend redémarré | Trips `pending` < 5min → reprise dispatch |
| T-R-4 | Redis redémarré | Présence reconstruite depuis `is_online` DB |
| T-R-5 | Événement WS perdu | Polling de secours détecte le changement |

---

## 19. FCM — Sujets à traiter séparément

Les éléments suivants sont **documentés mais hors périmètre** de ce chantier:

| # | Sujet | Description | Fichiers concernés |
|---|-------|-------------|-------------------|
| F-1 | Push `trip:new_request` aux chauffeurs | `NotificationHandler` n'a pas de handler `TripCreated` pour envoyer un push aux chauffeurs candidats | `notification.handler.ts` |
| F-2 | Enregistrement device tokens | Ni Client ni Pro n'appellent `POST /devices/register` | Client + Pro |
| F-3 | Firebase Messaging dans Pro | Pas de `firebase_messaging` dans `pubspec.yaml` | Pro |
| F-4 | Firebase Messaging dans Client | Dépendance présente mais non implémentée | Client |
| F-5 | Push `ride:driver_accepted` au client | `NotificationHandler` gère `TripAccepted` ✅ mais pas de token enregistré | `notification.handler.ts` |
| F-6 | Push `ride:cancelled` | `NotificationHandler` gère `TripCancelled` ✅ mais pas de token enregistré | `notification.handler.ts` |
| F-7 | Push `ride:completed` | `NotificationHandler` gère `TripCompleted` ✅ mais pas de token enregistré | `notification.handler.ts` |
| F-8 | Push `chat:message` | `NotificationHandler` gère `ChatMessageSent` ✅ mais pas de token enregistré | `notification.handler.ts` |
| F-9 | Nettoyage tokens invalides | `FcmPushProvider` ne nettoie pas les tokens invalides | `fcm-push.provider.ts` |
| F-10 | GPS en arrière-plan | Sans FCM pour réveiller l'app, le GPS background est limité | Pro |

**Note:** Les corrections de ce chantier (P0/P1) ne dépendent d'aucun de ces éléments FCM. Le système fonctionnera avec REST + WebSocket + polling de secours + resynchronisation.

---

## 20. Livrable Final — Résumé

### 20.1 Architecture actuelle réelle

Le backend a des fondations solides (state machine, dispatch, Redis, PostGIS, domain events) mais:
- Le dispatch n'est jamais déclenché (`TripCreated` non écouté)
- La présence DB/Redis est désynchronisée
- Les apps ne resynchronisent pas après reconnexion WS
- Le Dashboard n'a pas de WebSocket et a des statuts incorrects
- `completeTrip()` n'est pas atomique
- `declineTrip()` est fire-and-forget

### 20.2 Architecture cible (ARCHITECTURE.md)

REST = source de vérité, WS = notification, reconnexion = resynchronisation REST. Pas de dépendance FCM pour la fiabilité.

### 20.3 Gap analysis

**11 P0** (bloquants), **16 P1** (importants), **8 P2** (optimisation).

### 20.4 Ordre d'implémentation

1. **Backend fondations:** `is_online` DB + dispatch trigger + `broadcastStatusEvent` user room + `server.timeout` + endpoint `complete` atomique
2. **Apps resynchronisation:** Client `onConnect` resync + Pro `onConnect` resync + `declineTrip` erreur + `completeTrip` atomique
3. **Dashboard:** Statuts corrects + WebSocket + room `admin`
4. **Présence:** Délai de grâce + heartbeat indépendant
5. **Résilience:** Polling de secours + reprise serveur + retry exponentiel + fallback GPS
6. **Optimisation:** Pagination, error boundary, `SELECT FOR UPDATE`, etc.

### 20.5 Plan de tests

34 tests E2E couvrant Client ↔ Backend, Pro ↔ Backend, Dashboard ↔ Backend, Client ↔ Pro, concurrence, et résilience.

### 20.6 FCM hors périmètre

10 sujets FCM documentés pour traitement séparé.
