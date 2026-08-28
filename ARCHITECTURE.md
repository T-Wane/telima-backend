# Telima — Architecture Cible

**Date:** 2026-08-28  
**Statut:** Proposition à valider — AUCUN code modifié

---

## 1. Architecture Cible

### 1.1 Vue d'ensemble

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│  Telima Client   │     │   Telima Pro    │     │  Telima Dashboard    │
│  (Flutter)       │     │  (Flutter)      │     │  (React/Vite)        │
│                  │     │                  │     │                      │
│  REST: actions   │     │  REST: actions   │     │  REST: CRUD/stats    │
│  WS: live events │     │  WS: live events │     │  WS: live monitoring │
│  FCM: réveil     │     │  FCM: réveil     │     │  (no FCM)            │
│  GPS: n/a        │     │  GPS: foreground │     │  GPS: n/a            │
│  + background    │     │  + background    │     │                      │
└────────┬────────┘     └────────┬────────┘     └──────────┬───────────┘
         │                        │                         │
    REST + WS                REST + WS                  REST + WS
         │                        │                         │
         ▼                        ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Telima Backend (NestJS)                           │
│                                                                          │
│  REST = Source de vérité (DB writes)                                     │
│  WS = Notifications temps réel (read-only, jamais source de vérité)     │
│  FCM = Réveil hors-ligne (data-only, jamais source de vérité)           │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Trips    │  │ Dispatch │  │ Events   │  │ Notif    │  │ Admin    │ │
│  │ (CRUD)   │  │ (Redis)  │  │ (Socket) │  │ (FCM)    │  │ (Stats)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │             │             │             │             │        │
│  Domain Events (EventEmitter2) — communication interne découplée        │
│                                                                          │
│  PostgreSQL/PostGIS = Source de vérité persistée                         │
│  Redis = Presence + Dispatch locks + Idempotency + BullMQ               │
│  BullMQ = Dispatch timeouts (delayed jobs)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Rôles

| Composant | Rôle | Quand |
|-----------|------|-------|
| **REST** | Actions métier (create, accept, cancel, status, payment). Seul canal qui écrit en DB. | À chaque action utilisateur |
| **WebSocket** | Notification temps réel d'un changement d'état déjà persisté. Read-only côté client. | Après chaque transition d'état backend |
| **FCM** | Réveil l'app en arrière-plan. Data-only payload avec tripId + type. L'app appelle ensuite REST pour récupérer l'état réel. | Quand WS indisponible ou app en background |
| **Redis** | Presence (sorted set + TTL), dispatch locks (SET NX EX), idempotency cache, BullMQ queue | Temps réel + coordination |
| **PostgreSQL/PostGIS** | Source de vérité persistée. Tous les états, positions, trips, users | Chaque write |
| **BullMQ** | Dispatch timeouts (delayed jobs). Déclenche retry ou échec après délai | Après notification chauffeur |
| **GPS** | Position chauffeur → PostGIS (persistée) + WS broadcast (temps réel) | En continu quand Pro est active |

### 1.3 Principe fondamental

> **Le backend (PostgreSQL) est l'unique source de vérité.**
> WebSocket et FCM sont des canaux de **notification** — ils signalent qu'un changement a eu lieu, mais l'état réel est toujours récupéré via REST.
> Aucune application ne doit considérer un événement WS ou push comme étant la vérité. Chaque événement doit déclencher une **resynchronisation** avec le backend.

---

## 2. Source de Vérité

| Information | Source de vérité | Canaux de notification | Notes |
|-------------|-----------------|----------------------|-------|
| État d'une course | `Trip.status` en DB (PostgreSQL) | WS event + FCM | L'app appelle `GET /trips/:id` pour confirmer |
| Disponibilité chauffeur | Redis presence (sorted set) + `Driver.isOnline` en DB | WS `driver:online/offline` | Redis = temps réel, DB = persisté |
| Position chauffeur | `Driver.current_location` en PostGIS | WS `driver:location_update` | PostGIS = dernière connue, WS = temps réel |
| Demande de course | `Trip` en DB (status=pending) + `DispatchAttempt` | WS `trip:new_request` + FCM data | Le dispatch lit PostGIS, pas Redis, pour les candidats |
| Notification | `DeviceToken` en DB + FCM | FCM push | Push = signal, pas contenu métier |
| Paiement | `Trip.paymentStatus` + `CommissionPayment` en DB | WS `payment:confirmed` + FCM | Cash confirmé par chauffeur via REST |
| Assignation chauffeur | `Trip.driverId` en DB | WS `ride:driver_accepted` + FCM | L'app appelle `GET /trips/:id` pour détails complets |
| Dispatch en cours | `DispatchAttempt` en DB + Redis locks | Aucun (interne backend) | Le client ne sait pas qu'un dispatch est en cours |

---

## 3. Machine d'État — Normalisation

### 3.1 Trip (backend = référence unique)

```
pending ──→ accepted ──→ driver_arriving ──→ in_progress ──→ completed
   │           │              │                 │
   │           │              │                 └── (terminal)
   │           │              │
   ├──→ cancelled_by_client   ├──→ cancelled_by_client
   ├──→ cancelled_by_driver   ├──→ cancelled_by_driver
   ├──→ cancelled_auto        ├──→ cancelled_auto
   │
   └── (dispatch failed: no drivers / max attempts)
```

**Règles:**
- `pending → accepted`: seul un chauffeur avec dispatch attempt actif
- `accepted → driver_arriving`: seul le chauffeur assigné
- `driver_arriving → in_progress`: seul le chauffeur assigné
- `in_progress → completed`: seul le chauffeur assigné
- `* → cancelled_by_client`: seul le client (si trip lui appartient)
- `accepted+ → cancelled_by_driver`: seul le chauffeur assigné
- `pending → cancelled_auto`: backend seulement (dispatch failed)

### 3.2 Traduction par application

**Client (Flutter):**

| Backend | Client UI | Affichage |
|---------|-----------|-----------|
| pending | searching | "Recherche de chauffeur..." |
| accepted | driverAccepted | "Chauffeur en route" + ETA |
| driver_arriving | driverArrived | "Chauffeur arrivé" |
| in_progress | tripStarted | "Course en cours" + map |
| completed | tripCompleted | "Course terminée" + rating |
| cancelled_by_client/driver/auto | cancelled | "Course annulée" + raison |
| (dispatch failed) | noDriverFound | "Aucun chauffeur disponible" |

**Pro (Flutter):**

| Backend | Pro UI | Affichage |
|---------|--------|-----------|
| (no trip) | idle | Écran d'accueil |
| pending (notified) | ping | Modal demande de course + son |
| accepted | approaching | Navigation GPS vers pickup |
| driver_arriving | waiting | "En attente du client" |
| in_progress | in_progress | Navigation GPS vers dropoff |
| completed | closing | Confirmation paiement cash |
| completed (payment confirmed) | rating | Notation client |

