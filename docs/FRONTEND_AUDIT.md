# Audit Global des Frontends — Plateforme Telima

> Document d'audit de conformité frontend ↔ backend, produit avant le Sprint 3.
> Version 1.0 — Juillet 2026

---

## Sommaire

1. [Vue d'ensemble des trois applications](#1-vue-densemble-des-trois-applications)
2. [Telima Client — Audit détaillé](#2-telima-client--audit-détaillé)
3. [Telima Pro — Audit détaillé](#3-telima-pro--audit-détaillé)
4. [Telima Dashboard — Audit détaillé](#4-telima-dashboard--audit-détaillé)
5. [Matrice Screen → API → WebSocket → Domain Events](#5-matrice-screen--api--websocket--domain-events)
6. [Mapping modules backend ↔ apps frontend](#6-mapping-modules-backend--apps-frontend)
7. [Services futurs identifiés dans les frontends](#7-services-futurs-identifiés-dans-les-frontends)
8. [Écarts frontend ↔ backend identifiés](#8-écarts-frontend--backend-identifiés)
9. [Statut de couverture backend par app](#9-statut-de-couverture-backend-par-app)
10. [Recommandations avant Sprint 3](#10-recommandations-avant-sprint-3)

---

## 1. Vue d'ensemble des trois applications

| Aspect | Telima (Client) | Telima Pro (Chauffeur) | Telima Dashboard (Admin) |
|---|---|---|---|
| **Technologie** | Flutter / Riverpod | Flutter / Provider | React / Vite |
| **Rôle** | App client (commande courses/livraisons) | App chauffeur (réception, exécution, finances) | Back-office admin (gestion, supervision, config) |
| **State management** | Riverpod (`ConsumerStatefulWidget`, providers) | Provider (`ChangeNotifier`) | useState / useMemo (local state) |
| **Backend live** | ❌ Non (`kDemoMode = true`) | ❌ Non (local state mocké) | ❌ Non (données hardcodées) |
| **Socket.IO** | ✅ Câblé (`SocketService` singleton) mais événements legacy | ❌ Aucun | ❌ Aucun |
| **Auth** | Mock (`AuthRepository` stub `Future.delayed`) | Mock (`AuthProvider` local state) | Non implémentée (pas de page login) |
| **Maps** | Google Maps Flutter | Google Maps Flutter | N/A |

### État d'intégration backend

**Aucun des 3 fronts n'a d'intégration backend live.** Telima client a un `SocketService` Socket.io réellement câblé mais qui utilise des noms d'événements legacy (`driver_accepted`, `pickup_en_route`, etc.) qui devront être alignés sur le contrat hybride backend (`ride:driver_accepted`, `delivery:pickup_en_route`, etc.).

---

## 2. Telima Client — Audit détaillé

### 2.1 Écrans et routes

Fichier de routing : `lib/core/router/app_router.dart`

| Route | Screen | Description |
|---|---|---|
| `/splash` | SplashScreen | Écran de démarrage |
| `/phone` | PhoneScreen | Saisie numéro téléphone (OTP) |
| `/otp` | OtpScreen | Validation code OTP (4 chiffres) |
| `/profile-setup` | ProfileSetupScreen | Création de profil (nom, prénom) |
| `/home` | HomeScreen | Carte + sélection service (ride/delivery) + raccourcis adresses |
| `/address-selection` | AddressSelectionScreen | Saisie point de départ / destination |
| `/ride-booking` | RideBookingScreen | Choix véhicule (moto/eco/fraich) + prix + confirmation |
| `/delivery-booking` | DeliveryBookingScreen | Saisie colis (type, destinataire, instructions) + véhicule + paiement |
| `/driver-search` | DriverSearchScreen | Recherche chauffeur en cours |
| `/ride-tracking` | RideTrackingScreen | Suivi course temps réel (carte + driver info) |
| `/delivery-tracking` | DeliveryTrackingScreen | Suivi livraison temps réel (carte + driver info) |
| `/payment` | PaymentScreen | Sélection moyen de paiement (Orange Money, Wave, etc.) |
| `/chat` | ChatScreen | Chat client ↔ chauffeur (texte + audio) |
| `/charging-stations` | ChargingStationsScreen | Annuaire stations de swap batterie |
| `/my-addresses` | MyAddressesScreen | Gestion adresses sauvegardées |
| `/contacts` | ContactsScreen | Gestion contacts |
| `/side-menu` | SideMenuScreen | Menu latéral (profil, historique, paramètres, etc.) |

### 2.2 Flux utilisateurs

**Flux authentification :**
1. Saisie numéro téléphone → `/phone`
2. Réception OTP → `/otp` (4 chiffres)
3. Création profil si nouveau → `/profile-setup`
4. Redirection → `/home`

**Flux course (ride) :**
1. HomeScreen → sélection "Se déplacer"
2. AddressSelectionScreen → départ + destination
3. RideBookingScreen → choix véhicule (moto/eco/fraich) → prix affiché
4. PaymentScreen → sélection moyen paiement (Orange Money, Wave, Orange Money)
5. DriverSearchScreen → recherche chauffeur
6. RideTrackingScreen → suivi temps réel (driver position, ETA, statut)
7. ChatScreen → communication avec chauffeur

**Flux livraison (delivery) :**
1. HomeScreen → sélection "Livraison"
2. AddressSelectionScreen → départ + destination
3. DeliveryBookingScreen → type colis (leger/moyen/volumineux) + destinataire + instructions + véhicule (moto/tricycle) + paiement
4. DriverSearchScreen → recherche chauffeur (mode=delivery)
5. DeliveryTrackingScreen → suivi livraison temps réel
6. Confirmation livraison par client (`emitDeliveryConfirmed`)

**Flux swap batterie :**
1. SideMenu → "Station de Swap"
2. ChargingStationsScreen → carte avec stations, disponibilité, itinéraire

### 2.3 Objets métier

| Objet | Source | Champs clés |
|---|---|---|
| Trip (ride) | `TripNotifier` state | driverName, driverPhoto, driverRating, vehicleType, eta, status (driverAccepted/Arrived/Started/Completed) |
| Delivery | `DeliveryNotifier` state | driverName, vehicleType, packageSize, recipientName, recipientPhone, status (pickupEnRoute/pickedUp/delivered/confirmed) |
| User profile | SideMenuScreen (hardcodé) | name, phone, rating |
| Saved address | Hive local storage | label, lat, lng |
| Charging station | Hardcoded list | name, address, distance, available, total, models, hours, lat, lng |

### 2.4 WebSocket — SocketService

Fichier : `lib/core/services/socket_service.dart`

**Événements écoutés (legacy — à renommer) :**

| Événement frontend actuel | Événement backend cible | Stream |
|---|---|---|
| `driver_location_update` | `driver:location_update` | `driverLocationStream` |
| `driver_accepted` | `ride:driver_accepted` | `tripEventStream` |
| `driver_arrived` | `ride:driver_arrived` | `tripEventStream` |
| `trip_started` | `ride:started` | `tripEventStream` |
| `trip_completed` | `ride:completed` | `tripEventStream` |
| `pickup_en_route` | `delivery:pickup_en_route` | `deliveryEventStream` |
| `colis_picked_up` | `delivery:parcel_picked_up` | `deliveryEventStream` |
| `colis_delivered` | `delivery:delivered` | `deliveryEventStream` |
| `client_confirmed_delivery` | `delivery:client_confirmed` | `deliveryEventStream` |

**Événements émis :**
- `join_trip_room` → `ride:join_room` (cible)
- `join_delivery_room` → `delivery:join_room` (cible)
- `rejoin_trip_room` → `ride:rejoin_room` (cible)
- `rejoin_delivery_room` → `delivery:rejoin_room` (cible)
- `client_confirmed_delivery` → `delivery:client_confirmed` (cible)
- `delivery_issue_reported` → pas d'équivalent backend actuel

### 2.5 APIs requises (non encore câblées)

| Écran | API backend requise | Statut backend |
|---|---|---|
| PhoneScreen | `POST /auth/request-otp` | ✅ Sprint 1 |
| OtpScreen | `POST /auth/verify-otp` | ✅ Sprint 1 |
| ProfileSetupScreen | `POST /users/profile` | ✅ Sprint 1 |
| HomeScreen | `GET /vehicle-types?serviceType=ride` (liste véhicules) | ✅ Sprint 1 |
| RideBookingScreen | `POST /pricing/calculate` (prix estimé) | ✅ Sprint 2 |
| DeliveryBookingScreen | `POST /pricing/calculate` (prix livraison) | ✅ Sprint 2 |
| RideBookingScreen (confirm) | `POST /trips` (création course) | ✅ Sprint 2 |
| DeliveryBookingScreen (confirm) | `POST /trips` (création livraison) | ✅ Sprint 2 |
| RideTrackingScreen | WS `ride:*` events | ✅ Sprint 2 |
| DeliveryTrackingScreen | WS `delivery:*` events | ✅ Sprint 2 |
| PaymentScreen | N/A (cash uniquement en V1 — écran à revoir) | ⚠️ Conflit scope |
| ChatScreen | `POST /chat/messages` + WS chat events | ❌ Sprint 3 |
| ChargingStationsScreen | `GET /battery-swap/stations` | ❌ Sprint 5 |
| SideMenuScreen | `GET /users/me` (profil) | ✅ Sprint 1 |
| MyAddressesScreen | `GET/POST/DELETE /users/addresses` | ❌ Non planifié |
| ContactsScreen | `GET/POST/DELETE /users/contacts` | ❌ Non planifié |

### 2.6 Notifications attendues

- **Push notification** : nouvelle course acceptée par chauffeur, chauffeur arrivé, course terminée
- **In-app** : statut temps réel via WebSocket
- **FCM** : non implémenté côté frontend (pas de firebase_messaging)

### 2.7 Rôles et permissions

- Rôle : `client` uniquement
- Pas de gestion de rôles côté frontend (app mono-rôle)

---

## 3. Telima Pro — Audit détaillé

### 3.1 Écrans et navigation

Fichier de navigation : `lib/presentation/screens/main_wrapper.dart`

La navigation est state-driven (pas de router nommé GoRouter). Le `MainWrapper` switch sur `authState` puis `tripStatus`.

| State | Screen | Description |
|---|---|---|
| `splash` | SplashScreen | Démarrage |
| `phone` | PhoneScreen | Saisie numéro téléphone |
| `otp` | OtpScreen | Validation OTP |
| `onboarding` | OnboardingScreen | Inscription chauffeur (3 pages : identité + documents, véhicule, énergie/clim) |
| `waiting` | WaitingValidationScreen | En attente validation admin |
| `home` + `idle`/`ping` | HomeScreen | Carte + bouton online/offline + notification course entrante |
| `home` + `approaching`/`waiting` | PickupScreen | Navigation vers pickup + arrivé + attente client |
| `home` + `in_progress` | InRouteScreen | Navigation vers destination + chat |
| `home` + `closing` | ClosingScreen | Course terminée — encaissement cash + confirmation |
| `home` + `rating` | RatingScreen | Évaluation client (étoiles + tags) |

**Routes nommées (drawer) :**
| Route | Screen | Description |
|---|---|---|
| `/finance` | FinanceScreen | Portefeuille : solde, commissions dues, graphiques, paiement Orange Money |
| `/vehicle` | VehicleScreen | Infos véhicule |
| `/history` | HistoryScreen | Historique des courses |
| `/settings` | SettingsScreen | Paramètres |
| `/support` | SupportScreen | Support Pro |

### 3.2 Flux utilisateurs

**Flux inscription chauffeur :**
1. PhoneScreen → OTP → OnboardingScreen
2. Onboarding (3 pages) :
   - Page 1 : Nom, prénom, photo, permis, carte d'identité
   - Page 2 : Type véhicule (Moto/Voiture/Tricycle), marque, modèle, année, plaque, énergie (Electrique/Essence/Diesel)
   - Page 3 : Climatisation (Avec/Sans clim)
3. Submit → WaitingValidationScreen (statut `pending_validation`)
4. Validation admin → `home`

**Flux course (réception + exécution) :**
1. HomeScreen (online) → `TripRequestScreen` (ping, 40s timeout, son + vibration)
2. Affichage : type (DEPLACEMENT/LIVRAISON), prix, commission, adresses, colis si livraison
3. Accepter → `approaching` → PickupScreen (navigation vers client)
4. Arrivé → `waiting` (timer attente client)
5. Démarrer → `in_progress` → InRouteScreen (navigation vers destination)
6. Arrivé destination → `closing` → ClosingScreen
7. Encaissement cash → `rating` → RatingScreen (évaluation client)
8. Fin évaluation → `idle` → HomeScreen

**Flux finances :**
1. Drawer → FinanceScreen
2. Solde, commissions dues, graphiques (jour/semaine/mois)
3. Si commissionDue > 5000 FCFA → CommissionLockScreen (accès bloqué)
4. Paiement Orange Money → `OrangeMoneySheet` → `simulatePayment()` → reçu

### 3.3 Objets métier

| Objet | Source | Champs clés |
|---|---|---|
| Driver | `DriverModel` | id, firstName, lastName, phone, photoUrl, rating, balance, commissionDue, isOnline, status, vehicle |
| Vehicle | `VehicleModel` | type, brand, model, year, plateNumber, energy, registrationDocUrl, isValidated |
| Trip | `TripModel` | id, type (DEPLACEMENT/LIVRAISON), status, pickupAddress, destinationAddress, distanceKm, price, commission, clientName, clientRating, recipientName, recipientPhone, deliveryInstructions, packageSize, pickupLat/Lng, destinationLat/Lng |
| Commission | `CommissionModel` | id, amount, isPaid, date, tripId, transactionRef |

### 3.4 WebSocket

**❌ Aucun SocketService implémenté.** L'app chauffeur n'a aucune connexion WebSocket. Toute la gestion de trip est en local state (`TripProvider` ChangeNotifier).

**Événements requis (Sprint 3) :**
- Réception : `trip:new_request`, `ride:cancelled`, `delivery:cancelled`
- Émission : `trip:accept`, `trip:decline`
- Écoute : `driver:location_update` (broadcast position)
- Émission : `driver:online`, `driver:offline`, `driver:position`

### 3.5 APIs requises (non encore câblées)

| Écran | API backend requise | Statut backend |
|---|---|---|
| PhoneScreen | `POST /auth/request-otp` | ✅ Sprint 1 |
| OtpScreen | `POST /auth/verify-otp` | ✅ Sprint 1 |
| OnboardingScreen | `POST /drivers/register` + `POST /drivers/vehicles` + S3 upload | ✅ Sprint 1 |
| HomeScreen | `PATCH /drivers/status` (online/offline) | ❌ Sprint 3 |
| TripRequestScreen | WS `trip:new_request` | ❌ Sprint 3 |
| TripRequestScreen (accept) | `POST /trips/:id/accept` ou WS `trip:accept` | ❌ Sprint 3 |
| TripRequestScreen (decline) | WS `trip:decline` | ❌ Sprint 3 |
| PickupScreen | `PATCH /trips/:id/status` (driver_arriving) | ❌ Sprint 3 |
| PickupScreen (arrived) | `PATCH /trips/:id/status` (arrived) | ❌ Sprint 3 |
| InRouteScreen (start) | `PATCH /trips/:id/status` (in_progress) | ❌ Sprint 3 |
| ClosingScreen (complete) | `PATCH /trips/:id/status` (completed) + `POST /trips/:id/payment-received` | ❌ Sprint 3 |
| RatingScreen | `POST /trips/:id/rating` | ❌ Sprint 3 |
| FinanceScreen | `GET /drivers/me/finances` (solde, commissions) | ❌ Sprint 4 |
| FinanceScreen (pay) | `POST /payments/commission` (Orange Money) | ❌ Sprint 4 |
| HistoryScreen | `GET /trips/me?role=driver` | ✅ Sprint 2 (endpoint existe) |
| CommissionLock | Seuil commissionDue (GET driver profile) | ❌ Sprint 4 |

### 3.6 Notifications attendues

- **Push notification critique** : nouvelle course entrante (FCM + son + vibration)
- **Push** : course annulée par client
- **Push** : validation compte approuvée/refusée
- **In-app** : CommissionLock si seuil dépassé

### 3.7 Rôles et permissions

- Rôle : `driver` uniquement
- Statuts : `pending_validation` → `validated` → `suspended` / `rejected`
- CommissionLock : blocage si commissionDue > seuil (5000 FCFA dans le code)

---

## 4. Telima Dashboard — Audit détaillé

### 4.1 Écrans et routes

Fichier de routing : `src/App.jsx`

| Route | Page | Description |
|---|---|---|
| `/dashboard` | Dashboard | KPIs globaux (courses, revenus, chauffeurs actifs, clients) + graphiques |
| `/drivers` | Drivers | Liste tous chauffeurs (recherche, filtres par statut) |
| `/drivers/pending` | DriversPending | Chauffeurs à examiner |
| `/drivers/active` | DriversActive | Chauffeurs actifs |
| `/drivers/suspended` | DriversSuspended | Chauffeurs suspendus |
| `/drivers/inactive` | DriversInactive | Chauffeurs inactifs |
| `/drivers/:id` | DriverDetails | Détail chauffeur (profil, documents, courses, finances) |
| `/clients` | Clients | Liste tous clients |
| `/clients/details/:id` | ClientDetails | Détail client |
| `/clients/history` | ClientsHistory | Historique courses clients |
| `/courses` | Courses | Liste courses (recherche, filtres, détails) |
| `/courses/completed` | CoursesCompleted | Courses terminées |
| `/courses/details/:id` | CourseDetails | Détail course |
| `/payments` | Payments | Commissions chauffeurs (par chauffeur, statut payée/non payée) |
| `/finances` | Finances | Gestion financière globale (CA, revenus, transactions) |
| `/finances/stations` | Stations | CRUD stations de batterie |
| `/finances/batteries/:id` | BatteryStationDetails | Détail station (stock batteries) |
| `/batteries` | Batteries | CRUD batteries (type, capacité, quantité, station) |
| `/reports` | Reports | Rapports et statistiques (véhicules, chauffeurs, évolution mensuelle) |
| `/parametrage/tarification` | ParametrageTarification | Grille tarifaire (base, prix/km, prix/min, commission) |
| `/parametrage/vehicules` | ParametrageVehicules | Types de véhicules (CRUD, masquer/afficher) |
| `/parametrage/commissions` | ParametrageCommissions | Taux de commissions par type véhicule |
| `/parametrage/zones` | ParametrageZones | Zones de service (rayon, majoration, statut) |
| `/parametrage/finances` | ParametrageFinances | Paramètres financiers |
| `/parametrage/general` | ParametrageGeneral | Paramètres généraux |

### 4.2 Fonctionnalités UI

**Gestion chauffeurs :**
- Liste filtrable par statut (actif, en attente, suspendu, inactif)
- Détail : profil, documents (photo, permis, carte grise), validation/refus
- Pas de page d'ajout manuel (`AddDriver.jsx` existe mais non routée)

**Gestion courses :**
- Liste avec recherche et filtres par période
- Distinction Déplacement / Livraison
- Détail : client, chauffeur, véhicule, distance, durée, paiement, motif annulation

**Suivi financier :**
- Commissions par chauffeur (payée / non payée)
- Vue générale : CA jour/mois, revenus, commissions
- Transactions (courses + salaires chauffeurs)

**Battery-Swap :**
- CRUD stations (nom, localisation, type batterie, capacité, quantité)
- CRUD batteries (type, capacité, quantité, station, statut)
- Vue détail par station

**Paramétrage :**
- Tarification : grille par type véhicule (tarif base, prix/km, prix/min, commission)
- Véhicules : CRUD types + masquer/afficher + service associé
- Commissions : taux par type véhicule
- Zones : ville/zone, rayon, majoration, statut

**Rapports :**
- Stats globales (courses, livraisons, revenus, commissions, croissance, satisfaction)
- Évolution mensuelle
- Répartition par véhicule
- Top chauffeurs

### 4.3 Objets métier

| Objet | Source | Champs clés |
|---|---|---|
| Driver | Hardcoded array | id, nom, telephone, email, vehicule, statut, activite, datePostulation, documents, categorie, photoProfil, carteGrise |
| Client | Hardcoded | id, nom, telephone, courses, statut |
| Course | Hardcoded array | id, client, chauffeur, vehicule, service, date, montant, statut, details (depart, arrivee, distance, duree, paiement, colis, motifAnnulation) |
| Payment | Hardcoded | driverCourses map (id, client, service, montant, date) + drivers (id, nom, statut) |
| Station | Hardcoded | id, name, location, batteryPrice, batteryType, available, lastUpdate, batteryCapacity, batteryStock |
| Battery | Hardcoded | id, type, capacity, quantity, station, status |
| VehicleType | useState local | id, type, capacite, tarifBase, prixAuKm, service, statut, visible |

### 4.4 WebSocket

**❌ Aucun.** Le dashboard n'a pas de connexion WebSocket. Pas de temps réel.

**Événements souhaitables (futur) :**
- Live tracking des courses actives sur carte
- Mise à jour temps réel du nombre de chauffeurs en ligne
- Notifications d'alertes (course annulée, chauffeur suspendu, etc.)

### 4.5 APIs requises (non encore câblées)

| Page | API backend requise | Statut backend |
|---|---|---|
| Dashboard | `GET /admin/stats` (KPIs agrégés) | ❌ Sprint 5 |
| Drivers | `GET /drivers?status=...` | ✅ Sprint 1 (liste) |
| DriversPending | `GET /drivers?status=pending_validation` | ✅ Sprint 1 |
| DriverDetails | `GET /drivers/:id` | ✅ Sprint 1 |
| DriverDetails (validate) | `PATCH /drivers/:id/status` (validated/suspended/rejected) | ❌ Sprint 5 |
| Clients | `GET /users?role=client` | ✅ Sprint 1 |
| ClientDetails | `GET /users/:id` | ✅ Sprint 1 |
| Courses | `GET /trips` (tous, avec filtres) | ✅ Sprint 2 (existe `/trips/me` seulement) |
| CourseDetails | `GET /trips/:id` | ✅ Sprint 2 |
| Payments | `GET /admin/commissions` | ❌ Sprint 4 |
| Finances | `GET /admin/finances` (CA, revenus) | ❌ Sprint 5 |
| Stations | `GET/POST/PUT/DELETE /battery-swap/stations` | ❌ Sprint 5 |
| Batteries | `GET/POST/PUT/DELETE /battery-swap/batteries` | ❌ Sprint 5 |
| Reports | `GET /admin/reports` | ❌ Sprint 5 |
| ParametrageTarification | `GET/PUT /admin/pricing-rules` | ❌ Sprint 4 |
| ParametrageVehicules | `GET/POST/PUT /vehicle-types` | ✅ Sprint 1 (GET existe) |
| ParametrageCommissions | `GET/PUT /admin/commission-rates` | ❌ Sprint 4 |
| ParametrageZones | `GET/POST/PUT /admin/zones` | ❌ Sprint 4 |
| ParametrageGeneral | `GET/PUT /admin/settings` | ❌ Sprint 5 |

### 4.6 Auth

**❌ Aucune page de connexion.** Le dashboard est accessible sans authentification. Une page login admin est requise (rôle `admin`).

### 4.7 Rôles et permissions

- Rôle : `admin` uniquement
- Aucune gestion de rôles ou permissions implémentée côté frontend

---

## 5. Matrice Screen → API → WebSocket → Domain Events

### Telima Client

| Screen | API REST | WebSocket (écoute) | WebSocket (émission) | Domain Event backend |
|---|---|---|---|---|
| PhoneScreen | `POST /auth/request-otp` | — | — | — |
| OtpScreen | `POST /auth/verify-otp` | — | — | — |
| RideBookingScreen | `POST /pricing/calculate`, `POST /trips` | — | — | `TripCreated` |
| DeliveryBookingScreen | `POST /pricing/calculate`, `POST /trips` | — | — | `TripCreated` |
| DriverSearchScreen | — | `ride:driver_accepted` / `delivery:pickup_en_route` | `ride:join_room` / `delivery:join_room` | `DriverAssigned` |
| RideTrackingScreen | — | `ride:driver_arrived`, `ride:started`, `ride:completed`, `driver:location_update` | — | `TripArrived`, `TripStarted`, `TripCompleted` |
| DeliveryTrackingScreen | — | `delivery:parcel_picked_up`, `delivery:delivered`, `driver:location_update` | `delivery:client_confirmed`, `delivery_issue_reported` | `TripStarted`, `TripCompleted` |
| ChatScreen | `POST /chat/messages` | chat events (TBD) | chat message / audio | `ChatMessageSent` (TBD) |
| ChargingStationsScreen | `GET /battery-swap/stations` | — | — | — |
| PaymentScreen | ⚠️ Conflit scope (cash only en V1) | — | — | — |

### Telima Pro

| Screen | API REST | WebSocket (écoute) | WebSocket (émission) | Domain Event backend |
|---|---|---|---|---|
| PhoneScreen | `POST /auth/request-otp` | — | — | — |
| OtpScreen | `POST /auth/verify-otp` | — | — | — |
| OnboardingScreen | `POST /drivers/register`, `POST /drivers/vehicles`, S3 upload | — | — | `DriverRegistered` |
| HomeScreen | `PATCH /drivers/status` (online/offline) | `trip:new_request` | `driver:online`, `driver:offline` | — |
| TripRequestScreen | — | — | `trip:accept`, `trip:decline` | `DriverAccepted` / `DriverDeclined` |
| PickupScreen | `PATCH /trips/:id/status` (driver_arriving) | — | `driver:position` | `TripArrived` |
| InRouteScreen | `PATCH /trips/:id/status` (in_progress) | — | `driver:position` | `TripStarted` |
| ClosingScreen | `PATCH /trips/:id/status` (completed), `POST /trips/:id/payment-received` | — | — | `TripCompleted` |
| RatingScreen | `POST /trips/:id/rating` | — | — | `TripRated` (TBD) |
| FinanceScreen | `GET /drivers/me/finances` | — | — | — |
| FinanceScreen (pay) | `POST /payments/commission` | — | — | `CommissionPaid` |
| HistoryScreen | `GET /trips/me?role=driver` | — | — | — |

### Telima Dashboard

| Page | API REST | WebSocket | Domain Event backend |
|---|---|---|---|
| Dashboard | `GET /admin/stats` | — (futur: live) | — |
| Drivers | `GET /drivers` | — | — |
| DriverDetails | `GET /drivers/:id`, `PATCH /drivers/:id/status` | — | `DriverValidated` / `DriverSuspended` |
| Clients | `GET /users?role=client` | — | — |
| Courses | `GET /trips` (admin) | — | — |
| CourseDetails | `GET /trips/:id` | — | — |
| Payments | `GET /admin/commissions` | — | — |
| Finances | `GET /admin/finances` | — | — |
| Stations | `GET/POST/PUT/DELETE /battery-swap/stations` | — | — |
| Batteries | `GET/POST/PUT/DELETE /battery-swap/batteries` | — | — |
| Reports | `GET /admin/reports` | — | — |
| ParametrageTarification | `GET/PUT /admin/pricing-rules` | — | — |
| ParametrageVehicules | `GET/POST/PUT /vehicle-types` | — | — |
| ParametrageCommissions | `GET/PUT /admin/commission-rates` | — | — |
| ParametrageZones | `GET/POST/PUT /admin/zones` | — | — |

---

## 6. Mapping modules backend ↔ apps frontend

| Module backend | Telima Client | Telima Pro | Telima Dashboard |
|---|---|---|---|
| **Auth** (OTP, JWT) | ✅ Requis | ✅ Requis | ✅ Requis (login admin) |
| **Users** | ✅ Requis (profil client) | — | ✅ Requis (liste clients) |
| **Drivers** | — | ✅ Requis (inscription, profil) | ✅ Requis (gestion, validation) |
| **VehicleTypes** | ✅ Requis (choix véhicule) | ✅ Requis (infos véhicule) | ✅ Requis (paramétrage) |
| **Trips** | ✅ Requis (création, suivi) | ✅ Requis (accept, status, complete) | ✅ Requis (liste, détail) |
| **Dispatch** | Indirect (via WS events) | ✅ Requis (réception trip:new_request) | — |
| **Pricing** | ✅ Requis (prix estimé) | — (prix reçu dans trip) | ✅ Requis (config tarifs) |
| **Events** (WS Gateway) | ✅ Requis (suivi temps réel) | ✅ Requis (réception courses, tracking) | Futur (live tracking) |
| **Geolocation** | Indirect (via WS driver position) | ✅ Requis (broadcast position) | Futur (carte live) |
| **Queue** (BullMQ) | Indirect | Indirect (timeout dispatch) | — |
| **Domain Events** | Indirect | Indirect | Indirect |
| **ServiceConfig** | Indirect (services activés) | Indirect | ✅ Requis (activer/désactiver services) |
| **Storage** (S3) | — | ✅ Requis (upload documents) | ✅ Requis (visualiser documents) |
| **SMS** | Indirect (OTP) | Indirect (OTP) | — |
| **Chat** (Sprint 3) | ✅ Requis (chat client) | ✅ Requis (chat chauffeur) | — |
| **Tracking** (Sprint 3) | Indirect (réception position) | ✅ Requis (envoi position GPS) | Futur (live map) |
| **Notifications** (Sprint 3) | ✅ Requis (FCM push) | ✅ Requis (FCM push critique) | — |
| **Payments** (Sprint 4) | ⚠️ Cash only (pas d'API) | ✅ Requis (commission Orange Money) | ✅ Requis (suivi commissions) |
| **Battery-Swap** (Sprint 5) | ✅ Requis (annuaire stations) | — | ✅ Requis (CRUD stations/batteries) |

---

## 7. Services futurs identifiés dans les frontends

### 7.1 Services déjà référencés dans le code frontend

| Service | Frontend | Évidence | Statut backend |
|---|---|---|---|
| **Ride (DEPLACEMENT)** | Telima, Telima Pro, Dashboard | Service principal, entièrement maquetté | ✅ Implémenté (Sprint 1-2) |
| **Delivery (LIVRAISON)** | Telima, Telima Pro, Dashboard | Service principal, entièrement maquetté | ✅ Implémenté (Sprint 1-2) |
| **Battery Swap** | Telima (ChargingStationsScreen), Dashboard (Stations, Batteries) | Annuaire lecture seule côté client, CRUD admin | ❌ Sprint 5 |
| **Food** | Backend (ServiceType enum, SERVICE_EVENT_MAP) | Événements WS mappés sur delivery | ❌ Non implémenté |
| **Assistance** | Backend (ServiceType enum, SERVICE_EVENT_MAP) | Événements WS mappés sur ride | ❌ Non implémenté |
| **Intercity** | Backend (ServiceType enum, SERVICE_EVENT_MAP) | Événements WS mappés sur ride | ❌ Non implémenté |

### 7.2 Éléments UI prêts pour services futurs

**Telima Client :**
- `HomeScreen` : switch binaire "Se déplacer" / "Livraison" — devra devenir multi-service (onglets ou grille)
- `ChargingStationsScreen` : écran complet avec carte, markers, itinéraire — prêt pour intégration API
- `SideMenuScreen` : entrée "Station de Swap" + "Parrainage" (parrainage non implémenté)

**Telima Pro :**
- `TripModel.type` : valeurs `DEPLACEMENT` / `LIVRAISON` — devra être étendu
- `TripRequestScreen` : affichage conditionnel `isDelivery` (colis) vs `isRide` — devra gérer plus de types
- `OnboardingScreen` : types véhicule `Moto/Voiture/Tricycle` — devra inclure types pour food, assistance, etc.

**Telima Dashboard :**
- `Dashboard` : KPIs séparés Déplacement / Livraison / SWAP / Batterie chargée — structuré pour multi-service
- `ParametrageVehicules` : champ `service` par type véhicule — prêt pour multi-service
- `Courses` : champ `service` (Déplacement/Livraison) — extensible
- `Finances` : colonne `Service` dans transactions — extensible

---

## 8. Écarts frontend ↔ backend identifiés

### 8.1 Écarts critiques

| # | Écart | Impact | Sévérité |
|---|---|---|---|
| 1 | **PaymentScreen (Telima client)** propose Orange Money / Wave alors que le backend V1 est **cash uniquement** côté client | Conflit de scope majeur — l'écran de paiement client ne devrait pas exister en V1 | 🔴 Critique |
| 2 | **Telima Pro n'a aucun SocketService** — pas de WebSocket pour réception de courses | Sprint 3 doit implémenter toute la couche temps réel chauffeur | 🔴 Critique |
| 3 | **Telima Dashboard n'a aucune authentification** | Accès non sécurisé au back-office | 🔴 Critique |
| 4 | **Noms d'événements WebSocket Telima client** (`driver_accepted`, `pickup_en_route`, etc.) non alignés avec le contrat backend (`ride:driver_accepted`, `delivery:pickup_en_route`) | Renommage nécessaire lors du câblage | 🟡 Moyen |
| 5 | **Vocabulaire trip status Telima Pro** (`idle`, `ping`, `approaching`, `waiting`, `in_progress`, `closing`, `rating`) non aligné avec backend (`pending`, `accepted`, `driver_arriving`, `in_progress`, `completed`, `cancelled_*`) | Traduction nécessaire lors du câblage | 🟡 Moyen |
| 6 | **Vocabulaire service type Telima Pro** (`DEPLACEMENT` / `LIVRAISON`) non aligné avec backend (`ride` / `delivery`) | Traduction nécessaire | 🟡 Moyen |
| 7 | **Types véhicule Telima client** (`moto`, `eco`, `fraich`) non alignés avec backend/Dashboard (`Moto`, `Tricycle`, `Voiture Éco`, `Voiture Climatisée`) | Réconciliation nécessaire | 🟡 Moyen |
| 8 | **Dashboard Courses** : `paiement: "Orange Money"` dans les données mockées alors que client = cash only | Les données de démo sont incohérentes avec le scope V1 | 🟢 Mineur (données mockées) |
| 9 | **Telima Pro CommissionLock** : seuil hardcodé `5000 FCFA` dans `HomeScreen` | Devrait être configurable côté backend | 🟢 Mineur |
| 10 | **Telima Pro `pingTimeoutSeconds = 40`** vs backend dispatch timeout potentiellement différent | À aligner | 🟢 Mineur |
| 11 | **Dashboard `Finances.jsx`** : inclut "Salaire" chauffeur (lignes S001-S005) — concept non prévu backend | Notion de salaire vs commission à clarifier | 🟡 Moyen |
| 12 | **Telima client `delivery_issue_reported`** émis mais pas d'équivalent backend | Backend doit prévoir un endpoint ou WS event pour signalements livraison | 🟡 Moyen |

### 8.2 Écarts structurels

| # | Écart | Description |
|---|---|---|
| 13 | **Pas de gestion d'erreurs réseau** | Aucun front ne gère les erreurs API (timeout, 401, 403, 500) — à implémenter lors du câblage |
| 14 | **Pas de refresh token** | Aucun front ne gère la rotation de token / refresh — à implémenter |
| 15 | **Pas de FCM** | Ni Telima ni Telima Pro n'ont firebase_messaging configuré — Sprint 3 |
| 16 | **Dashboard pas de temps réel** | Pas de WebSocket pour live tracking — futur post-V1 |
| 17 | **Telima Pro pas de GPS tracking** | Pas d'envoi de position GPS vers le backend — Sprint 3 |
| 18 | **MyAddressesScreen / ContactsScreen** | Écrans existants côté Telima client mais pas d'API backend planifiée |
| 19 | **Parrainage (referral)** | Entrée de menu côté Telima client mais pas d'API backend planifiée |

---

## 9. Statut de couverture backend par app

### Telima Client

| Module backend | Statut frontend | Sprint requis |
|---|---|---|
| Auth (OTP, JWT) | ❌ Mocké | Câblage Sprint 3 |
| Users (profil) | ❌ Mocké | Câblage Sprint 3 |
| VehicleTypes | ❌ Hardcodé | Câblage Sprint 3 |
| Trips (création) | ❌ Mocké (`RideRepository` stub) | Câblage Sprint 3 |
| Pricing | ❌ Mocké (prix hardcodés) | Câblage Sprint 3 |
| Events (WS) | ⚠️ Câblé mais événements legacy | Renommage Sprint 3 |
| Chat | ❌ UI existe, pas d'API | Câblage Sprint 3 |
| Battery-Swap | ❌ UI existe, pas d'API | Câblage Sprint 5 |
| Notifications (FCM) | ❌ Pas implémenté | Sprint 3 |

### Telima Pro

| Module backend | Statut frontend | Sprint requis |
|---|---|---|
| Auth (OTP, JWT) | ❌ Mocké | Câblage Sprint 3 |
| Drivers (inscription) | ❌ Mocké (local state) | Câblage Sprint 3 |
| VehicleTypes | ❌ Hardcodé | Câblage Sprint 3 |
| Trips (accept/status/complete) | ❌ Mocké (local state) | Câblage Sprint 3 |
| Events (WS) | ❌ Aucun | Implémentation Sprint 3 |
| Tracking (GPS) | ❌ Aucun | Implémentation Sprint 3 |
| Chat | ❌ UI existe, pas d'API | Câblage Sprint 3 |
| Payments (commission) | ❌ Mocké (`simulatePayment`) | Câblage Sprint 4 |
| Notifications (FCM) | ❌ Pas implémenté | Sprint 3 |

### Telima Dashboard

| Module backend | Statut frontend | Sprint requis |
|---|---|---|
| Auth (admin login) | ❌ Aucune | Implémentation Sprint 5 |
| Drivers (CRUD, validation) | ❌ Données hardcodées | Câblage Sprint 5 |
| Users (liste clients) | ❌ Données hardcodées | Câblage Sprint 5 |
| Trips (liste, détail) | ❌ Données hardcodées | Câblage Sprint 5 |
| Payments (commissions) | ❌ Données hardcodées | Câblage Sprint 5 |
| Battery-Swap (CRUD) | ❌ Données hardcodées | Câblage Sprint 5 |
| Pricing (config) | ❌ Données hardcodées | Câblage Sprint 4-5 |
| VehicleTypes (config) | ❌ useState local | Câblage Sprint 5 |
| Zones (config) | ❌ Données hardcodées | Câblage Sprint 4-5 |
| Reports | ❌ Données hardcodées | Câblage Sprint 5 |

---

## 10. Recommandations avant Sprint 3

### 10.1 Actions immédiates (avant de démarrer Sprint 3)

1. **Retirer ou désactiver `PaymentScreen` côté Telima client**
   - Le paiement client est **cash uniquement** en V1 (décision actée #5)
   - L'écran de paiement Orange Money/Wave ne doit pas être présent dans le flux client
   - Le flux doit être : RideBookingScreen → DriverSearchScreen (sans passage par PaymentScreen)

2. **Définir le contrat WebSocket précis pour Telima Pro**
   - L'app chauffeur n'a aucun SocketService — il faut spécifier exactement quels événements écouter/émettre
   - Créer un `SocketService` côté Telima Pro avec : `trip:new_request`, `trip:accept`, `trip:decline`, `driver:online`, `driver:offline`, `driver:position`, `driver:location_update`
   - Prévoir la reconnexion et le rejoin des rooms

3. **Aligner les noms d'événements WebSocket Telima client**
   - Renommer dans `socket_service.dart` : `driver_accepted` → `ride:driver_accepted`, etc.
   - Mettre à jour les providers (`TripNotifier`, `DeliveryNotifier`) en conséquence
   - Ou prévoir une couche de traduction temporaire (non recommandé)

4. **Spécifier les endpoints App Chauffeur (Sprint 3)**
   - `POST /trips/:id/accept` — chauffeur accepte la course
   - `POST /trips/:id/decline` — chauffeur refuse la course
   - `PATCH /trips/:id/status` — mise à jour du statut (driver_arriving, in_progress, completed)
   - `POST /trips/:id/payment-received` — confirmation encaissement cash
   - `POST /trips/:id/rating` — évaluation client par chauffeur
   - `PATCH /drivers/me/status` — online/offline
   - `GET /drivers/me/finances` — solde et commissions (peut attendre Sprint 4)

5. **Définir le module Chat (Sprint 3)**
   - Modèle : `chat_messages` (id, trip_id, sender_id, sender_role, content, audio_url, created_at)
   - Endpoints : `GET /trips/:id/messages`, `POST /trips/:id/messages`
   - WS : `chat:message`, `chat:typing` (namespace par trip)
   - Audio : upload S3 avec URL signée (comme documents chauffeur)

6. **Définir le module Tracking (Sprint 3)**
   - Endpoint : `POST /tracking/position` (lat, lng, heading, speed)
   - WS broadcast : `driver:location_update` vers la room du trip
   - Fréquence d'envoi : définir (ex: 3s en mode actif, 10s en mode idle)
   - Telima Pro doit implémenter l'envoi GPS via `geolocator` ou `location` package

7. **Définir le module Notifications (Sprint 3)**
   - FCM push pour : nouvelle course (chauffeur), course acceptée (client), chauffeur arrivé (client), course terminée (client), course annulée (les deux)
   - Configuration `firebase_messaging` côté Flutter (Telima + Telima Pro)
   - Endpoint : `POST /devices/register` (FCM token), `DELETE /devices/:token`

### 10.2 Actions de cohérence (à planifier)

8. **Réconcilier les types véhicule**
   - Backend : `Moto`, `Tricycle`, `Voiture Éco`, `Voiture Climatisée` (avec `serviceType`)
   - Telima client : `moto`, `eco`, `fraich` (sans tricycle pour ride)
   - Telima Pro : `Moto`, `Voiture`, `Tricycle` (sans distinction éco/clim)
   - Dashboard : `Moto`, `Tricycle`, `Voiture Éco`, `Voiture Climatisée`
   - **Recommandation** : aligner tous les fronts sur le backend (IDs VehicleType)

9. **Réconcilier les vocabulaires de statut**
   - Telima Pro : `idle/ping/approaching/waiting/in_progress/closing/rating`
   - Backend : `pending/accepted/driver_arriving/in_progress/completed/cancelled_*`
   - **Recommandation** : mapping documenté, adaptation lors du câblage (pas de couche de traduction permanente côté backend)

10. **Planifier l'authentification Dashboard**
    - Page login (phone + OTP ou email + password pour admin ?)
    - Rôle `admin` dans le backend (déjà prévu dans `UserRole`)
    - Protection des routes frontend (redirect si non authentifié)

11. **Documenter les écarts de scope assumés**
    - PaymentScreen client (Orange Money) → retirer ou masquer en V1
    - "Salaire" chauffeur dans Dashboard Finances → clarifier (commission vs salaire)
    - `delivery_issue_reported` (Telima client) → prévoir endpoint backend ou WS event
    - MyAddressesScreen / ContactsScreen → API à ajouter si retenu pour V1
    - Parrainage → non prévu en V1, masquer l'entrée de menu

### 10.3 Priorisation Sprint 3

| Priorité | Tâche | App concernée |
|---|---|---|
| P0 | Implémenter SocketService Telima Pro | Telima Pro |
| P0 | Câbler auth (OTP + JWT) sur les 3 apps | Toutes |
| P0 | Implémenter module Tracking (GPS) | Backend + Telima Pro |
| P0 | Implémenter module Chat (persistance + WS + audio) | Backend + Telima + Telima Pro |
| P0 | Implémenter endpoints App Chauffeur (accept/decline/status/complete/rating) | Backend + Telima Pro |
| P1 | Implémenter Notifications (FCM) | Backend + Telima + Telima Pro |
| P1 | Aligner noms d'événements WS Telima client | Telima |
| P1 | Retirer/désactiver PaymentScreen client | Telima |
| P2 | Câbler VehicleTypes depuis backend | Telima + Telima Pro |
| P2 | Câbler Trip creation depuis backend | Telima |
| P3 | Préparer auth Dashboard | Telima Dashboard |

---

## Annexe A — Récapitulatif des fichiers frontend audités

### Telima Client (`telima/`)
- `lib/core/router/app_router.dart` — Routing (16 routes)
- `lib/core/services/socket_service.dart` — SocketService (événements legacy)
- `lib/core/constants/app_config.dart` — `kDemoMode = true`
- `lib/features/home/presentation/screens/home_screen.dart` — Home (service switch, map, addresses)
- `lib/features/ride/data/ride_repository.dart` — Stub (calculatePrice, bookRide)
- `lib/features/ride/presentation/screens/ride_booking_screen.dart` — Booking (vehicle selection)
- `lib/features/ride/presentation/screens/ride_tracking_screen.dart` — Tracking (demo mode)
- `lib/features/ride/presentation/providers/trip_provider.dart` — TripNotifier (WS event handling)
- `lib/features/delivery/presentation/screens/delivery_booking_screen.dart` — Delivery booking
- `lib/features/delivery/presentation/screens/delivery_tracking_screen.dart` — Delivery tracking
- `lib/features/delivery/presentation/providers/delivery_provider.dart` — DeliveryNotifier
- `lib/features/auth/data/auth_repository.dart` — Stub (sendOtp, verifyOtp, createProfile)
- `lib/features/payment/presentation/screens/payment_screen.dart` — Payment (Orange Money/Wave)
- `lib/features/chat/presentation/screens/chat_screen.dart` — Chat (text + audio, TODO Socket.IO)
- `lib/features/charging/presentation/screens/charging_stations_screen.dart` — Battery swap annuaire
- `lib/features/profile/presentation/screens/side_menu_screen.dart` — Side menu

### Telima Pro (`telima-pro/`)
- `lib/main.dart` — MultiProvider setup
- `lib/presentation/screens/main_wrapper.dart` — State-driven navigation
- `lib/presentation/providers/auth_provider.dart` — Auth (local state)
- `lib/presentation/providers/trip_provider.dart` — Trip (local state, no WS)
- `lib/presentation/providers/finance_provider.dart` — Finance (mocked data)
- `lib/presentation/providers/app_provider.dart` — App state (theme, connectivity)
- `lib/data/models/trip_model.dart` — TripModel (DEPLACEMENT/LIVRAISON)
- `lib/data/models/driver_model.dart` — DriverModel
- `lib/data/models/vehicle_model.dart` — VehicleModel
- `lib/data/models/commission_model.dart` — CommissionModel + DailyEarnings
- `lib/presentation/screens/home/home_screen.dart` — Home (map, online/offline, CommissionLock)
- `lib/presentation/screens/trip/trip_request_screen.dart` — Trip request (ping, 40s timeout)
- `lib/presentation/screens/trip/pickup_screen.dart` — Pickup (navigation, waiting timer, chat)
- `lib/presentation/screens/trip/in_route_screen.dart` — In route (navigation, chat)
- `lib/presentation/screens/trip/closing_screen.dart` — Closing (cash collection, confirm)
- `lib/presentation/screens/trip/rating_screen.dart` — Rating (stars + tags)
- `lib/presentation/screens/auth/onboarding_screen.dart` — Onboarding (3 pages)
- `lib/presentation/screens/finance/finance_screen.dart` — Finance (balance, charts, commissions)
- `lib/presentation/screens/finance/orange_money_sheet.dart` — Orange Money payment
- `lib/presentation/screens/drawer/app_drawer.dart` — Drawer menu
- `lib/presentation/widgets/commission_lock.dart` — Commission lock screen
- `lib/core/utils/constants.dart` — Constants (pingTimeout=40s, otpTimeout=45s)

### Telima Dashboard (`telimaDashboard/`)
- `src/App.jsx` — Routing (25+ routes)
- `src/Components/Sidebar.jsx` — Navigation sidebar (5 sections)
- `src/Pages/Dashboard.jsx` — KPIs (courses, revenus, chauffeurs, clients)
- `src/Pages/Drivers.jsx` — Liste chauffeurs (hardcoded)
- `src/Pages/Courses.jsx` — Liste courses (hardcoded)
- `src/Pages/Payments.jsx` — Commissions par chauffeur
- `src/Pages/Finances.jsx` — Gestion financière globale
- `src/Pages/Stations.jsx` — CRUD stations batterie
- `src/Pages/Batteries.jsx` — CRUD batteries
- `src/Pages/Reports.jsx` — Rapports et statistiques
- `src/Pages/ParametrageTarification.jsx` — Grille tarifaire
- `src/Pages/ParametrageVehicules.jsx` — Types véhicules (CRUD local)
- `src/Pages/ParametrageCommissions.jsx` — Taux commissions
- `src/Pages/ParametrageZones.jsx` — Zones de service
