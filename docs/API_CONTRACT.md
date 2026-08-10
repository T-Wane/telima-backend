# Contrat Officiel Backend ↔ Frontend V1 — Plateforme Telima

> **Document de référence figé.** Une fois validé, les DTO, événements WebSocket, routes REST et contrats fonctionnels ne doivent plus évoluer sauf décision exceptionnelle.
>
> Version 1.0 — Juillet 2026
>
> Applications concernées :
> - **Telima** (Client) — `C:\Users\dev\Documents\DEV\telima` — Flutter / Riverpod
> - **Telima Pro** (Chauffeur) — `C:\Users\dev\Documents\DEV\telima-pro` — Flutter / Provider
> - **Telima Dashboard** (Admin) — `C:\Users\dev\Documents\DEV\telimaDashboard` — React / Vite

---

## Sommaire

1. [Conventions globales](#1-conventions-globales)
2. [Authentification & JWT](#2-authentification--jwt)
3. [Contrat WebSocket — Référence complète](#3-contrat-websocket--référence-complète)
4. [Domain Events — Référence complète](#4-domain-events--référence-complète)
5. [Modèles Prisma — Référence](#5-modèles-prisma--référence)
6. [Telima Client — Fiches par écran](#6-telima-client--fiches-par-écran)
7. [Telima Pro — Fiches par écran](#7-telima-pro--fiches-par-écran)
8. [Telima Dashboard — Fiches par page](#8-telima-dashboard--fiches-par-page)
9. [Vérification de cohérence finale](#9-vérification-de-cohérence-finale)
10. [Glossaire des statuts](#10-glossaire-des-statuts)

---

## 1. Conventions globales

### Base URL
```
DEV:  http://localhost:3000
PROD: https://api.telima.ml
```

### Headers standard
| Header | Valeur | Requis |
|---|---|---|
| `Authorization` | `Bearer <accessToken>` | Oui (sauf endpoints `@Public`) |
| `Content-Type` | `application/json` | Oui (sauf multipart) |
| `Idempotency-Key` | UUID v4 | Optionnel (POST /trips, PATCH /trips/:id/status) |

### Format de réponse — Erreurs
```json
{
  "statusCode": 400,
  "message": "Description de l'erreur",
  "error": "Bad Request"
}
```

### Codes HTTP utilisés
| Code | Signification |
|---|---|
| 200 | Succès (GET, PATCH, POST avec retour) |
| 201 | Création réussie (POST) |
| 400 | Données invalides / transition invalide |
| 401 | Non authentifié / token expiré |
| 403 | Non autorisé (rôle insuffisant, compte désactivé) |
| 404 | Ressource introuvable |
| 409 | Conflit (idempotency-key, profil existant) |
| 429 | Rate limit dépassé |

### Pagination
Tous les endpoints de liste acceptent `?page=1&limit=20`. Réponse :
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

### Conventions de comportement frontend
| Aspect | Règle |
|---|---|
| **Loading** | Spinner / indicateur de chargement sur tous les appels REST. Désactiver le bouton d'action pendant la requête. |
| **Offline** | Détecter la perte de connexion. Afficher une bannière "Hors ligne". Mettre en file d'attente les actions utilisateur et rejouer à la reconnexion. Pour le tracking GPS, stocker les positions localement et envoyer en batch à la reconnexion. |
| **Retry** | Max 3 tentatives avec backoff exponentiel (1s, 2s, 4s). Pas de retry sur 400/401/403. Retry automatique sur 429 (respecter `Retry-After` header) et 5xx. |
| **Cache** | VehicleTypes : cache 1h (localStorage / Hive). Profil utilisateur : cache 30min. Prix estimé : pas de cache (toujours recalculer). Historique trips : cache 5min. |
| **Token refresh** | Intercepteur HTTP : si 401, tenter `POST /auth/refresh` une fois. Si échec, rediriger vers login. |

---

## 2. Authentification & JWT

### Flow OTP
```
POST /auth/request-otp  →  SMS envoyé  →  POST /auth/verify-otp  →  TokenPair + User
```

### TokenPair (response body, pas de cookie)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "isNewUser": true,
  "user": {
    "id": "uuid",
    "phone": "+22312345678",
    "role": "client",
    "firstName": null,
    "lastName": null
  }
}
```

### JWT Payload
```json
{
  "sub": "userId",
  "phone": "+22312345678",
  "role": "client | driver | admin",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Expiration (configurable via env)
| Token | Default |
|---|---|
| `accessToken` | 15min (`JWT_ACCESS_EXPIRES_IN`) |
| `refreshToken` | 30d (`JWT_REFRESH_EXPIRES_IN`) |

### OTP Rules
| Règle | Valeur |
|---|---|
| Longueur | 4 chiffres |
| Expiration | 5 minutes |
| Cooldown renvoi | 60 secondes |
| Max tentatives | 3 |
| Blocage après 3 échecs | 30 minutes |
| Dev only | `devOtpCode` dans la réponse si `OTP_EXPOSE_IN_RESPONSE=true` et `NODE_ENV≠production` |

---

## 3. Contrat WebSocket — Référence complète

### Connexion
```
URL: ws://localhost:3000 (dev) / wss://api.telima.ml (prod)
Namespace: / (single namespace, events namespaced by prefix)
Auth: JWT token passé en query param ?token=<accessToken> ou handshake auth
Guard: WsJwtGuard sur toutes les connexions
Adapter: Redis (multi-instance)
```

### Événements — Table de référence

#### Namespace `ride:*`
| Event | Direction | Payload | Déclencheur |
|---|---|---|---|
| `ride:driver_accepted` | server → client | `{ tripId, driverId, driverName, driverPhone, rating }` | DispatchService assigne chauffeur |
| `ride:driver_arrived` | server → client | `{ tripId, status }` | Chauffeur signale arrivée |
| `ride:started` | server → client | `{ tripId, status }` | Chauffeur démarre course |
| `ride:completed` | server → client | `{ tripId, status }` | Chauffeur termine course |
| `ride:cancelled` | server → client+driver | `{ tripId, reason }` | Annulation (client/driver/auto) |

#### Namespace `delivery:*`
| Event | Direction | Payload | Déclencheur |
|---|---|---|---|
| `delivery:pickup_en_route` | server → client | `{ tripId, driverId, driverName, driverPhone, rating }` | Chauffeur accepte, en route vers pickup |
| `delivery:parcel_picked_up` | server → client | `{ tripId, status }` | Chauffeur démarre livraison |
| `delivery:delivered` | server → client | `{ tripId, status }` | Chauffeur termine livraison |
| `delivery:client_confirmed` | client → server | `{ tripId }` | Client confirme réception colis |
| `delivery:cancelled` | server → client+driver | `{ tripId, reason }` | Annulation |

#### Namespace `driver:*`
| Event | Direction | Payload | Déclencheur |
|---|---|---|---|
| `driver:join_room` | driver → server | `{ driverId }` | Chauffeur se connecte |
| `driver:rejoin_room` | driver → server | `{ driverId }` | Reconnexion après déconnexion |
| `driver:online` | server → all | `{ driverId }` | Chauffeur passe online |
| `driver:offline` | server → all | `{ driverId }` | Chauffeur passe offline |
| `driver:position` | driver → server | `{ driverId, lat, lng, heading? }` | Chauffeur envoie position GPS |
| `driver:location_update` | server → client | `{ driverId, lat, lng, heading? }` | Broadcast position au client |

#### Namespace `trip:*`
| Event | Direction | Payload | Déclencheur |
|---|---|---|---|
| `trip:new_request` | server → driver | `{ tripId, serviceType, pickupAddress, dropoffAddress, estimatedPrice, commission, distanceMeters, clientName, clientRating, vehicleTypeName, recipientName?, recipientPhone?, parcelDescription? }` | Dispatch notifie un chauffeur |
| `trip:accept` | driver → server | `{ tripId }` | Chauffeur accepte la course |
| `trip:decline` | driver → server | `{ tripId, reason? }` | Chauffeur refuse la course |
| `trip:join` | client → server | `{ tripId }` | Client rejoint la room du trip |
| `trip:joined` | server → client | `{ tripId }` | Confirmation join room |

#### Namespace `chat:*` (Sprint 3)
| Event | Direction | Payload | Déclencheur |
|---|---|---|---|
| `message:send` | client/driver → server | `{ tripId, content?, audioUrl? }` | Envoi message |
| `message:received` | server → client/driver | `{ id, tripId, senderId, senderRole, content?, audioUrl?, createdAt }` | Nouveau message |

#### Namespace `payment:*` (Sprint 5)
| Event | Direction | Payload | Déclencheur |
|---|---|---|---|
| `payment:confirmed` | server → driver | `{ transactionId, amount, driverId }` | Webhook Orange Money confirmé |

### SERVICE_EVENT_MAP — Mapping statut → événement par service
| ServiceType | accepted | driver_arriving | in_progress | completed | cancelled_* |
|---|---|---|---|---|---|
| `ride` | `ride:driver_accepted` | `ride:driver_arrived` | `ride:started` | `ride:completed` | `ride:cancelled` |
| `delivery` | `delivery:pickup_en_route` | `delivery:pickup_en_route` | `delivery:parcel_picked_up` | `delivery:delivered` | `delivery:cancelled` |
| `food` | `delivery:pickup_en_route` | `delivery:pickup_en_route` | `delivery:parcel_picked_up` | `delivery:delivered` | `delivery:cancelled` |
| `intercity` | `ride:driver_accepted` | `ride:driver_arrived` | `ride:started` | `ride:completed` | `ride:cancelled` |
| `assistance` | `ride:driver_accepted` | `ride:driver_arrived` | `ride:started` | `ride:completed` | `ride:cancelled` |

---

## 4. Domain Events — Référence complète

| Event constant | Event name | Payload | Émis par |
|---|---|---|---|
| `TripCreated` | `trip.created` | `{ tripId, clientId, serviceType, vehicleTypeId, pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, estimatedPrice, distanceMeters, durationSeconds }` | TripsService.createTrip |
| `TripAccepted` | `trip.accepted` | `{ tripId, driverId, clientId }` | TripsService.handleDriverAssigned |
| `TripArrived` | `trip.driver_arrived` | `{ tripId, driverId, clientId }` | TripsService.updateStatus |
| `TripStarted` | `trip.started` | `{ tripId, driverId, clientId }` | TripsService.updateStatus |
| `TripCompleted` | `trip.completed` | `{ tripId, driverId, clientId, finalPrice }` | TripsService.updateStatus |
| `TripCancelled` | `trip.cancelled` | `{ tripId, cancelledBy, reason }` | TripsService.updateStatus |
| `DriverAssigned` | `dispatch.driver_assigned` | `{ tripId, driverId }` | DispatchService |
| `DispatchFailed` | `dispatch.failed` | `{ tripId, reason }` | DispatchService |
| `PaymentSucceeded` | `payment.succeeded` | `{ transactionId, driverId, amount }` | PaymentsService (Sprint 5) |
| `DriverOnline` | `driver.online` | `{ driverId, lat, lng }` | EventsGateway |
| `DriverOffline` | `driver.offline` | `{ driverId }` | EventsGateway |

### Domain Events à créer (Sprints 3-5)
| Event name | Payload | Sprint |
|---|---|---|
| `trip.rated` | `{ tripId, raterId, raterRole, rating, tags }` | Sprint 3 |
| `chat.message_sent` | `{ messageId, tripId, senderId, senderRole }` | Sprint 3 |
| `commission.paid` | `{ driverId, amount, transactionRef }` | Sprint 5 |

---

## 5. Modèles Prisma — Référence

### Modèles existants (Sprint 1-2)

| Modèle | Table | Sprint |
|---|---|---|
| `User` | users | 1 |
| `OtpCode` | otp_codes | 1 |
| `RefreshToken` | refresh_tokens | 1 |
| `Driver` | drivers | 1 |
| `Vehicle` | vehicles | 1 |
| `VehicleType` | vehicle_types | 1 |
| `Capability` | capabilities | 2.5 |
| `VehicleTypeCapability` | vehicle_type_capabilities | 2.5 |
| `DriverCapability` | driver_capabilities | 2.5 |
| `Trip` | trips | 2 |
| `TripStop` | trip_stops | 2.5 |
| `RideDetails` | ride_details | 2.5 |
| `DeliveryDetails` | delivery_details | 2.5 |
| `ServiceConfig` | service_configs | 2.5 |
| `ServiceRequirement` | service_requirements | 2.5 |
| `DispatchAttempt` | dispatch_attempts | 2 |

### Modèles à créer (Sprints 3-6)

| Modèle | Table | Sprint | Champs clés |
|---|---|---|---|
| `ChatMessage` | chat_messages | 3 | id, tripId, senderId, senderRole, content?, audioUrl?, createdAt |
| `TripRating` | trip_ratings | 3 | id, tripId, raterId, raterRole, rating (1-5), tags (String[]), createdAt |
| `DeviceToken` | device_tokens | 3 | id, userId, token, platform (android/ios/web), createdAt |
| `CommissionPayment` | commission_payments | 5 | id, driverId, amount, status (pending/confirmed/failed), transactionRef?, paidAt?, createdAt |
| `ServiceZone` | service_zones | 5 | id, name, city, centerLat, centerLng, radiusKm, surgeMultiplier, isActive, createdAt |
| `PricingRule` | pricing_rules | 5 | id, name, serviceType, vehicleTypeId?, zoneId?, condition, modifier, priority, isActive |
| `BatteryStation` | battery_stations | 6 | id, name, address, lat, lng, batteryType, batteryCapacity, batteryPrice, openingHours, isActive |
| `Battery` | batteries | 6 | id, stationId, type, capacity, status, createdAt |

### Enums existants
| Enum | Valeurs |
|---|---|
| `UserRole` | client, driver, admin |
| `DriverStatus` | pending_validation, validated, suspended, rejected |
| `ServiceType` | ride, delivery, food, assistance, intercity |
| `TripStatus` | pending, accepted, driver_arriving, in_progress, completed, cancelled_by_client, cancelled_by_driver, cancelled_auto |
| `PaymentMethod` | cash, orange_money |
| `DispatchStatus` | searching, driver_notified, driver_accepted, driver_declined, timeout, exhausted |
| `StopType` | pickup, dropoff, waypoint |

### Machine à états Trip
```
pending → accepted → driver_arriving → in_progress → completed
   ↓         ↓            ↓
   └──→ cancelled_by_client / cancelled_by_driver / cancelled_auto
```

Transitions valides (from → to) :
| From | To (allowed) |
|---|---|
| `pending` | `accepted`, `cancelled_by_client`, `cancelled_by_driver`, `cancelled_auto` |
| `accepted` | `driver_arriving`, `cancelled_by_client`, `cancelled_by_driver` |
| `driver_arriving` | `in_progress`, `cancelled_by_client`, `cancelled_by_driver` |
| `in_progress` | `completed` |
| `completed` | (terminal) |
| `cancelled_*` | (terminal) |

---

## 6. Telima Client — Fiches par écran

### Fiche #C-01 : PhoneScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/auth/presentation/screens/phone_screen.dart` |
| **REST** | `POST /auth/request-otp` |
| **DTO Request** | `RequestOtpDto { phone: string (+223XXXXXXXX) }` |
| **DTO Response** | `{ phone: string, expiresInSeconds: number, devOtpCode?: string }` |
| **Prisma** | `OtpCode` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | public |
| **Providers** | SMS (sendtext.sn, ADR-012 / Mock en dev) |
| **Codes d'erreur** | 400 (cooldown, format invalide), 429 (rate limit 5/min), 503 (fournisseur SMS indisponible — OTP supprimé, retry immédiat possible) |
| **Loading** | Spinner sur bouton "Continuer", désactivation pendant la requête |
| **Offline** | Bannière "Hors ligne", mise en file d'attente |
| **Retry** | 3 tentatives, backoff exponentiel, pas de retry sur 400 |
| **Cache** | Aucun |
| **Navigation suivante** | → `/otp?phone=<phone>` |
| **Statut** | 🔧 À implémenter (câblage frontend) |

### Fiche #C-02 : OtpScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/auth/presentation/screens/otp_screen.dart` |
| **REST** | `POST /auth/verify-otp` |
| **DTO Request** | `VerifyOtpDto { phone: string, code: string (4 chiffres) }` |
| **DTO Response** | `{ accessToken: string, refreshToken: string, isNewUser: boolean, user: { id, phone, role, firstName?, lastName? } }` |
| **Prisma** | `OtpCode`, `User`, `RefreshToken` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | public |
| **Providers** | — |
| **Codes d'erreur** | 401 (code invalide/expiré), 403 (compte désactivé, trop de tentatives), 429 (rate limit) |
| **Loading** | Spinner sur bouton de validation |
| **Offline** | Bannière "Hors ligne" |
| **Retry** | Pas de retry automatique (action utilisateur pour renvoyer OTP) |
| **Cache** | Stocker `accessToken` + `refreshToken` dans secure storage |
| **Navigation suivante** | Si `isNewUser=true` → `/profile-creation`. Sinon → `/home` |
| **Statut** | 🔧 À implémenter (câblage frontend). Timer UI = 60s, backend expiration = 5min |

### Fiche #C-03 : ProfileCreationScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/auth/presentation/screens/profile_creation_screen.dart` |
| **REST** | `PATCH /users/me` |
| **DTO Request** | `UpdateUserDto { firstName?: string, lastName?: string, email?: string }` |
| **DTO Response** | `User { id, phone, role, firstName, lastName, email, isActive, createdAt }` |
| **Prisma** | `User` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | client |
| **Providers** | — |
| **Codes d'erreur** | 400 (validation), 401 (non authentifié) |
| **Loading** | Spinner sur bouton "Créer mon profil" |
| **Offline** | Mise en file d'attente |
| **Retry** | 3 tentatives sur 5xx |
| **Cache** | Mettre à jour le profil en cache |
| **Navigation suivante** | → `/home` |
| **Statut** | 🔧 À implémenter (câblage frontend) |

### Fiche #C-04 : HomeScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/home/presentation/screens/home_screen.dart` |
| **REST** | `GET /vehicle-types?serviceType=ride` |
| **DTO Request** | Query param: `serviceType=ride` |
| **DTO Response** | `VehicleType[] { id, name, serviceType, capacity, baseFare, pricePerKm, pricePerMin, commissionPercentage, isActive }` |
| **Prisma** | `VehicleType` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | client |
| **Providers** | Google Maps Flutter |
| **Codes d'erreur** | 401 (token expiré) |
| **Loading** | Skeleton sur la liste des véhicules |
| **Offline** | Utiliser le cache local (Hive) |
| **Retry** | 3 tentatives sur 5xx |
| **Cache** | VehicleTypes : cache 1h (Hive) |
| **Navigation suivante** | → `/address-selection` (après sélection service) |
| **Statut** | ⚠️ À ajuster (remplacer hardcoded par API) |

### Fiche #C-05 : RideBookingScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/ride/presentation/screens/ride_booking_screen.dart` |
| **REST** | `POST /pricing/calculate` puis `POST /trips` |
| **DTO Request (pricing)** | `{ serviceType: "ride", vehicleTypeId: string, pickup: { lat, lng }, dropoff: { lat, lng } }` |
| **DTO Response (pricing)** | `{ estimatedPrice: number, commissionAmount: number, distanceMeters: number, durationSeconds: number }` |
| **DTO Request (create trip)** | `CreateTripDto { serviceType: "ride", vehicleTypeId, pickup: GeoPointDto, pickupAddress, dropoff: GeoPointDto, dropoffAddress, passengerCount?: number, notes?: string }` |
| **DTO Response (create trip)** | `Trip { id, clientId, driverId?, vehicleTypeId, serviceType, status, pickupAddress, dropoffAddress, estimatedPrice, distanceMeters, durationSeconds, paymentMethod, createdAt, ... }` |
| **Prisma** | `VehicleType`, `Trip`, `RideDetails` |
| **Domain Events** | `trip.created` |
| **WS émis** | — (WS join se fait sur l'écran suivant) |
| **WS écoutés** | — |
| **Permissions** | client |
| **Providers** | Google Maps Flutter, Google Distance Matrix (via backend) |
| **Codes d'erreur** | 400 (données invalides), 404 (vehicleType introuvable), 409 (idempotency conflict) |
| **Loading** | Skeleton prix pendant calcul. Spinner pendant création trip. |
| **Offline** | Désactiver le bouton "Commander" |
| **Retry** | Pricing : 3 tentatives. Create trip : pas de retry auto (idempotency key). |
| **Cache** | Pas de cache sur le prix |
| **Navigation suivante** | → `/driver-search?tripId=<id>&mode=ride` |
| **Statut** | 🔧 À implémenter (câblage frontend) |

### Fiche #C-06 : DeliveryBookingScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/delivery/presentation/screens/delivery_booking_screen.dart` |
| **REST** | `POST /pricing/calculate` puis `POST /trips` |
| **DTO Request (create trip)** | `CreateTripDto { serviceType: "delivery", vehicleTypeId, pickup: GeoPointDto, pickupAddress, dropoff: GeoPointDto, dropoffAddress, recipientName?, recipientPhone?, parcelDescription?, parcelWeightKg?, parcelDimensions?, isFragile?, notes? }` |
| **DTO Response** | `Trip` (même structure que #C-05) |
| **Prisma** | `VehicleType`, `Trip`, `DeliveryDetails` |
| **Domain Events** | `trip.created` |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | client |
| **Providers** | Google Maps Flutter |
| **Codes d'erreur** | 400, 404, 409 |
| **Loading** | Skeleton prix. Spinner création. |
| **Offline** | Désactiver bouton commande |
| **Retry** | Pricing : 3 tentatives. Create : pas de retry auto. |
| **Cache** | Aucun |
| **Navigation suivante** | → `/driver-search?tripId=<id>&mode=delivery` |
| **Statut** | ⚠️ À ajuster (retirer sélecteur paiement mobile — cash only V1) |

### Fiche #C-07 : PaymentScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/payment/presentation/screens/payment_screen.dart` |
| **Statut** | ❌ **Hors scope V1 — À supprimer de l'UI** |
| **Raison** | Paiement client = espèces (cash) uniquement en V1. Aucun endpoint client pour paiement mobile. L'infrastructure backend Payment reste générique (interface `PaymentProvider`) pour intégration future V2 sans refonte. |
| **Action** | Retirer du routeur `app_router.dart`. Le flux doit être RideBookingScreen → DriverSearchScreen directement. |

### Fiche #C-08 : DriverSearchScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/ride/presentation/screens/driver_search_screen.dart` |
| **REST** | — (trip déjà créé) |
| **DTO Request** | — |
| **DTO Response** | — |
| **Prisma** | `Trip`, `DispatchAttempt` |
| **Domain Events** | `dispatch.driver_assigned` (backend), `dispatch.failed` (si échec) |
| **WS émis** | `trip:join { tripId }` |
| **WS écoutés** | `ride:driver_accepted { tripId, driverId, driverName, driverPhone, rating }` ou `delivery:pickup_en_route { ... }` (selon mode) |
| **Permissions** | client |
| **Providers** | Google Maps Flutter, Socket.IO |
| **Codes d'erreur** | WS: `ride:cancelled` / `delivery:cancelled` (dispatch échoué, aucun chauffeur) |
| **Loading** | Animation de recherche pulsée (déjà présente dans l'UI) |
| **Offline** | WS se reconnecte automatiquement. Si déconnecté, bannière. |
| **Retry** | WS: reconnexion automatique avec backoff. Pas de retry REST. |
| **Cache** | Aucun |
| **Navigation suivante** | Si chauffeur trouvé → `/ride-tracking` ou `/delivery-tracking`. Si annulé → `/home` avec message. |
| **Statut** | ⚠️ À ajuster (remplacer timers simulés par écoute WS réelle) |

### Fiche #C-09 : RideTrackingScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/ride/presentation/screens/ride_tracking_screen.dart` |
| **REST** | `GET /trips/:id` (récupération détails initiaux) |
| **DTO Response** | `Trip { id, status, pickupAddress, dropoffAddress, estimatedPrice, driver?: { id, user: { firstName, lastName, phone }, rating, vehicle: { brand, model, plateNumber, vehicleType: { name } } } }` |
| **Prisma** | `Trip`, `Driver`, `Vehicle`, `VehicleType` |
| **Domain Events** | `trip.driver_arrived`, `trip.started`, `trip.completed`, `trip.cancelled` |
| **WS émis** | `trip:join { tripId }` (à l'entrée), `ride:rejoin_room` (reconnexion — à renommer depuis `rejoin_trip_room`) |
| **WS écoutés** | `ride:driver_arrived { tripId, status }`, `ride:started { tripId, status }`, `ride:completed { tripId, status }`, `ride:cancelled { tripId, reason }`, `driver:location_update { driverId, lat, lng, heading? }` |
| **Permissions** | client |
| **Providers** | Google Maps Flutter, Socket.IO |
| **Codes d'erreur** | 404 (trip introuvable), WS disconnect |
| **Loading** | Skeleton carte pendant chargement trip |
| **Offline** | WS reconnexion auto. Positions GPS en cache local rejouées à reconnexion. |
| **Retry** | `GET /trips/:id` : 3 tentatives. WS : reconnexion auto. |
| **Cache** | Pas de cache (temps réel) |
| **Navigation suivante** | `ride:completed` → `/home` (ou écran confirmation). `ride:cancelled` → `/home`. Chat → `/chat?tripId=<id>`. |
| **Statut** | ⚠️ À ajuster (passer `kDemoMode=false`, renommer WS events, câbler `TripNotifier` sur WS réels) |

### Fiche #C-10 : DeliveryTrackingScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/delivery/presentation/screens/delivery_tracking_screen.dart` |
| **REST** | `GET /trips/:id` |
| **DTO Response** | `Trip` + `DeliveryDetails { recipientName, recipientPhone, parcelDescription, isFragile }` |
| **Prisma** | `Trip`, `DeliveryDetails`, `Driver`, `Vehicle` |
| **Domain Events** | `trip.started`, `trip.completed`, `trip.cancelled` |
| **WS émis** | `trip:join { tripId }`, `delivery:client_confirmed { tripId }` (confirmation réception), `delivery:rejoin_room` (reconnexion) |
| **WS écoutés** | `delivery:pickup_en_route { tripId, driverId, driverName, driverPhone, rating }`, `delivery:parcel_picked_up { tripId, status }`, `delivery:delivered { tripId, status }`, `delivery:cancelled { tripId, reason }`, `driver:location_update { driverId, lat, lng, heading? }` |
| **Permissions** | client |
| **Providers** | Google Maps Flutter, Socket.IO |
| **Codes d'erreur** | 404, WS disconnect |
| **Loading** | Skeleton carte |
| **Offline** | WS reconnexion auto |
| **Retry** | 3 tentatives sur REST. WS auto. |
| **Cache** | Aucun |
| **Navigation suivante** | `delivery:delivered` + `delivery:client_confirmed` → `/home`. `delivery:cancelled` → `/home`. |
| **Statut** | ⚠️ À ajuster (renommer WS events legacy, câbler WS réels) |

### Fiche #C-11 : ChatScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/chat/presentation/screens/chat_screen.dart` |
| **REST** | `GET /trips/:id/messages` (historique), `POST /chat/upload-audio` (upload fichier audio) |
| **DTO Request (upload)** | multipart: `file` (audio/m4a, max 5MB) |
| **DTO Response (upload)** | `{ url: string }` (URL signée S3) |
| **DTO Response (messages)** | `ChatMessage[] { id, tripId, senderId, senderRole, content?, audioUrl?, createdAt }` |
| **Prisma** | `ChatMessage` (à créer) |
| **Domain Events** | `chat.message_sent` |
| **WS émis** | `message:send { tripId, content?, audioUrl? }` |
| **WS écoutés** | `message:received { id, tripId, senderId, senderRole, content?, audioUrl?, createdAt }` |
| **Permissions** | client |
| **Providers** | Socket.IO, S3 Storage, `flutter_sound` ou `record` (enregistrement audio) |
| **Codes d'erreur** | 400 (fichier trop grand/format invalide), 401, 404 (trip introuvable) |
| **Loading** | Indicateur d'envoi sur le message (pending → sent) |
| **Offline** | Messages en file d'attente, envoyés à reconnexion |
| **Retry** | Upload audio : 3 tentatives. WS : reconnexion auto. |
| **Cache** | Historique messages en mémoire (pas en persistent storage) |
| **Navigation suivante** | Retour à l'écran de tracking |
| **Statut** | 🔧 À implémenter (backend + câblage frontend) |

### Fiche #C-12 : ChargingStationsScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/charging/presentation/screens/charging_stations_screen.dart` |
| **REST** | `GET /battery-swap/stations` |
| **DTO Request** | Query params optionnels: `?lat=&lng=` (pour tri par distance) |
| **DTO Response** | `BatteryStation[] { id, name, address, lat, lng, batteryType, batteryCapacity, batteryPrice, availableBatteries, totalBatteries, openingHours, isActive }` |
| **Prisma** | `BatteryStation` (à créer), `Battery` (à créer) |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | public (ou client) |
| **Providers** | Google Maps Flutter |
| **Codes d'erreur** | 401, 500 |
| **Loading** | Skeleton liste stations |
| **Offline** | Cache local (Hive) 1h |
| **Retry** | 3 tentatives sur 5xx |
| **Cache** | Stations : cache 1h |
| **Navigation suivante** | Détail station (in-page ou modal) |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### Fiche #C-13 : SideMenuScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/features/profile/presentation/screens/side_menu_screen.dart` |
| **REST** | `GET /users/me`, `POST /auth/logout` |
| **DTO Response (me)** | `User { id, phone, role, firstName, lastName, email, isActive, createdAt }` |
| **DTO Request (logout)** | `RefreshTokenDto { refreshToken: string }` |
| **Prisma** | `User`, `RefreshToken` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | client |
| **Providers** | — |
| **Codes d'erreur** | 401 |
| **Loading** | Skeleton profil |
| **Offline** | Cache profil 30min |
| **Retry** | 3 tentatives |
| **Cache** | Profil : cache 30min (Hive) |
| **Navigation suivante** | Items menu : Historique, Mes adresses, Contacts, Paramètres, Aide, CGU, Station de Swap, Parrainage (masquer) |
| **Statut** | ⚠️ À ajuster (câbler `GET /users/me`, masquer "Parrainage") |

### Fiche #C-14 : AddressSelectionScreen

| Champ | Valeur |
|---|---|
| **Fichier** | Via route `/address-selection` |
| **REST** | — (pas d'API dédiée V1) |
| **Prisma** | — |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | client |
| **Providers** | Google Maps Places API (autocomplete) |
| **Navigation suivante** | → `/ride-booking` ou `/delivery-booking` |
| **Statut** | **Hors scope V1** (adresses stockées en local Hive, pas d'API backend) |

---

## 7. Telima Pro — Fiches par écran

### Fiche #D-01 : PhoneScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/phone_screen.dart` |
| **REST** | `POST /auth/request-otp` |
| **DTO Request** | `RequestOtpDto { phone: string }` |
| **DTO Response** | `{ phone, expiresInSeconds, devOtpCode? }` |
| **Prisma** | `OtpCode` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | public |
| **Providers** | SMS (sendtext.sn, ADR-012) |
| **Codes d'erreur** | 400 (cooldown, format), 429 (rate limit), 503 (fournisseur SMS indisponible — retry immédiat possible) |
| **Loading** | Spinner bouton |
| **Offline** | Bannière |
| **Retry** | 3 tentatives, pas sur 400 |
| **Cache** | Aucun |
| **Navigation suivante** | → OtpScreen (state: `authState = 'otp'`) |
| **Statut** | 🔧 À implémenter (câblage frontend) |

### Fiche #D-02 : OtpScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/otp_screen.dart` |
| **REST** | `POST /auth/verify-otp` |
| **DTO Request** | `VerifyOtpDto { phone, code }` |
| **DTO Response** | `{ accessToken, refreshToken, isNewUser, user: { id, phone, role, firstName?, lastName? } }` |
| **Prisma** | `OtpCode`, `User`, `RefreshToken` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | public |
| **Providers** | — |
| **Codes d'erreur** | 401 (invalide/expiré), 403 (bloqué/désactivé), 429 |
| **Loading** | Spinner bouton |
| **Offline** | Bannière |
| **Retry** | Pas d'auto-retry (renvoi OTP par action utilisateur) |
| **Cache** | Tokens en secure storage |
| **Navigation suivante** | Si `isNewUser=true` → OnboardingScreen. Si `role=driver` et profil existe → HomeScreen. |
| **Statut** | 🔧 À implémenter. Timer UI = 45s (`Constants.otpTimeoutSeconds`), à aligner sur 60s minimum. |

### Fiche #D-03 : OnboardingScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/onboarding_screen.dart` |
| **REST** | (1) `PATCH /users/me` (firstName, lastName), (2) `POST /drivers/upload-document` (×3: permis, carte d'identité, carte grise), (3) `POST /drivers/register` |
| **DTO Request (upload)** | multipart: `file` + query `?type=license|id_card|registration_doc|photo` |
| **DTO Response (upload)** | `{ url: string }` |
| **DTO Request (register)** | `RegisterDriverDto { photoUrl?, licenseUrl, idCardUrl, vehicle: { vehicleTypeId, brand, model, year, plateNumber, energy, registrationDocUrl? } }` |
| **DTO Response (register)** | `Driver { id, userId, status, rating, balance, commissionDue, isOnline, photoUrl, licenseUrl, idCardUrl, validatedAt?, ... }` |
| **Prisma** | `User`, `Driver`, `Vehicle`, `VehicleType` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | driver |
| **Providers** | S3 Storage, `image_picker` |
| **Codes d'erreur** | 400 (validation), 409 (profil déjà existant), 401 |
| **Loading** | Progress bar par étape (3 pages). Spinner sur bouton submit final. |
| **Offline** | Documents en cache local, upload à reconnexion |
| **Retry** | Upload : 3 tentatives. Register : pas de retry auto. |
| **Cache** | Aucun |
| **Navigation suivante** | → WaitingValidationScreen |
| **Statut** | ⚠️ À ajuster. UI capture `firstName/lastName` mais `RegisterDriverDto` ne les inclut pas → utiliser `PATCH /users/me` d'abord. UI capture "clim" (Avec/Sans) → non stocké dans `Vehicle` → à ajouter comme champ ou gérer via `VehicleType`. |

### Fiche #D-04 : WaitingValidationScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/waiting_validation_screen.dart` |
| **REST** | `GET /drivers/me` (polling toutes les 30s) |
| **DTO Response** | `Driver { id, status: 'pending_validation' | 'validated' | 'suspended' | 'rejected', ... }` |
| **Prisma** | `Driver` |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | — (futur: FCM push `driver:validated`) |
| **Permissions** | driver |
| **Providers** | FCM (notification validation — Sprint 3) |
| **Codes d'erreur** | 401, 404 (profil introuvable) |
| **Loading** | Animation attente |
| **Offline** | Polling suspendu, reprise à reconnexion |
| **Retry** | Polling auto toutes les 30s |
| **Cache** | Aucun |
| **Navigation suivante** | Si `status=validated` → HomeScreen. Si `status=rejected` → message + retour onboarding. |
| **Statut** | 🔧 À implémenter (câblage frontend, remplacer `Future.delayed(3s)` par polling) |

### Fiche #D-05 : HomeScreen (Driver)

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/home/home_screen.dart` |
| **REST** | `PATCH /drivers/me/online-status`, `GET /drivers/me` |
| **DTO Request** | `UpdateOnlineStatusDto { isOnline: boolean }` |
| **DTO Response (me)** | `Driver { id, status, rating, balance, commissionDue, isOnline, vehicle?: Vehicle, ... }` |
| **Prisma** | `Driver`, `Trip` |
| **Domain Events** | `driver.online`, `driver.offline` |
| **WS émis** | `driver:join_room { driverId }` (à la connexion), `driver:online` (via REST + WS), `driver:offline` |
| **WS écoutés** | `trip:new_request { tripId, serviceType, pickupAddress, dropoffAddress, estimatedPrice, commission, distanceMeters, clientName, clientRating, vehicleTypeName, recipientName?, recipientPhone?, parcelDescription? }` |
| **Permissions** | driver |
| **Providers** | Google Maps Flutter, Socket.IO (à implémenter), FCM |
| **Codes d'erreur** | 401, 403 (statut non validé) |
| **Loading** | Toggle online/offline avec spinner |
| **Offline** | WS reconnexion auto. Si offline, ne peut pas recevoir de courses. |
| **Retry** | WS reconnexion auto. REST : 3 tentatives. |
| **Cache** | Profil driver : cache 5min |
| **Navigation suivante** | `trip:new_request` → TripRequestScreen (overlay). CommissionLock si `commissionDue > seuil`. Drawer → FinanceScreen, HistoryScreen, etc. |
| **Statut** | 🔧 À implémenter (SocketService à créer, CommissionLock seuil à rendre configurable) |

### Fiche #D-06 : TripRequestScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/trip_request_screen.dart` |
| **REST** | — (via WS uniquement) |
| **Prisma** | `Trip`, `DispatchAttempt` |
| **Domain Events** | `trip.accepted` (après accept), `dispatch.failed` (si tous refusent) |
| **WS émis** | `trip:accept { tripId }` ou `trip:decline { tripId, reason? }` |
| **WS écoutés** | — (timeout côté UI : 40s) |
| **Permissions** | driver |
| **Providers** | Audio (son + vibration), `HapticFeedback` |
| **Codes d'erreur** | WS: si trip déjà assigné à un autre → `trip:new_request` n'arrive plus pour ce trip |
| **Loading** | Countdown timer 40s |
| **Offline** | Si WS déconnecté pendant le ping, la course est perdue |
| **Retry** | Pas de retry (action unique accept/decline) |
| **Cache** | Aucun |
| **Navigation suivante** | Accept → PickupScreen (`tripStatus = 'approaching'`). Decline/Timeout → HomeScreen (`tripStatus = 'idle'`). |
| **Statut** | 🔧 À implémenter (câblage WS). Timer UI 40s à aligner avec timeout backend dispatch. |

### Fiche #D-07 : PickupScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/pickup_screen.dart` |
| **REST** | `PATCH /trips/:id/status` |
| **DTO Request** | `UpdateTripStatusDto { status: "driver_arriving" }` puis `{ status: "driver_arriving" }` (arrivé sur place) |
| **DTO Response** | `Trip { id, status, ... }` |
| **Prisma** | `Trip` |
| **Domain Events** | `trip.driver_arrived` |
| **WS émis** | `driver:position { driverId, lat, lng, heading? }` (GPS broadcast régulier) |
| **WS écoutés** | `ride:cancelled { tripId, reason }` ou `delivery:cancelled { tripId, reason }` |
| **Permissions** | driver |
| **Providers** | Google Maps Flutter, Socket.IO, GPS (`geolocator`) |
| **Codes d'erreur** | 400 (transition invalide), 403 (pas le chauffeur assigné), 404 |
| **Loading** | Spinner sur bouton "Je suis arrivé" |
| **Offline** | GPS positions en cache local, envoyées en batch à reconnexion |
| **Retry** | `PATCH /trips/:id/status` : 3 tentatives. GPS : envoi continu. |
| **Cache** | Aucun |
| **Navigation suivante** | "Démarrer la course" → InRouteScreen (`tripStatus = 'in_progress'`). Chat → ChatScreen. |
| **Statut** | 🔧 À implémenter (câblage REST + WS + GPS) |

### Fiche #D-08 : InRouteScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/in_route_screen.dart` |
| **REST** | `PATCH /trips/:id/status` |
| **DTO Request** | `UpdateTripStatusDto { status: "in_progress" }` |
| **DTO Response** | `Trip { ... }` |
| **Prisma** | `Trip` |
| **Domain Events** | `trip.started` |
| **WS émis** | `driver:position { driverId, lat, lng, heading? }` |
| **WS écoutés** | `ride:cancelled` / `delivery:cancelled` |
| **Permissions** | driver |
| **Providers** | Google Maps Flutter, Socket.IO, GPS |
| **Codes d'erreur** | 400 (transition invalide), 403, 404 |
| **Loading** | Spinner sur bouton "Terminer" |
| **Offline** | GPS en cache local |
| **Retry** | 3 tentatives sur REST |
| **Cache** | Aucun |
| **Navigation suivante** | "Arrivé à destination" → ClosingScreen (`tripStatus = 'closing'`). Chat → ChatScreen. |
| **Statut** | 🔧 À implémenter (câblage REST + WS + GPS) |

### Fiche #D-09 : ClosingScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/closing_screen.dart` |
| **REST** | `POST /trips/:id/payment-received` puis `PATCH /trips/:id/status` |
| **DTO Request (payment-received)** | `PaymentReceivedDto { amount: number }` (à créer) |
| **DTO Request (status)** | `UpdateTripStatusDto { status: "completed" }` |
| **DTO Response** | `Trip { id, status: "completed", finalPrice, ... }` |
| **Prisma** | `Trip`, `Driver` (balance + commissionDue mis à jour) |
| **Domain Events** | `trip.completed` |
| **WS émis** | — (backend broadcast `ride:completed` / `delivery:delivered` au client) |
| **WS écoutés** | — |
| **Permissions** | driver |
| **Providers** | — |
| **Codes d'erreur** | 400 (transition invalide), 403, 404 |
| **Loading** | Spinner sur bouton "Montant encaissé - Clôturer" |
| **Offline** | Mise en file d'attente (action critique) |
| **Retry** | 3 tentatives. Idempotency-Key recommandé. |
| **Cache** | Aucun |
| **Navigation suivante** | → RatingScreen (`tripStatus = 'rating'`) |
| **Statut** | 🔧 À implémenter (backend endpoint `payment-received` à créer + câblage frontend) |

### Fiche #D-10 : RatingScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/rating_screen.dart` |
| **REST** | `POST /trips/:id/rating` |
| **DTO Request** | `CreateRatingDto { rating: number (1-5), tags?: string[] }` (à créer) |
| **DTO Response** | `{ id, tripId, rating, tags, createdAt }` |
| **Prisma** | `TripRating` (à créer) |
| **Domain Events** | `trip.rated` (à créer) |
| **WS émis** | — |
| **WS écoutés** | — |
| **Permissions** | driver |
| **Providers** | — |
| **Codes d'erreur** | 400 (rating invalide), 404, 409 (déjà noté) |
| **Loading** | Spinner sur bouton "Envoyer" |
| **Offline** | Mise en file d'attente |
| **Retry** | 3 tentatives |
| **Cache** | Aucun |
| **Navigation suivante** | → HomeScreen (`tripStatus = 'idle'`) |
| **Statut** | 🔧 À implémenter (backend endpoint + modèle + câblage frontend) |

### Fiche #D-11 : FinanceScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/finance/finance_screen.dart` |
| **REST** | `GET /drivers/me/finances`, `GET /trips/me?role=driver&page=1&limit=20` |
| **DTO Response (finances)** | `{ balance: number, commissionDue: number, commissionPaid: number, totalEarnings: number, todayEarnings: number, weekEarnings: number, monthEarnings: number }` (à créer) |
| **DTO Response (trips)** | `{ data: Trip[], total, page, limit }` |
| **Prisma** | `Driver`, `Trip`, `CommissionPayment` (à créer) |
| **Domain Events** | — |
| **WS émis** | — |
| **WS écoutés** | `payment:confirmed { transactionId, amount, driverId }` (si écran ouvert) |
| **Permissions** | driver |
| **Providers** | — |
| **Codes d'erreur** | 401, 500 |
| **Loading** | Skeleton graphiques + liste |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | Finances : cache 5min. Historique : cache 5min. |
| **Navigation suivante** | OrangeMoneySheet (via bouton "Payer commission"). Drawer → autres écrans. |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |

### Fiche #D-12 : OrangeMoneySheet

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/finance/orange_money_sheet.dart` |
| **REST** | `POST /payments/commission` |
| **DTO Request** | `PayCommissionDto { amount: number, phoneNumber: string }` (à créer) |
| **DTO Response** | `{ transactionId: string, status: "pending", message: string }` |
| **Prisma** | `CommissionPayment` (à créer) |
| **Domain Events** | `payment.succeeded` (après webhook) |
| **WS émis** | — |
| **WS écoutés** | `payment:confirmed { transactionId, amount, driverId }` |
| **Permissions** | driver |
| **Providers** | Orange Money API (via backend) |
| **Codes d'erreur** | 400 (montant invalide), 402 (paiement échoué), 429 |
| **Loading** | Spinner pendant initiation. Attente confirmation WS. |
| **Offline** | Action bloquée (nécessite connexion pour initier + recevoir confirmation) |
| **Retry** | Pas de retry auto (risque double paiement). Vérifier statut via `GET /drivers/me/finances`. |
| **Cache** | Aucun |
| **Navigation suivante** | Confirmation → retour FinanceScreen. |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |

### Fiche #D-13 : CommissionLockScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/widgets/commission_lock.dart` |
| **REST** | `GET /drivers/me` (vérification commissionDue) |
| **Prisma** | `Driver` (commissionDue) |
| **Permissions** | driver |
| **Providers** | — |
| **Navigation suivante** | Bouton "Payer" → FinanceScreen → OrangeMoneySheet |
| **Statut** | ⚠️ À ajuster (seuil 5000 FCFA hardcodé → rendre configurable backend) |

### Fiche #D-14 : HistoryScreen

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/drawer/history_screen.dart` |
| **REST** | `GET /trips/me?role=driver&page=1&limit=20` |
| **DTO Response** | `{ data: Trip[], total, page, limit }` |
| **Prisma** | `Trip` |
| **Permissions** | driver |
| **Loading** | Skeleton liste + pagination |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | Historique : cache 5min |
| **Navigation suivante** | Détail trip (si implémenté) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### Fiche #D-15 : ChatScreen (Telima Pro)

| Champ | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/chat_screen.dart` |
| **REST** | `GET /trips/:id/messages`, `POST /chat/upload-audio` |
| **Prisma** | `ChatMessage` (à créer) |
| **Domain Events** | `chat.message_sent` |
| **WS émis** | `message:send { tripId, content?, audioUrl? }` |
| **WS écoutés** | `message:received { id, tripId, senderId, senderRole, content?, audioUrl?, createdAt }` |
| **Permissions** | driver |
| **Providers** | Socket.IO, S3 Storage, audio recording |
| **Navigation suivante** | Retour à PickupScreen / InRouteScreen |
| **Statut** | 🔧 À implémenter (backend Sprint 3 + câblage frontend) |

---

## 8. Telima Dashboard — Fiches par page

### Fiche #A-01 : Login (à créer)

| Champ | Valeur |
|---|---|
| **Fichier** | À créer : `src/Pages/Login.jsx` |
| **REST** | `POST /auth/admin-login` |
| **DTO Request** | `AdminLoginDto { email: string, password: string }` (à créer) |
| **DTO Response** | `{ accessToken, refreshToken, user: { id, email, role: "admin" } }` |
| **Prisma** | `User` (role: admin, + `passwordHash` à ajouter) |
| **Permissions** | public → admin |
| **Providers** | — |
| **Codes d'erreur** | 401 (identifiants invalides), 403 (non admin) |
| **Loading** | Spinner bouton |
| **Offline** | Bannière |
| **Retry** | Pas d'auto-retry (sécurité) |
| **Cache** | Tokens en localStorage |
| **Navigation suivante** | → `/dashboard` |
| **Statut** | 🔧 À implémenter (backend + UI) |

### Fiche #A-02 : Dashboard

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Dashboard.jsx` |
| **REST** | `GET /admin/stats` |
| **DTO Response** | `{ totalRevenue, totalRides, totalDeliveries, activeDrivers, registeredClients, revenueByService: { ride, delivery, batterySwap } }` (à créer) |
| **Prisma** | `Trip`, `Driver`, `User` (agrégations) |
| **Permissions** | admin |
| **Loading** | Skeleton KPIs + graphiques |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | Stats : cache 5min |
| **Navigation suivante** | Items sidebar |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### Fiche #A-03 : Drivers

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Drivers.jsx` |
| **REST** | `GET /drivers?status=...` |
| **DTO Response** | `Driver[] { id, status, rating, isOnline, user: { firstName, lastName, phone, email }, vehicle?: { brand, model, plateNumber, vehicleType: { name } } }` |
| **Prisma** | `Driver`, `User`, `Vehicle` |
| **Permissions** | admin |
| **Loading** | Skeleton tableau |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | Liste drivers : cache 5min |
| **Navigation suivante** | → DriverDetails |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### Fiche #A-04 : DriverDetails / Validation

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/DriverDetails.jsx` (ou intégrée) |
| **REST** | `GET /drivers/:id`, `PATCH /drivers/:id/validate`, `PATCH /drivers/:id/suspend` |
| **DTO Request (suspend)** | `SuspendDriverDto { reason: string }` |
| **DTO Response** | `Driver` complet |
| **Prisma** | `Driver`, `User`, `Vehicle` |
| **Permissions** | admin |
| **Providers** | S3 (visualisation documents) |
| **Codes d'erreur** | 404, 400 |
| **Loading** | Spinner sur boutons valider/suspendre |
| **Offline** | Mise en file d'attente |
| **Retry** | 3 tentatives |
| **Cache** | Aucun |
| **Navigation suivante** | Retour à liste Drivers |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### Fiche #A-05 : Clients

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Clients.jsx` |
| **REST** | `GET /users?role=client` (à créer) |
| **DTO Response** | `User[] { id, phone, firstName, lastName, email, createdAt }` |
| **Prisma** | `User` |
| **Permissions** | admin |
| **Loading** | Skeleton tableau |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | 5min |
| **Navigation suivante** | → ClientDetails (si implémenté) |
| **Statut** | 🔧 À implémenter (backend: étendre `GET /users` avec filtre rôle + câblage frontend) |

### Fiche #A-06 : Courses

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Courses.jsx` |
| **REST** | `GET /trips?service=&status=&from=&to=&search=` (à créer pour admin) |
| **DTO Response** | `{ data: Trip[], total, page, limit }` |
| **Prisma** | `Trip`, `User`, `Driver`, `VehicleType` |
| **Permissions** | admin |
| **Loading** | Skeleton tableau + filtres |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | 5min |
| **Navigation suivante** | → CourseDetails |
| **Statut** | 🔧 À implémenter (backend: `GET /trips` admin + câblage frontend) |

### Fiche #A-07 : CourseDetails

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/CourseDetails.jsx` (ou intégrée) |
| **REST** | `GET /trips/:id` |
| **DTO Response** | `Trip` avec relations complètes (client, driver, vehicleType, rideDetails, deliveryDetails, dispatchAttempts) |
| **Prisma** | `Trip` + relations |
| **Permissions** | admin |
| **Loading** | Skeleton détail |
| **Offline** | Aucun |
| **Retry** | 3 tentatives |
| **Cache** | Aucun |
| **Navigation suivante** | Retour à Courses |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### Fiche #A-08 : Payments

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Payments.jsx` |
| **REST** | `GET /admin/commissions` (à créer) |
| **DTO Response** | `{ drivers: [{ driverId, driverName, totalDue, totalPaid, courses: Trip[] }] }` (à créer) |
| **Prisma** | `Driver`, `Trip`, `CommissionPayment` |
| **Permissions** | admin |
| **Loading** | Skeleton tableau |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | 5min |
| **Navigation suivante** | Détail chauffeur (Payments) |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |

### Fiche #A-09 : Finances

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Finances.jsx` |
| **REST** | `GET /admin/finances` (à créer) |
| **DTO Response** | `{ dailyRevenue, monthlyRevenue, totalRevenue, totalCommissions, transactions: [{ id, type, amount, date, description }] }` (à créer) |
| **Prisma** | `Trip`, `Driver`, `CommissionPayment` |
| **Permissions** | admin |
| **Loading** | Skeleton KPIs + graphiques |
| **Offline** | Cache 5min |
| **Retry** | 3 tentatives |
| **Cache** | 5min |
| **Navigation suivante** | Items sidebar |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend). Retirer "Salaire" chauffeur de l'UI. |

### Fiche #A-10 : Stations

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Stations.jsx` |
| **REST** | `GET /battery-swap/stations`, `POST /battery-swap/stations`, `PUT /battery-swap/stations/:id`, `DELETE /battery-swap/stations/:id` |
| **DTO Request (create)** | `CreateStationDto { name, address, lat, lng, batteryType, batteryCapacity, batteryPrice, openingHours }` (à créer) |
| **DTO Response** | `BatteryStation[]` |
| **Prisma** | `BatteryStation` (à créer), `Battery` (à créer) |
| **Permissions** | admin (CRUD), public/client (GET) |
| **Loading** | Skeleton tableau + formulaire |
| **Offline** | Cache 1h |
| **Retry** | 3 tentatives |
| **Cache** | Stations : cache 1h |
| **Navigation suivante** | → BatteryStationDetails |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### Fiche #A-11 : Batteries

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Batteries.jsx` |
| **REST** | `GET /battery-swap/batteries`, `POST /battery-swap/batteries`, `PUT /battery-swap/batteries/:id`, `DELETE /battery-swap/batteries/:id` |
| **DTO Request (create)** | `CreateBatteryDto { type, capacity, quantity, stationId }` (à créer) |
| **DTO Response** | `Battery[]` |
| **Prisma** | `Battery` (à créer) |
| **Permissions** | admin |
| **Loading** | Skeleton tableau |
| **Offline** | Cache 1h |
| **Retry** | 3 tentatives |
| **Cache** | 1h |
| **Navigation suivante** | Retour à Stations |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### Fiche #A-12 : Reports

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/Reports.jsx` |
| **REST** | `GET /admin/reports` (à créer) |
| **DTO Response** | `{ vehicleStats, driverStats, monthlyEvolution }` (à créer) |
| **Prisma** | `Trip`, `Driver`, `VehicleType` |
| **Permissions** | admin |
| **Loading** | Skeleton graphiques |
| **Offline** | Cache 30min |
| **Retry** | 3 tentatives |
| **Cache** | Reports : cache 30min |
| **Navigation suivante** | Items sidebar |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### Fiche #A-13 : ParametrageTarification

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageTarification.jsx` |
| **REST** | `GET /vehicle-types`, `PATCH /vehicle-types/:id` |
| **DTO Request** | `UpdateVehicleTypeDto { baseFare?, pricePerKm?, pricePerMin?, commissionPercentage? }` |
| **DTO Response** | `VehicleType[]` |
| **Prisma** | `VehicleType` |
| **Permissions** | admin |
| **Loading** | Skeleton tableau |
| **Offline** | Cache 1h |
| **Retry** | 3 tentatives |
| **Cache** | VehicleTypes : cache 1h |
| **Navigation suivante** | Items sidebar |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### Fiche #A-14 : ParametrageVehicules

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageVehicules.jsx` |
| **REST** | `GET /vehicle-types?includeInactive=true`, `POST /vehicle-types`, `PATCH /vehicle-types/:id`, `DELETE /vehicle-types/:id` |
| **DTO Request (create)** | `CreateVehicleTypeDto { name, serviceType, capacity, baseFare, pricePerKm, pricePerMin, commissionPercentage, isActive? }` |
| **DTO Request (update)** | `UpdateVehicleTypeDto` (PartialType) |
| **DTO Response** | `VehicleType` |
| **Prisma** | `VehicleType` |
| **Permissions** | admin |
| **Loading** | Skeleton tableau + formulaire |
| **Offline** | Cache 1h |
| **Retry** | 3 tentatives |
| **Cache** | 1h |
| **Navigation suivante** | Items sidebar |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### Fiche #A-15 : ParametrageCommissions

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageCommissions.jsx` |
| **REST** | `GET /vehicle-types`, `PATCH /vehicle-types/:id` |
| **DTO Request** | `UpdateVehicleTypeDto { commissionPercentage? }` |
| **DTO Response** | `VehicleType[]` |
| **Prisma** | `VehicleType` |
| **Permissions** | admin |
| **Loading** | Skeleton tableau |
| **Offline** | Cache 1h |
| **Retry** | 3 tentatives |
| **Cache** | 1h |
| **Navigation suivante** | Items sidebar |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### Fiche #A-16 : ParametrageZones

| Champ | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageZones.jsx` |
| **REST** | `GET /admin/zones`, `POST /admin/zones`, `PUT /admin/zones/:id`, `DELETE /admin/zones/:id` |
| **DTO Request (create)** | `CreateZoneDto { name, city, radiusKm, surgeMultiplier, isActive }` (à créer) |
| **DTO Response** | `ServiceZone[]` |
| **Prisma** | `ServiceZone` (à créer) |
| **Permissions** | admin |
| **Loading** | Skeleton tableau + formulaire |
| **Offline** | Cache 1h |
| **Retry** | 3 tentatives |
| **Cache** | 1h |
| **Navigation suivante** | Items sidebar |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |

---

## 9. Vérification de cohérence finale

### 9.1 Modèles Prisma ↔ DTO

| Modèle Prisma | DTO correspondant | Cohérent ? | Note |
|---|---|---|---|
| `User` | `UpdateUserDto` | ✅ | firstName, lastName, email couverts |
| `OtpCode` | `RequestOtpDto`, `VerifyOtpDto` | ✅ | Phone + code (4 chiffres) |
| `Driver` | `RegisterDriverDto` | ⚠️ | `RegisterDriverDto` n'inclut pas firstName/lastName (gérés via `PATCH /users/me`). UI Telima Pro capture ces champs sur l'onboarding → ordre des appels à respecter. |
| `Vehicle` | `VehicleInputDto` (nested dans RegisterDriverDto) | ⚠️ | UI capture "clim" (Avec/Sans) → pas de champ dans `Vehicle`. Soit ajouter champ `hasAC: Boolean?` sur `Vehicle`, soit gérer via `VehicleType` (ex: "Voiture Éco" vs "Voiture Climatisée"). Recommandation : gérer via VehicleType (déjà le cas côté Dashboard). |
| `VehicleType` | `CreateVehicleTypeDto`, `UpdateVehicleTypeDto` | ✅ | Tous champs couverts |
| `Trip` | `CreateTripDto` | ✅ | serviceType, vehicleTypeId, pickup/dropoff, détails livraison/course |
| `Trip` | `UpdateTripStatusDto` | ✅ | status + cancelReason |
| `RideDetails` | Créé automatiquement par backend | ✅ | passengerCount, notes |
| `DeliveryDetails` | Créé automatiquement par backend | ✅ | recipientName, recipientPhone, parcelDescription, etc. |

### 9.2 Contrôleurs REST ↔ Endpoints du contrat

| Endpoint existant (Sprint 1-2) | Contrôleur | Cohérent avec contrat ? |
|---|---|---|
| `POST /auth/request-otp` | AuthController | ✅ |
| `POST /auth/verify-otp` | AuthController | ✅ |
| `POST /auth/refresh` | AuthController | ✅ |
| `POST /auth/logout` | AuthController | ✅ |
| `GET /users/me` | UsersController | ✅ |
| `PATCH /users/me` | UsersController | ✅ |
| `POST /drivers/upload-document` | DriversController | ✅ |
| `POST /drivers/register` | DriversController | ✅ |
| `GET /drivers/me` | DriversController | ✅ |
| `PATCH /drivers/me/online-status` | DriversController | ✅ |
| `GET /drivers` (admin) | DriversController | ✅ |
| `GET /drivers/:id` (admin) | DriversController | ✅ |
| `PATCH /drivers/:id/validate` (admin) | DriversController | ✅ |
| `PATCH /drivers/:id/suspend` (admin) | DriversController | ✅ |
| `GET /vehicle-types` | VehicleTypesController | ✅ |
| `GET /vehicle-types/:id` | VehicleTypesController | ✅ |
| `POST /vehicle-types` (admin) | VehicleTypesController | ✅ |
| `PATCH /vehicle-types/:id` (admin) | VehicleTypesController | ✅ |
| `DELETE /vehicle-types/:id` (admin) | VehicleTypesController | ✅ |
| `POST /trips` | TripsController | ✅ |
| `GET /trips/me` | TripsController | ✅ |
| `GET /trips/:id` | TripsController | ✅ |
| `PATCH /trips/:id/status` | TripsController | ✅ |

| Endpoint à créer (Sprint 3-6) | Sprint | Cohérent avec contrat ? |
|---|---|---|
| `POST /trips/:id/accept` | 3 | ✅ (ou via WS `trip:accept` — à décider : REST ou WS ? Recommandation : REST pour fiabilité, WS pour notification) |
| `POST /trips/:id/decline` | 3 | ✅ (ou via WS `trip:decline`) |
| `POST /trips/:id/payment-received` | 3 | ✅ |
| `POST /trips/:id/rating` | 3 | ✅ |
| `POST /tracking/position` | 3 | ✅ (ou via WS `driver:position` uniquement) |
| `GET /trips/:id/messages` | 3 | ✅ |
| `POST /chat/upload-audio` | 3 | ✅ |
| `POST /devices/register` | 3 | ✅ |
| `DELETE /devices/:token` | 3 | ✅ |
| `POST /pricing/calculate` | 4 | ✅ |
| `POST /payments/commission` | 5 | ✅ |
| `POST /payments/webhook` | 5 | ✅ |
| `GET /drivers/me/finances` | 5 | ✅ |
| `GET /admin/zones` (+ CRUD) | 5 | ✅ |
| `GET /admin/pricing-rules` (+ CRUD) | 5 | ✅ |
| `POST /auth/admin-login` | 6 | ✅ |
| `GET /admin/stats` | 6 | ✅ |
| `GET /admin/finances` | 6 | ✅ |
| `GET /admin/reports` | 6 | ✅ |
| `GET /admin/commissions` | 6 | ✅ |
| `GET /users` (admin) | 6 | ✅ |
| `GET /trips` (admin) | 6 | ✅ |
| `GET/POST/PUT/DELETE /battery-swap/stations` | 6 | ✅ |
| `GET/POST/PUT/DELETE /battery-swap/batteries` | 6 | ✅ |

### 9.3 Domain Events ↔ WS Events ↔ Workflows

| Workflow métier | Domain Event | WS Event (client) | WS Event (driver) | Cohérent ? |
|---|---|---|---|---|
| Client crée course | `trip.created` | — | `trip:new_request` (via dispatch) | ✅ |
| Dispatch assigne chauffeur | `dispatch.driver_assigned` | `ride:driver_accepted` / `delivery:pickup_en_route` | — | ✅ |
| Dispatch échoue (aucun chauffeur) | `dispatch.failed` | `ride:cancelled` / `delivery:cancelled` | — | ✅ |
| Chauffeur signale arrivée | `trip.driver_arrived` | `ride:driver_arrived` / `delivery:pickup_en_route` | — | ✅ |
| Chauffeur démarre course | `trip.started` | `ride:started` / `delivery:parcel_picked_up` | — | ✅ |
| Chauffeur termine course | `trip.completed` | `ride:completed` / `delivery:delivered` | — | ✅ |
| Client/driver annule | `trip.cancelled` | `ride:cancelled` / `delivery:cancelled` | `ride:cancelled` / `delivery:cancelled` | ✅ |
| Chauffeur envoie position | — | `driver:location_update` | `driver:position` (émission) | ✅ |
| Chat message | `chat.message_sent` (à créer) | `message:received` | `message:received` | ✅ |
| Commission payée | `payment.succeeded` | — | `payment:confirmed` | ✅ |

### 9.4 Permissions ↔ Endpoints

| Endpoint | Rôle requis | Cohérent avec UI ? |
|---|---|---|
| `POST /auth/request-otp` | public | ✅ (écrans auth Telima + Telima Pro) |
| `POST /auth/verify-otp` | public | ✅ |
| `POST /auth/admin-login` | public | ✅ (Login Dashboard) |
| `GET/PATCH /users/me` | client/driver/admin | ✅ |
| `GET /users` (admin) | admin | ✅ (Dashboard Clients) |
| `POST /drivers/register` | driver | ✅ (Telima Pro Onboarding) |
| `GET /drivers/me` | driver | ✅ (Telima Pro) |
| `PATCH /drivers/me/online-status` | driver | ✅ (Telima Pro HomeScreen) |
| `GET /drivers` | admin | ✅ (Dashboard Drivers) |
| `PATCH /drivers/:id/validate` | admin | ✅ (Dashboard DriverDetails) |
| `PATCH /drivers/:id/suspend` | admin | ✅ (Dashboard DriverDetails) |
| `POST /trips` | client | ✅ (Telima RideBooking/DeliveryBooking) |
| `GET /trips/me` | client/driver | ✅ (Telima + Telima Pro History) |
| `GET /trips/:id` | client/driver/admin | ✅ (Tracking + Dashboard CourseDetails) |
| `PATCH /trips/:id/status` | driver (la plupart) / client (cancel) | ✅ |
| `GET /vehicle-types` | public/client/driver/admin | ✅ |
| `POST/PATCH/DELETE /vehicle-types` | admin | ✅ (Dashboard ParametrageVehicules) |

### 9.5 Incohérences résiduelles identifiées

| # | Incohérence | Impact | Résolution | Sprint |
|---|---|---|---|---|
| 1 | `RegisterDriverDto` n'inclut pas `firstName/lastName` | UI Telima Pro onboarding capture ces champs | Appeler `PATCH /users/me` avant `POST /drivers/register` | 3 |
| 2 | `Vehicle` n'a pas de champ `hasAC` (clim) | UI Telima Pro onboarding capture "Avec/Sans clim" | Gérer via `VehicleType` (ex: "Voiture Éco" vs "Voiture Climatisée"). Ne pas ajouter de champ sur Vehicle. | 3 |
| 3 | `POST /trips/:id/accept` vs WS `trip:accept` | Ambiguïté : REST ou WS pour accept/decline ? | **Décision** : utiliser `PATCH /trips/:id/status { status: "accepted" }` (déjà existant). WS `trip:accept`/`trip:decline` deviennent des notifications au dispatch, pas des endpoints REST séparés. Le dispatch notifie via WS `trip:new_request`, le driver répond via WS `trip:accept`/`trip:decline`, le backend appelle `updateStatus` en interne. | 3 |
| 4 | `POST /pricing/calculate` n'existe pas encore | Telima a besoin de calculer le prix avant création trip | Créer PricingController dans Sprint 4 (ou Sprint 3 si nécessaire pour tests) | 3-4 |
| 5 | Timer OTP Telima Pro = 45s vs backend cooldown = 60s | UX : utilisateur peut demander renvoi avant le cooldown backend | Aligner timer UI sur 60s | 3 |
| 6 | `delivery:client_confirmed` émis par client mais pas géré côté backend | Le backend ne traite pas cette confirmation | Ajouter handler WS `delivery:client_confirmed` qui émet un event et met à jour le trip | 3 |
| 7 | `delivery_issue_reported` (Telima client) sans équivalent backend | Signalement incident livraison non traité | Ajouter endpoint `POST /trips/:id/issue` ou WS event `trip:issue` (Sprint 3 ou post-V1) | 3+ |
| 8 | Dashboard `Finances.jsx` inclut "Salaire" chauffeur | Concept non applicable (commission ≠ salaire) | Retirer de l'UI | 6 |
| 9 | `GET /users` (admin) n'existe pas | Dashboard Clients a besoin de la liste | Étendre UsersController avec `GET /users?role=client` (admin) | 6 |
| 10 | `GET /trips` (admin, tous) n'existe pas | Dashboard Courses a besoin de tous les trips | Étendre TripsController avec `GET /trips` (admin, filtres) | 6 |

---

## 10. Glossaire des statuts

### Statuts de fiche
| Statut | Définition |
|---|---|
| ✅ **OK** | Backend existant et conforme, câblage frontend prêt |
| 🔧 **À implémenter** | Backend à créer et/ou câblage frontend à réaliser |
| ⚠️ **À ajuster** | Backend ou UI nécessite modification mineure |
| ❌ **Hors scope V1** | Écran/élément obsolète en V1, à supprimer de l'UI |

### Récapitulatif par app

| App | Total écrans | OK | À implémenter | À ajuster | Hors scope V1 |
|---|---|---|---|---|---|
| **Telima Client** | 14 | 0 | 8 | 4 | 2 (PaymentScreen, AddressSelection) |
| **Telima Pro** | 15 | 0 | 12 | 3 | 0 |
| **Telima Dashboard** | 16 | 0 | 16 | 0 | 0 |
| **Total** | 45 | 0 | 36 | 7 | 2 |

### Endpoints REST — Récapitulatif par statut

| Statut | Count | Endpoints |
|---|---|---|
| ✅ Existant | 22 | Auth (4), Users (2), Drivers (8), VehicleTypes (5), Trips (4) — moins 1 doublon |
| 🔧 À créer | 24 | Trip extensions (4), Tracking (1), Chat (3), Devices (2), Pricing (1), Payments (2), Admin (7), BatterySwap (4) |
| **Total** | 46 | |

### Modèles Prisma — Récapitulatif

| Statut | Count | Modèles |
|---|---|---|
| ✅ Existant | 16 | User, OtpCode, RefreshToken, Driver, Vehicle, VehicleType, Capability, VehicleTypeCapability, DriverCapability, Trip, TripStop, RideDetails, DeliveryDetails, ServiceConfig, ServiceRequirement, DispatchAttempt |
| 🔧 À créer | 8 | ChatMessage, TripRating, DeviceToken, CommissionPayment, ServiceZone, PricingRule, BatteryStation, Battery |
| **Total** | 24 | |