**Dashboard (React):**

| Backend | Dashboard label |
|---------|----------------|
| pending | "En attente" |
| accepted | "Acceptée" |
| driver_arriving | "Chauffeur en route" |
| in_progress | "En cours" |
| completed | "Terminée" |
| cancelled_by_client | "Annulée (client)" |
| cancelled_by_driver | "Annulée (chauffeur)" |
| cancelled_auto | "Annulée (auto)" |

**Correction nécessaire:** Dashboard utilise actuellement `ongoing` au lieu de `in_progress`. Doit être aligné.

### 3.3 Driver

| État DB | État Redis | Signification |
|---------|-----------|---------------|
| pending_validation | n/a | Compte créé, en attente de validation admin |
| validated + isOnline=false | absent | Validé, hors ligne |
| validated + isOnline=true | présent (TTL 120s) | Validé, en ligne, disponible au dispatch |
| suspended | absent | Suspendu par admin, invisible au dispatch |
| inactive | absent | Désactivé volontairement |

**Règle:** `findNearbyDrivers()` filtre sur `status='validated' AND is_online=true AND current_location IS NOT NULL`. La présence Redis n'est pas utilisée pour le dispatch — c'est `is_online` en DB qui compte. Redis presence sert uniquement au WS (savoir si un socket est connecté pour émettre).

> **Note importante:** Actuellement `findNearbyDrivers` utilise `d.is_online = true` en SQL. Le `setOnline()` du connection handler met à jour Redis mais **pas** `is_online` en DB. C'est un bug: `is_online` en DB n'est jamais mis à `true` par le WebSocket. Il faut que `setOnline()` mette aussi à jour `Driver.isOnline = true` en DB.

### 3.4 Paiement

```
unpaid ──→ cash_received ──→ commission_calculated
                                    │
                                    ├──→ commission_pending ──→ commission_paid
                                    └──→ (si commission = 0: terminal)
```

- `unpaid`: trip créé, paiement en espèces attendu
- `cash_received`: chauffeur confirme réception via `POST /trips/:id/payment-received`
- `commission_pending`: trip complété, commission calculée
- `commission_paid`: commission réglée par chauffeur (séparé, via admin)

---

## 4. Dispatch — Flux Complet

### 4.1 Flux normal

```
1. Client: POST /trips { pickup, dropoff, serviceType, vehicleTypeId }
   → Backend: createTrip() → DB insert (status=pending)
   → Emit DomainEvents.TripCreated

2. TripEventHandler (ou TripsService directement) écoute TripCreated
   → DispatchService.attemptDispatch(tripId, pickup, serviceType)

3. Dispatch: GeolocationService.findNearbyDrivers(pickup, radius, serviceType)
   → SQL: status='validated' AND is_online=true AND current_location IS NOT NULL
   → ORDER BY distance ASC
   → Slice(0, maxDispatchAttempts) — défaut 3

4. Pour chaque candidat:
   a. Redis SET NX EX (lock, TTL=30s)
   b. DB: DispatchAttempt.create({ tripId, driverId, status: 'driver_notified' })
   c. WS: emitToDriver(driverId, 'trip:new_request', payload enrichi)
   d. FCM: sendToUser(driverUserId, { data: { tripId, type: 'trip_request' } })
   e. BullMQ: scheduleDispatchTimeout({ tripId, driverId }, delay=15s)

5. Chauffeur reçoit la demande:
   a. Si WS connecté (foreground): événement 'trip:new_request' → UI modal + son
   b. Si WS déconnecté (background/killed): FCM push → app se réveille
      → L'app appelle GET /trips/:id pour récupérer les détails
      → L'app appelle POST /trips/:id/accept ou /decline

6. Acceptation: POST /trips/:id/accept (REST, pas WS)
   → TripsService.updateStatus(tripId, userId, 'driver', { status: 'accepted' })
   → Vérifie: canTransition(pending → accepted) ✓
   → Vérifie: hasActiveDispatchAttempt(tripId, driverId) ✓
   → DB: Trip.driverId = driver.id, status = 'accepted'
   → DispatchService.handleDriverAccept(tripId, driverId):
     - DispatchAttempt → 'driver_accepted'
     - Libère les locks Redis des autres chauffeurs
     - DispatchAttempt des autres → 'driver_declined'
   → Emit DomainEvents.DriverAssigned → TripEventHandler → handleDriverAssigned()
     - DB: Trip.assignDriver()
     - WS: emitToUser(clientId, 'ride:driver_accepted', payload enrichi)
     - WS: emitToTrip(tripId, 'ride:driver_accepted', payload)
     - Emit DomainEvents.TripAccepted → NotificationHandler → FCM au client

7. Client reçoit l'acceptation:
   a. WS connecté: événement 'ride:driver_accepted' → GET /trips/:id pour détails complets
   b. WS déconnecté: FCM push → app se réveille → GET /trips/:id

8. Dashboard: WS 'ride:driver_accepted' → mise à jour liste courses en temps réel
```

### 4.2 Cas particuliers — Résilience

| Scénario | Comportement | Mécanisme |
|----------|-------------|-----------|
| **Chauffeur connecté (foreground)** | WS `trip:new_request` reçu immédiatement | Socket.io + room `driver:{id}` |
| **Chauffeur en background** | FCM data push réveille l'app | `firebase_messaging` background handler → REST |
| **App fermée** | FCM notification push (titre + body) | L'utilisateur tape → app ouvre → REST récupère l'état |
| **Perte réseau (chauffeur)** | Timeout BullMQ (15s) → `handleDriverTimeout` → retry dispatch | `checkAndRetryDispatch()` |
| **Push indisponible** | Timeout BullMQ → retry vers autres chauffeurs | Pas de perte de course |
| **WS indisponible** | FCM prend le relais. Si FCM aussi indispo → timeout → retry | BullMQ garantit le timeout |
| **Demande expirée** | BullMQ timeout → `DispatchAttempt.status = 'timed_out'` → retry | `checkAndRetryDispatch()` |
| **Refus explicite** | `POST /trips/:id/decline` → `handleDriverDeclineAndRetry()` | Libère lock + retry immédiat |
| **2 chauffeurs acceptent simultanément** | Premier `updateStatus` réussit (transition `pending→accepted`). Le 2e échoue: `canTransition(accepted→accepted)` = false → 400. Le 2e chauffeur reçoit une erreur et son lock est libéré par `handleDriverAccept`. | DB state machine + `canTransition` |
| **Client annule pendant dispatch** | `PATCH /trips/:id/status { status: 'cancelled_by_client' }` → `releaseLocksForTrip()` → tous les locks libérés, tous les DispatchAttempt → 'timed_out'. Les timeout BullMQ qui se déclenchent ensuite voient `trip.status !== 'pending'` et s'arrêtent. | `checkAndRetryDispatch` vérifie le statut |
| **Serveur redémarre** | BullMQ jobs persistés en Redis → repris au redémarrage. Les trips `pending` sans dispatch attempt en cours restent `pending` — il faut un mécanisme de reprise (voir ci-dessous). | BullMQ + reprise |
| **Tous refusent/timeout** | `checkAndRetryDispatch` → `totalAttempts >= maxDispatchAttempts` → `emitDispatchFailed` → `Trip.status = cancelled_auto` → WS + FCM au client | `handleDispatchFailed` |

### 4.3 Reprise après redémarrage serveur (manquant actuellement)

**Problème:** Si le serveur redémarre, les trips en `pending` avec dispatch attempts en cours sont abandonnés. BullMQ reprend les timeout jobs, mais les trips peuvent rester `pending` indéfiniment.

**Solution:** Au démarrage du backend (ou via un cron BullMQ), scanner les trips `pending` créés dans les dernières 5 minutes et relancer `attemptDispatch()` pour ceux qui n'ont plus de dispatch attempt `driver_notified` actif.

```
OnModuleInit (DispatchModule):
  → SELECT * FROM trips WHERE status='pending' AND created_at > NOW() - 5 min
  → Pour chaque: checkAndRetryDispatch(tripId)
```

### 4.4 Retry exponentiel (manquant actuellement)

**Problème actuel:** `checkAndRetryDispatch()` relance immédiatement `attemptDispatch()`. Si tous les chauffeurs refusent en 1s, le dispatch boucle à toute vitesse.

**Solution:** Ajouter un délai exponentiel entre les retries:
- Retry 1: immédiat (déjà le cas)
- Retry 2: délai 2s
- Retry 3: délai 5s

Implémentation: utiliser `BullMQ.add()` avec `delay` au lieu d'appeler `attemptDispatch()` directement.

---

## 5. WebSocket + Push — Quand utiliser quoi

### 5.1 Principe

```
Backend change l'état (REST write → DB)
  ↓
Émet un Domain Event interne
  ↓
Deux canaux de notification en parallèle:
  ├── WebSocket: émet l'événement aux clients connectés
  └── FCM: envoie un push data-only aux devices enregistrés
  ↓
L'app réceptrice:
  ├── Si WS reçu: traite l'événement, puis GET /trips/:id pour confirmer
  └── Si FCM reçu (WS down): réveille l'app, puis GET /trips/:id
  ↓
L'état local de l'app est TOUJOURS reconstruit depuis le backend
```

### 5.2 Matrice WebSocket vs FCM

| Événement | WebSocket | FCM | Raison |
|-----------|-----------|-----|--------|
| `trip:new_request` (dispatch) | ✅ `trip:new_request` | ✅ data-only | Chauffeur peut être en background |
| `ride:driver_accepted` | ✅ | ✅ data-only | Client peut avoir app fermée |
| `ride:driver_arrived` | ✅ | ✅ notification | Client doit savoir immédiatement |
| `ride:started` | ✅ | ✅ data-only | Client peut avoir app en background |
| `ride:completed` | ✅ | ✅ notification | Client doit noter le chauffeur |
| `ride:cancelled` | ✅ | ✅ notification | Les deux parties doivent savoir |
| `driver:location_update` | ✅ | ❌ | Trop fréquent pour FCM, WS seulement |
| `message:received` | ✅ | ✅ data-only | Chat en background |
| `payment:confirmed` | ✅ | ❌ | Le chauffeur est actif à ce moment |

### 5.3 FCM — Format des payloads

**Data-only (pas de notification visible):** Pour les événements où l'app doit se réveiller silencieusement et synchroniser.

```json
{
  "data": {
    "tripId": "abc123",
    "type": "trip_request",
    "action": "FETCH_TRIP"
  }
}
```

**Notification (titre + body visible):** Pour les événements urgents où l'utilisateur doit être alerté même si l'app est tuée.

```json
{
  "notification": {
    "title": "Nouvelle course disponible",
    "body": "Une course à 2500 FCFA à proximité"
  },
  "data": {
    "tripId": "abc123",
    "type": "trip_request"
  },
  "android": { "priority": "high" }
}
```

### 5.4 FCM n'est pas une source de vérité

- Un push FCM peut être dupliqué (FCM ne garantit pas exactly-once)
- Un push FCM peut arriver avant le WS (ordre non garanti)
- Un push FCM peut arriver après que l'utilisateur a déjà agi (stale)

**Règle:** À la réception d'un push FCM, l'app appelle **toujours** `GET /trips/:id` (ou l'endpoint approprié) pour récupérer l'état réel avant d'afficher quoi que ce soit. Si le trip est déjà `accepted` et le push dit `trip_request`, l'app ignore le push.

### 5.5 Correction de l'audit précédent

Mon premier audit disait "Pas de push FCM pour `trip:new_request`". C'est **exact** — `NotificationHandler` ne gère pas `DomainEvents.TripCreated`. Mais la correction n'est pas simplement d'ajouter un handler. Il faut:

1. Ajouter `@OnEvent(DomainEvents.TripCreated)` dans `NotificationHandler`
2. Récupérer les `DeviceToken` des chauffeurs candidats (pas du client)
3. Envoyer un push data-only avec `tripId` et `type: 'trip_request'`
4. Côté Pro, le handler FCM background appelle `GET /trips/:id` puis affiche la modal

**Attention:** `NotificationHandler` ne connaît pas les chauffeurs candidats — c'est `DispatchService` qui les sélectionne. Deux options:
- **Option A:** `DispatchService` émet un event `dispatch.driver_notified` par chauffeur, et `NotificationHandler` l'écoute pour envoyer le push.
- **Option B:** `DispatchService` envoie directement le push via `PushProvider` (couplage supplémentaire).

**Recommandation:** Option A — respecte la séparation des responsabilités. `DispatchService` dispatch, `NotificationHandler` notifie.

---

## 6. Présence Chauffeur

### 6.1 Architecture actuelle (buggée)

```
WS connect → connection.handler → presence.setOnline(driverId) → Redis zadd
WS disconnect → disconnection.handler → presence.setOffline(driverId) → Redis zrem
heartbeat → presence.heartbeat(driverId) → Redis zadd (update score)
```

**Bugs identifiés:**
1. `setOnline()` met à jour Redis mais pas `Driver.isOnline` en DB. Or `findNearbyDrivers()` filtre sur `is_online = true` en DB. Un chauffeur qui se connecte n'est jamais visible au dispatch.
2. `setOffline()` est immédiat — pas de délai de grâce.
3. `heartbeat()` n'est appelé que sur `driver:position` (déplacement). Un chauffeur stationnaire expire après 120s.
4. Le TTL Redis (120s) et `is_online` en DB ne sont pas synchronisés.

### 6.2 Architecture cible

```
WS connect → setOnline(driverId):
  ├── Redis: zadd(presence, now, driverId)
  └── DB: UPDATE drivers SET is_online = true WHERE id = driverId

WS disconnect → scheduleGracePeriod(driverId, 60s):
  └── BullMQ: delayed job 'presence_check' dans 60s
      → Si pas de reconnexion (pas de heartbeat depuis):
          ├── Redis: zrem(presence, driverId)
          └── DB: UPDATE drivers SET is_online = false
      → Si reconnexion (heartbeat récent): cancel le job

Heartbeat (chauffeur):
  ├── WS 'driver:position' → heartbeat(driverId) → Redis zadd
  └── Timer Pro (toutes 30s) → WS 'driver:heartbeat' → heartbeat(driverId)
      → Même si stationnaire, la présence est rafraîchie
```

### 6.3 Délai de grâce

- **Micro-coupure (≤60s):** WS se reconnecte, heartbeat rafraîchit le score Redis, le job BullMQ est annulé. Le chauffeur reste online.
- **Vraie déconnexion (>60s):** Le job BullMQ s'exécute, vérifie si un heartbeat récent existe. Si non → offline.
- **App tuée:** Pas de reconnexion, pas de heartbeat → offline après 60s.

### 6.4 Heartbeat indépendant du GPS

**Problème:** Actuellement le heartbeat est couplé au GPS (`driver:position`). Un chauffeur stationnaire n'envoie pas de position → pas de heartbeat → présence expire.

**Solution:** Telima Pro envoie un heartbeat WebSocket toutes les 30s, indépendamment du GPS:

```dart
// Telima Pro — timer périodique
Timer.periodic(Duration(seconds: 30), (_) {
  if (socket.connected && isOnline) {
    socket.emit('driver:heartbeat', { driverId: driverId });
  }
});
```

Côté backend, ajouter un handler `@SubscribeMessage('driver:heartbeat')` qui appelle `presence.heartbeat(driverId)`.

---

## 7. GPS — Flux et Comportement

### 7.1 Flux cible

```
Telima Pro:
  Geolocator.getPositionStream(distanceFilter: 10m, accuracy: high)
    ↓ (foreground)
  WS 'driver:position' { driverId, lat, lng, heading, tripId? }
    ↓
Backend EventsGateway:
  ├── presence.heartbeat(driverId)
  ├── GeolocationService.updateDriverLocation(driverId, lat, lng) → PostGIS
  └── Si tripId: broadcast.emitToTrip(tripId, 'driver:location_update', { lat, lng, heading })
    ↓
Telima Client:
  WS 'driver:location_update' → state.driverLocation → map update

Telima Dashboard:
  WS 'driver:location_update' → position sur carte (si implémenté)
```

### 7.2 GPS en arrière-plan

**Problème:** `Geolocator.getPositionStream()` s'arrête quand l'app passe en background sur la plupart des devices (selon l'OS et les optimisations batterie).

**Solution:** Utiliser `flutter_background_service` (ou `flutter_background_geolocation` pour une solution commerciale plus fiable) pour maintenir le stream GPS en background:

```
Telima Pro:
  Foreground: Geolocator.getPositionStream() → WS 'driver:position'
  Background: BackgroundService → GPS périodique (toutes les 15s) → REST POST /tracking/position
```

**Pourquoi REST en background et pas WS?** En background, le WebSocket peut être coupé par l'OS. REST est plus fiable pour des envois périodiques.

### 7.3 Spécifications techniques

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| Fréquence (foreground) | Sur changement de position (distanceFilter: 10m) | Temps réel pour le suivi client |
| Fréquence (background) | Toutes les 15s | Suffisant pour le dispatch, pas trop pour la batterie |
| Précision | `LocationAccuracy.high` | Précision nécessaire pour le pickup |
| Distance filter | 10m | Équilibre temps réel / batterie |
| Stockage | PostGIS `current_location` (dernière connue) | Dispatch + affichage carte |
| TTL position | Aucun (dernière position persistée) | Permet dispatch même si GPS temporairement indisponible |

### 7.4 Cas particuliers

| Scénario | Comportement |
|----------|-------------|
| **Réseau coupé** | Pro bufferise les positions localement, envoie au retour réseau. Backend garde la dernière connue. |
| **GPS indisponible** | Pro notifie l'utilisateur. La dernière position connue reste en base. Le dispatch peut encore trouver le chauffeur si sa dernière position est dans le rayon. |
| **Chauffeur immobile** | Le GPS n'émet pas (distanceFilter). Le heartbeat (30s) maintient la présence. La position reste correcte en base. |
| **App tuée** | Plus de GPS ni heartbeat. Après 60s de grâce → offline. La dernière position reste en base mais le chauffeur n'est plus au dispatch. |
| **Précision dégradée** | Si GPS en background, précision peut être `medium`. Acceptable pour le dispatch, moins pour le suivi client. Le passage en foreground restaure `high`. |

### 7.5 REST fallback pour position

Le backend a déjà `POST /tracking/position` (TrackingModule). Telima Pro ne l'utilise pas actuellement. Il faut l'utiliser pour:
1. Le GPS en background (quand WS peut être coupé)
2. Le fallback quand WS est déconnecté (foreground)

```dart
// Telima Pro — fallback REST
try {
  socket.emit('driver:position', positionData);
} catch (_) {
  await apiClient.post('/tracking/position', positionData);
}
```

---

## 8. Reconnexion et Resynchronisation

### 8.1 Principe

> Après toute reconnexion (WS ou réseau), l'app doit demander au backend: « Donne-moi l'état actuel réel de ce qui me concerne. » L'état local est reconstruit depuis le backend, pas depuis les événements WS manqués.

### 8.2 Telima Client

```
WS reconnect → onReconnect():
  1. Si _currentTripId existe (Hive):
     → GET /trips/:id → reconstruire TripState depuis le statut réel
     → Rejoindre la trip room: socket.emit('trip:join', { tripId })
  2. Si pas de trip actif:
     → Pas d'action nécessaire
  3. Toujours: rejoindre la user room (automatique via connection.handler)
```

**À implémenter:** Actuellement `restoreActiveTrip()` est appelé au démarrage mais pas à la reconnexion WS. Il faut écouter l'événement `onReconnect` du socket et appeler `restoreActiveTrip()`.

### 8.3 Telima Pro

```
WS reconnect → onReconnect():
  1. socket.emit('driver:rejoin_room', { driverId })
     → Backend: joinDriverRoom + presence.setOnline(driverId)
  2. Si _activeTripId existe (SharedPreferences):
     → GET /trips/:id → reconstruire tripProvider depuis le statut réel
     → Rejoindre la trip room: socket.emit('trip:join', { tripId })
  3. Si pas de trip actif:
     → Retour à idle
```

**À implémenter:** Le handler `driver:rejoin_room` existe déjà dans le backend (`events.gateway.ts:112`). Mais Telima Pro ne l'appelle pas systématiquement à la reconnexion. Il faut aussi appeler `GET /trips/:id` pour resynchroniser.

### 8.4 Telima Dashboard

```
WS reconnect → onReconnect():
  1. Rejoindre une room 'admin' (à créer côté backend)
  2. GET /admin/stats → rafraîchir les stats
  3. GET /admin/trips?status=pending,accepted,driver_arriving,in_progress → rafraîchir les courses actives
```

**À implémenter:** Le dashboard n'a actuellement pas de WebSocket. Voir section 10.

### 8.5 Endpoint de resynchronisation (nouveau)

Pour optimiser la resynchronisation, ajouter un endpoint dédié:

```
GET /trips/me/active
  → Retourne le trip actif pour l'utilisateur connecté (status non terminal)
  → 200: { trip: TripWithRelations } ou 204: null
  → L'app appelle cet endpoint à la reconnexion pour savoir s'il y a un trip en cours
```

Cet endpoint existe déjà implicitement via `GET /trips/me?status=pending,accepted,...` mais un endpoint dédié est plus efficace et sémantiquement clair.

---

## 9. Contrats API et Événements

### 9.1 Principes

- Tous les endpoints REST retournent un format standardisé (déjà géré par `ResponseInterceptor`)
- Les erreurs suivent le format `HttpExceptionFilter` (déjà en place)
- Les actions idempotentes utilisent `@Idempotent()` + header `idempotency-key`
- Les WS events ne portent que des données de notification (tripId, type). Les détails complets sont récupérés via REST.

### 9.2 Contrats REST critiques

#### POST /trips (createTrip)
```
Request:
  Headers: Authorization: Bearer <JWT>, Idempotency-Key: <uuid>
  Body: { serviceType, vehicleTypeId, pickup: {lat,lng}, pickupAddress, dropoff: {lat,lng}, dropoffAddress, ... }
Response 201: { success: true, data: Trip }
Response 400: { success: false, error: { code, message } }
Response 409: { success: false, error: { code: 'CONFLICT', message } } (idempotency conflict)
Retry: Oui (idempotent)
Timeout: 10s côté client
```

#### POST /trips/:id/accept (acceptTrip)
```
Request:
  Headers: Authorization: Bearer <JWT>
  Body: vide
Response 200: { success: true, data: Trip }
Response 400: { success: false, error: { code: 'BAD_REQUEST', message: 'Transition invalide' } }
Response 403: { success: false, error: { code: 'FORBIDDEN', message: 'Cette course ne vous est pas assignée' } }
Retry: Non (non idempotent — mais la transition est protégée par canTransition)
Timeout: 10s côté client
Note: Si le client annule entre-temps, la transition pending→accepted échoue car le statut est déjà cancelled.
```

#### PATCH /trips/:id/status (updateStatus)
```
Request:
  Headers: Authorization: Bearer <JWT>, Idempotency-Key: <uuid>
  Body: { status: TripStatus, cancelReason?: string }
Response 200: { success: true, data: Trip }
Response 400: { success: false, error: { code: 'BAD_REQUEST', message: 'Transition invalide' } }
Response 403: { success: false, error: { code: 'FORBIDDEN', message } }
Retry: Oui (idempotent)
Timeout: 10s côté client
```

#### POST /trips/:id/decline (declineTrip)
```
Request:
  Headers: Authorization: Bearer <JWT>
  Body: { reason?: string }
Response 200: { success: true, data: { tripId, declined: true } }
Response 403: { success: false, error: { code: 'FORBIDDEN', message: 'Cette course ne vous est pas assignée' } }
Retry: Oui (idempotent — refuser deux fois ne change rien)
Timeout: 10s côté client
Note: L'échec de decline ne doit PAS être silencieux. L'app Pro doit afficher une erreur et retry.
```

### 9.3 Contrats WebSocket

#### trip:new_request (Server → Driver)
```
Payload: { tripId, serviceType, pickup: {lat,lng}, dropoff?: {lat,lng}, pickupAddress, dropoffAddress, estimatedPrice, commission, clientName, clientPhone, vehicleTypeName, ... }
Action attendue: Afficher modal de demande. Ne pas modifier l'état local sans GET /trips/:id.
```

#### ride:driver_accepted (Server → Client)
```
Payload: { tripId, driverId, driverName, driverPhone, driverPhoto, rating, vehiclePlate, vehicleModel, vehicleType, etaMinutes, driverLat, driverLng, estimatedPrice }
Action attendue: GET /trips/:id pour confirmer, puis transition vers driverAccepted.
```

#### driver:location_update (Server → Client/Dashboard)
```
Payload: { driverId, lat, lng, heading? }
Action attendue: Mettre à jour la position sur la carte. Pas besoin de REST (donnée éphémère).
```

#### ride:cancelled (Server → Client/Pro)
```
Payload: { tripId, status, reason? }
Action attendue: GET /trips/:id pour confirmer le statut. Si confirmé, transition vers cancelled.
```

### 9.4 Contrats FCM

Tous les push FCM contiennent au minimum:
```json
{
  "data": {
    "tripId": "string",
    "type": "trip_request | trip_accepted | trip_arrived | trip_started | trip_completed | trip_cancelled | chat_message",
    "action": "FETCH_TRIP"
  }
}
```

L'app reçoit le push, extrait `tripId`, appelle `GET /trips/:id`, et reconstruit l'état depuis la réponse.

---

## 10. Dashboard

### 10.1 Architecture cible

Le Dashboard doit devenir un outil opérationnel temps réel, pas seulement CRUD.

| Fonctionnalité | Canal | Fréquence | Endpoint/Event |
|----------------|-------|-----------|----------------|
| Stats globales | REST + polling | 30s | `GET /admin/stats` |
| Courses actives | **WebSocket** | Temps réel | Rejoindre room `admin:trips` |
| Positions chauffeurs | **WebSocket** | Temps réel | Rejoindre room `admin:positions` |
| Liste chauffeurs | REST + polling | 30s | `GET /drivers` |
| Détails d'une course | REST | À la demande | `GET /admin/trips/:id` |
| Paiements | REST + polling | 60s | `GET /admin/payments` |
| Dispatch en cours | **WebSocket** | Temps réel | Événements `dispatch:*` |
| Incidents (annulations auto) | **WebSocket** | Temps réel | Événements `ride:cancelled` |

### 10.2 WebSocket pour Dashboard

**Nouveau:** Le backend doit exposer une room `admin` pour le dashboard.

```
Dashboard se connecte au WS avec son JWT admin
  → connection.handler vérifie role=admin
  → Rejoint la room 'admin'
  → Reçoit tous les événements de changement d'état de trip:
    - trip_created, trip_accepted, trip_started, trip_completed, trip_cancelled
    - dispatch_failed
    - driver_online, driver_offline
  → Reçoit les positions chauffeurs (optionnel, filtré par zone)
```

**Implémentation:**
1. `connection.handler.ts`: si `user.role === 'admin'`, rejoindre `client.join('admin')`
2. `broadcast.service.ts`: ajouter `emitToAdmin(event, data)` qui émet à la room `admin`
3. `trips.service.ts`: après chaque `broadcastStatusEvent`, aussi `emitToAdmin`
4. `dispatch.service.ts`: après dispatch failed, `emitToAdmin`

### 10.3 Pas de polling pour les courses actives

Le polling à 30s est acceptable pour les stats agrégées mais pas pour les courses actives. Un opérateur doit voir une nouvelle course apparaître immédiatement, pas 30s plus tard.

### 10.4 Reconnexion Dashboard

```
WS reconnect → onReconnect():
  1. Rejoindre room 'admin'
  2. GET /admin/stats → rafraîchir
  3. GET /admin/trips?status=pending,accepted,driver_arriving,in_progress → courses actives
```

---

## 11. Gestion des Erreurs et Résilience

### 11.1 Flux critique: Création de course

```
Normal: POST /trips → 201 → dispatch → accept → ride
  ↓ Erreur: Réseau coupé pendant POST
  → Client: retry automatique (idempotency-key protège contre les doublons)
  → Si retry épuise: afficher "Erreur réseau, réessayez"
  ↓ Erreur: Backend cold start (Render)
  → Client: timeout 10s → retry avec backoff (2s, 5s, 10s)
  → Si toujours échec: "Service temporairement indisponible"
  ↓ Erreur: Pas de chauffeur disponible
  → Backend: cancelled_auto → WS + FCM → Client affiche "Aucun chauffeur"
```

### 11.2 Flux critique: Acceptation

```
Normal: POST /trips/:id/accept → 200 → WS + FCM au client
  ↓ Erreur: Réseau coupé pendant POST
  → Pro: retry automatique (la transition est protégée)
  → Si retry réussit mais le trip est déjà accepted par un autre: 400 → Pro affiche "Course déjà prise"
  ↓ Erreur: WS coupé après acceptation (backend a accepté mais Pro n'a pas la confirmation)
  → Pro: GET /trips/:id au retour réseau → voit status=accepted → transition vers approaching
  ↓ Erreur: Client annule pendant que Pro accepte
  → Backend: canTransition(cancelled_by_client → accepted) = false → 400 → Pro affiche "Course annulée par le client"
```

### 11.3 Flux critique: GPS

```
Normal: GPS → WS driver:position → PostGIS + WS broadcast
  ↓ Erreur: GPS indisponible
  → Pro: notifie l'utilisateur "GPS indisponible"
  → Backend: dernière position connue reste en base
  → Dispatch: peut encore trouver le chauffeur si dernière position dans le rayon
  ↓ Erreur: WS coupé
  → Pro: fallback REST POST /tracking/position
  → Backend: continue de mettre à jour PostGIS via REST
  → Client: pas de mise à jour temps réel jusqu'à reconnexion WS
  ↓ Erreur: Réseau coupé
  → Pro: bufferise les positions localement (queue en mémoire)
  → Au retour réseau: envoie les positions bufferisées
  → Backend: PostGIS mis à jour avec les positions rétroactives
```

### 11.4 Flux critique: Paiement

```
Normal: POST /trips/:id/payment-received → PATCH /trips/:id/status { status: completed }
  ↓ Erreur: payment-received réussit mais status=completed échoue
  → Pro: retry le status=completed
  → Backend: payment-received est idempotent (marque déjà enregistré)
  → Si retry épuise: Pro affiche "Erreur, contactez le support"
  ↓ Problème: Non-atomicité
  → Solution cible: fusionner en un seul endpoint POST /trips/:id/complete qui fait payment + status atomiquement
```

### 11.5 Tableau de résilience

| Scénario | Client | Pro | Backend | Dashboard |
|----------|--------|-----|---------|-----------|
| Internet coupé | Retry REST + cache local | Retry REST + buffer GPS | N/A | Retry REST |
| WS coupé | Polling de secours + FCM | Polling de secours + FCM | N/A | Polling de secours |
| FCM indispo | WS suffit si connecté | Timeout BullMQ → retry dispatch | Log + continue | N/A |
| Redis indispo | Erreur 500 → retry | Erreur 500 → retry | Dispatch bloqué (locks) → dégradation | Erreur 500 |
| PostgreSQL indispo | Erreur 500 → retry | Erreur 500 → retry | Healthcheck degraded | Erreur 500 |
| Backend redémarré | Reconnexion WS + GET /trips/:id | Reconnexion WS + GET /trips/:id | Reprise dispatch (section 4.3) | Reconnexion WS |
| App tuée | Relance → restoreActiveTrip | Relance → restoreActiveTrip | Timeout → offline | N/A |
| App background | FCM réveille | FCM réveille + GPS background | N/A | N/A |
| Timeout | 10s REST → retry | 10s REST → retry | BullMQ 15s dispatch | 10s REST |
| Double action | Idempotency-key | canTransition protège | DB constraints | N/A |

---

## 12. Sécurité et Concurrence

### 12.1 Double acceptation

**Mécanisme actuel:** `canTransition(pending → accepted)` + DB update. Si deux chauffeurs acceptent simultanément, le premier `updateStatus` réussit, le second échoue car `canTransition(accepted → accepted)` = false.

**Verdict:** ✅ Protégé par la DB state machine. Le `dispatchService.handleDriverAccept` libère aussi les locks des autres chauffeurs.

**Amélioration possible:** Utiliser `SELECT ... FOR UPDATE` dans `updateStatus` pour éviter la race condition au niveau DB (deux transactions lisent `pending` simultanément). Actuellement, Prisma ne fait pas de row-level lock explicite. Le risque est faible mais réel.

### 12.2 Double paiement

**Mécanisme actuel:** `POST /trips/:id/payment-received` vérifie `trip.status === in_progress`. Un second appel échouerait car le statut est déjà `completed` après le premier cycle.

**Problème:** `payment-received` et `status=completed` sont deux appels séparés. Si le premier réussit mais le second échoue, un retry de `payment-received` échouera (status toujours `in_progress`), mais le statut ne sera jamais `completed`.

**Solution:** Endpoint unique `POST /trips/:id/complete` qui fait payment + transition atomiquement (transaction Prisma).

### 12.3 Double annulation

**Mécanisme:** `canTransition` empêche `cancelled → cancelled`. ✅ Protégé.

### 12.4 Requêtes répétées

**Mécanisme:** `@Idempotent()` + Redis lock sur `POST /trips` et `PATCH /trips/:id/status`. ✅ Protégé.

**Manquant:** `POST /trips/:id/accept` et `POST /trips/:id/decline` ne sont pas marqués `@Idempotent()`. Mais ils sont naturellement idempotents (la transition protège). Acceptable.

### 12.5 Vieux événements WS

**Problème:** Un événement WS peut arriver en retard (ex: `ride:cancelled` arrive après que le client a déjà créé une nouvelle course).

**Solution:** Chaque événement WS contient `tripId`. L'app vérifie si le `tripId` correspond à son trip actif. Si non, l'événement est ignoré.

### 12.6 Anciens push FCM

**Problème:** Un push FCM peut arriver longtemps après l'événement (ex: course déjà terminée).

**Solution:** À la réception d'un push, l'app appelle `GET /trips/:id`. Si le statut est terminal, le push est ignoré.

### 12.7 Manipulation d'ID

**Mécanisme actuel:**
- `getTrip()` vérifie l'existence du trip
- `updateStatus()` vérifie que le chauffeur est assigné ou que le client est propriétaire
- `acceptTrip()` vérifie `hasActiveDispatchAttempt()`
- `confirmPaymentReceived()` vérifie `trip.driverId === driver.id`
- `rateTrip()` vérifie l'appartenance

**Verdict:** ✅ Bien protégé. Chaque endpoint vérifie les permissions.

### 12.8 Permissions

| Rôle | Endpoints accessibles | Mécanisme |
|------|----------------------|-----------|
| Client | `/trips` (create), `/trips/me`, `/trips/:id` (own), `/trips/:id/status` (cancel own), `/trips/:id/rating` | JWT + vérification propriétaire |
| Driver | `/drivers/me`, `/trips/:id/accept`, `/trips/:id/decline`, `/trips/:id/status` (assigned), `/trips/:id/payment-received`, `/trips/:id/rating` | JWT + vérification assignation |
| Admin | `/admin/*`, `/drivers` (all), CRUD zones/pricing/vehicle-types | JWT + `@Roles(admin)` + `RolesGuard` |

**Verdict:** ✅ Bien structuré. `RolesGuard` est global via `APP_GUARD`.

---

## 13. Architecture Finale

### 13.1 Architecture actuelle — Ce que nous avons

**Backend (NestJS):**
- ✅ REST API avec validation, idempotency, throttling, helmet, CORS configurable
- ✅ State machine trip avec transitions validées
- ✅ Dispatch avec Redis locks + BullMQ timeouts
- ✅ WebSocket avec Socket.io + Redis adapter
- ✅ Domain events découplés (EventEmitter2)
- ✅ PostGIS pour géospatial
- ✅ FCM push provider (mock par défaut, FCM si configuré)
- ✅ Pino structured logging
- ✅ Prisma avec onModuleInit + onModuleDestroy
- ✅ Healthcheck DB + Redis
- ❌ Pas de push pour `trip:new_request` (NotificationHandler ne gère pas TripCreated)
- ❌ `is_online` en DB jamais mis à true par WS (bug critique)
- ❌ Pas de délai de grâce sur déconnexion
- ❌ Pas de reprise après redémarrage serveur
- ❌ Pas de retry exponentiel sur dispatch
- ❌ Pas de room admin pour WebSocket

**Client (Flutter):**
- ✅ Riverpod, Dio, socket_io_client, Hive
- ✅ Token refresh automatique
- ✅ Restauration de trip au redémarrage
- ✅ Local notifications
- ❌ Firebase Messaging en dépendance mais non implémenté
- ❌ Pas d'enregistrement de device token
- ❌ Pas de polling automatique quand WS down
- ❌ Pas de resynchronisation à la reconnexion WS

**Pro (Flutter):**
- ✅ Provider, http, socket_io_client, SharedPreferences
- ✅ Accept/decline via REST
- ✅ Restauration de trip au redémarrage
- ❌ Aucune dépendance Firebase (pas de push possible)
- ❌ Pas de GPS en arrière-plan
- ❌ Pas d'enregistrement de device token
- ❌ Pas de heartbeat indépendant du GPS
- ❌ `declineTrip()` silencieux en cas d'erreur
- ❌ `completeTrip()` non atomique
- ❌ Pas de resynchronisation à la reconnexion WS

**Dashboard (React):**
- ✅ API client centralisé avec refresh
- ✅ Routes protégées
- ✅ Polling 30s
- ❌ Pas de WebSocket
- ❌ Status mismatch `ongoing` vs `in_progress`
- ❌ Pas de pagination sur Courses
- ❌ Pas d'error boundary
- ❌ Styles inline

### 13.2 Architecture cible — Ce que nous devons avoir

```
                    REST (actions + vérité)
                    WebSocket (notifications temps réel)
                    FCM (réveil + notification hors-ligne)
                    GPS (position continue, foreground + background)

Client ←─── REST + WS + FCM ───→ Backend ←─── REST + WS + FCM ───→ Pro
                                    ↑
                              REST + WS
                                    ↑
                                Dashboard

Backend:
  PostgreSQL/PostGIS = vérité persistée
  Redis = présence + locks + idempotency + BullMQ
  BullMQ = dispatch timeouts + présence grâce + reprise
  EventEmitter2 = communication interne
  Socket.io + Redis adapter = WS multi-instance
  FCM = push (data-only pour réveil, notification pour alertes)
```

### 13.3 Corrections de l'audit précédent

| Assertion de l'audit | Verdict | Correction |
|----------------------|---------|------------|
| "Pas de rate limiting" | **FAUX** — `ThrottlerModule` est configuré dans `app.module.ts` avec 2 buckets (default 100/min, auth 10/min) et `ThrottlerGuard` global | L'audit P1-8 est invalide |
| "CORS REST non configuré" | **FAUX** — `main.ts` configure CORS avec `CORS_ORIGINS` env var, dev origins, et wildcard support | L'audit P1-9 est invalide |
| "Pas de structured logging" | **FAUX** — `nestjs-pino` (`LoggerModule.forRootAsync`) est configuré avec niveau configurable et pino-pretty en dev | L'audit P2-5 est partiellement invalide |
| "Pas de graceful shutdown" | **FAUX** — `PrismaService` implémente `OnModuleDestroy` avec `$disconnect()` | L'audit P1-7 est invalide |
| "Pas de helmet" | **FAUX** — `helmet()` est utilisé dans `main.ts` | Non mentionné dans l'audit mais présent |
| "Healthcheck séquentiel" | **VRAI** — DB puis Redis séquentiellement | L'audit P1-6 est valide |
| "Pas de push FCM pour trip:new_request" | **VRAI** — `NotificationHandler` n'a pas de handler `TripCreated` | L'audit P0-1 est valide |
| "Aucune app n'enregistre de token FCM" | **VRAI** — ni Client ni Pro n'appellent `POST /devices/register` | L'audit P0-2 est valide |
| "Telima Pro n'a pas Firebase" | **VRAI** — pas de `firebase_messaging` dans `pubspec.yaml` | L'audit P0-3 est valide |
| "Pas de GPS background" | **VRAI** — pas de `flutter_background_service` | L'audit P0-4 est valide |
| "Déconnexion = offline immédiat" | **VRAI** — `disconnection.handler.ts` appelle `setOffline` sans délai | L'audit P0-5 est valide |
| "Pas de timeout serveur" | **VRAI** — `main.ts` ne configure pas `server.timeout` | L'audit P0-6 est valide |
| "Dashboard sans WebSocket" | **VRAI** — pas de `socket.io-client` dans `package.json` | L'audit P0-8 est valide |
| "is_online en DB jamais mis à true" | **VRAI** — `connection.handler.ts` appelle `presence.setOnline()` (Redis seulement) | **Nouveau bug non identifié dans l'audit** — c'est un P0 supplémentaire |

### 13.4 Plan d'implémentation révisé

#### Phase 1 — P0 (1-2 semaines)

| # | Action | Composant | Effort | Correction audit |
|---|--------|-----------|--------|------------------|
| 1 | **Corriger `is_online` DB** — `setOnline()` doit aussi `UPDATE drivers SET is_online=true` | Backend | 2h | Nouveau P0 |
| 2 | **Ajouter push FCM pour dispatch** — émettre `dispatch.driver_notified` event + handler dans `NotificationHandler` | Backend | 4h | P0-1 |
| 3 | **Intégrer `firebase_messaging` dans Pro** + enregistrement token via `POST /devices/register` + background handler | Pro | 1.5j | P0-2,3 |
| 4 | **Implémenter init Firebase + enregistrement token dans Client** | Client | 0.5j | P0-2 |
| 5 | **Ajouter `flutter_background_service` dans Pro** pour GPS en background | Pro | 2j | P0-4 |
| 6 | **Délai de grâce 60s sur déconnexion** — BullMQ delayed job au lieu de `setOffline` immédiat | Backend | 4h | P0-5 |
| 7 | **Configurer `server.timeout` et `keepAliveTimeout`** dans `main.ts` | Backend | 0.5h | P0-6 |
| 8 | **Upgrade Render free → paid** | Infrastructure | Externe | P0-7 |
| 9 | **Ajouter WebSocket au Dashboard** — `socket.io-client`, room `admin`, events temps réel | Dashboard + Backend | 1.5j | P0-8 |

#### Phase 2 — P1 (2-3 semaines)

| # | Action | Composant | Effort |
|---|--------|-----------|--------|
| 10 | Implémenter polling automatique côté Client quand WS déconnecté | Client | 4h |
| 11 | Ajouter heartbeat WS indépendant du GPS (Pro, toutes les 30s) | Pro + Backend | 4h |
| 12 | Corriger `declineTrip()` — gérer les erreurs proprement + retry | Pro | 2h |
| 13 | Ajouter `GET /trips/me/active` pour resynchronisation | Backend | 2h |
| 14 | Resynchronisation à la reconnexion WS (Client + Pro) | Client + Pro | 6h |
| 15 | Corriger `ongoing` → `in_progress` dans Dashboard | Dashboard | 0.5h |
| 16 | Ajouter pagination sur Courses (Dashboard) | Dashboard | 4h |
| 17 | Ajouter ErrorBoundary (Dashboard) | Dashboard | 2h |
| 18 | Retry exponentiel sur dispatch (délai entre retries) | Backend | 4h |
| 19 | Reprise après redémarrage serveur (scan trips pending) | Backend | 4h |
| 20 | Nettoyer tokens FCM invalides dans `FcmPushProvider` | Backend | 2h |
| 21 | Endpoint unique `POST /trips/:id/complete` (atomique) | Backend + Pro | 6h |
| 22 | Healthcheck parallèle (`Promise.all`) | Backend | 1h |
| 23 | Configurer `pingInterval`/`pingTimeout` sur le gateway WS | Backend | 1h |
| 24 | REST fallback pour position GPS (Pro utilise `POST /tracking/position`) | Pro | 3h |

#### Phase 3 — P2 (2-4 semaines)

| # | Action | Composant | Effort |
|---|--------|-----------|--------|
| 25 | Migrer Dashboard vers TailwindCSS | Dashboard | 3j |
| 26 | Lazy loading des pages (Dashboard) | Dashboard | 4h |
| 27 | Tests Dashboard (Vitest + Testing Library) | Dashboard | 2j |
| 28 | Externaliser `VITE_API_URL` par environnement | Dashboard | 1h |
| 29 | Migrer Pro de `http` vers `dio` | Pro | 2j |
| 30 | Gestion offline (file d'attente de requêtes) | Client + Pro | 3j |
| 31 | Rayon de dispatch dynamique (expansion progressive) | Backend | 4h |
| 32 | Buffer GPS en cas de perte réseau (Pro) | Pro | 1j |
| 33 | Sanitization des entrées (class-transformer) | Backend | 4h |
| 34 | Tests E2E backend (supertest) | Backend | 2j |

### 13.5 Verdict final

**L'architecture backend est solide dans ses fondations.** Le code existant montre une bonne séparation des responsabilités (Domain Events, Dispatch, Events Gateway, Notification Handler), une state machine correcte, des guards de sécurité, et une utilisation appropriée de Redis/PostGIS/BullMQ.

**Les problèmes critiques sont concentrés sur trois axes:**

1. **Intégration push notifications** — Le backend a l'infrastructure FCM mais ne l'utilise pas pour le dispatch. Les apps n'enregistrent pas de tokens. C'est le point de rupture #1.

2. **Présence chauffeur** — Le bug `is_online` DB rend le dispatch inopérant même si le chauffeur est connecté. Le délai de grâce manquant rend la présence trop fragile.

3. **Résilience temps réel** — Pas de GPS background, pas de heartbeat indépendant, pas de resynchronisation à la reconnexion, Dashboard aveugle.

**Ce n'est pas une refonte qui est nécessaire, mais une série d'ajustements ciblés** qui comblent les gaps entre les composants existants. L'architecture est bonne — elle n'est pas câblée complètement.
