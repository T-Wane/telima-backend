# Plan d'Implémentation V1 — Plateforme Telima

> Roadmap officielle V1. Version 1.0 — Juillet 2026

---

## Sprint 3 — Intégration Chauffeur & Temps Réel

### Modules backend
- **Tracking** : GPS position broadcast via WS
- **Chat** : Messages persistés + audio S3 + WS temps réel
- **Notifications** : FCM push (interface + mock)
- **Trips extensions** : endpoints accept/decline/payment-received/rating

### Endpoints REST
| Endpoint | Méthode | Rôle | DTO |
|---|---|---|---|
| `/trips/:id/accept` | POST | driver | — |
| `/trips/:id/decline` | POST | driver | `DeclineTripDto { reason? }` |
| `/trips/:id/payment-received` | POST | driver | `PaymentReceivedDto { amount }` |
| `/trips/:id/rating` | POST | driver | `CreateRatingDto { rating, tags? }` |
| `/tracking/position` | POST | driver | `UpdatePositionDto { lat, lng, heading?, speed? }` |
| `/trips/:id/messages` | GET | client/driver | — |
| `/trips/:id/messages` | POST | client/driver | `CreateMessageDto { content?, audioUrl? }` |
| `/chat/upload-audio` | POST | client/driver | multipart (file) |
| `/devices/register` | POST | all | `RegisterDeviceDto { token, platform }` |
| `/devices/:token` | DELETE | all | — |

### WebSocket
| Event | Direction | Payload |
|---|---|---|
| `trip:new_request` | server→driver | `{ tripId, serviceType, pickupAddress, dropoffAddress, estimatedPrice, commission, clientName, clientRating }` |
| `trip:accept` | driver→server | `{ tripId }` |
| `trip:decline` | driver→server | `{ tripId, reason? }` |
| `driver:position` | driver→server | `{ lat, lng, heading? }` |
| `driver:location_update` | server→client | `{ driverId, lat, lng, heading? }` |
| `chat:message` | bidirectional | `{ tripId, senderId, senderRole, content?, audioUrl?, createdAt }` |
| `ride:cancelled` / `delivery:cancelled` | server→client/driver | `{ tripId, reason }` |

### Domain Events
- `trip.accepted`, `trip.started`, `trip.completed`, `trip.cancelled`
- `trip.driver_arrived`, `trip.rated` (nouveau)
- `chat.message_sent` (nouveau)
- `driver.online`, `driver.offline`

### Écrans Flutter impactés
- **Telima Pro** : HomeScreen, TripRequestScreen, PickupScreen, InRouteScreen, ClosingScreen, RatingScreen, ChatScreen, WaitingValidationScreen
- **Telima** : RideTrackingScreen, DeliveryTrackingScreen, ChatScreen

### Tâches techniques
1. Créer module Tracking (`src/modules/tracking/`) : endpoint position, broadcast WS via `driver:location_update`
2. Créer modèle Prisma `ChatMessage` (id, tripId, senderId, senderRole, content, audioUrl, createdAt)
3. Créer module Chat (`src/modules/chat/`) : controller, service, repository, S3 audio upload
4. Ajouter endpoints `accept/decline/payment-received/rating` au TripsController
5. Créer modèle Prisma `TripRating` (id, tripId, raterId, raterRole, rating, tags, createdAt)
6. Créer module Notifications (`src/modules/notifications/`) : interface `PushProvider`, `MockPushProvider`, `FcmPushProvider` (stub)
7. Créer modèle Prisma `DeviceToken` (id, userId, token, platform, createdAt)
8. Étendre EventsGateway : `trip:new_request`, `trip:accept`, `trip:decline`, `chat:message`
9. Implémenter `SocketService` côté Telima Pro (Flutter)
10. Câbler auth (OTP + JWT) sur Telima Pro
11. Câbler tracking GPS côté Telima Pro (`geolocator` package)
12. Câbler chat côté Telima + Telima Pro (audio recording via `flutter_sound`)

### Dépendances
- Sprint 2 (Trips, Dispatch, Events Gateway, Queue) ✅
- Prisma migration : `ChatMessage`, `TripRating`, `DeviceToken`
- Packages Flutter : `geolocator`, `flutter_sound`, `socket_io_client`, `firebase_messaging`

### Critères de validation
- `npm run build` — 0 errors
- `npx eslint` — 0 errors, 0 warnings
- `npx jest` — tous tests passent (nouveaux tests inclus)
- Endpoint `POST /trips/:id/accept` testable via curl/Postman
- Flow complet : create trip → dispatch → driver accept → driver_arriving → in_progress → payment-received → rating
- Chat : envoi texte + audio, réception temps réel via WS
- Tracking : position driver broadcastée au client en temps réel

### Tests
- Unit : TrackingService, ChatService, NotificationsService, TripRating
- Integration : accept/decline flow, payment-received flow, chat message persistence
- E2E : create trip → accept → track → complete → rate (avec mock WS)

### Risques
- **GPS battery drain** : optimiser fréquence d'envoi (3s actif, 10s idle)
- **WS reconnection** : gérer rejoin rooms après reconnexion (déjà partiellement implémenté)
- **Audio S3** : credentials AWS potentiellement absents → utiliser MockStorageProvider comme pour SMS
- **FCM configuration** : projet Firebase à créer, `google-services.json` à intégrer

---

## Sprint 4 — Intégration Client

### Modules backend
- **Pricing** : endpoint public `POST /pricing/calculate` (exposer le service existant)
- **Trips** : câblage création course côté client
- **Events** : alignement noms WS events côté Telima

### Endpoints REST
| Endpoint | Méthode | Rôle | DTO |
|---|---|---|---|
| `/pricing/calculate` | POST | client | `PriceQuoteInput { serviceType, vehicleTypeId, pickup: GeoPoint, dropoff: GeoPoint }` |

### WebSocket
| Event | Direction | Changement |
|---|---|---|
| `ride:driver_accepted` | server→client | Renommer depuis `driver_accepted` côté Telima |
| `ride:driver_arrived` | server→client | Renommer depuis `driver_arrived` |
| `ride:started` | server→client | Renommer depuis `trip_started` |
| `ride:completed` | server→client | Renommer depuis `trip_completed` |
| `delivery:pickup_en_route` | server→client | Renommer depuis `pickup_en_route` |
| `delivery:parcel_picked_up` | server→client | Renommer depuis `colis_picked_up` |
| `delivery:delivered` | server→client | Renommer depuis `colis_delivered` |
| `delivery:client_confirmed` | client→server | Renommer depuis `client_confirmed_delivery` |

### Domain Events
- `trip.created` (déjà existant, câblage client)

### Écrans Flutter impactés
- **Telima** : PhoneScreen, OtpScreen, ProfileCreationScreen, HomeScreen, RideBookingScreen, DeliveryBookingScreen, DriverSearchScreen, RideTrackingScreen, DeliveryTrackingScreen, SideMenuScreen
- **Retrait UI** : PaymentScreen (supprimer du flux), sélecteur paiement mobile dans DeliveryBookingScreen

### Tâches techniques
1. Créer PricingController (`POST /pricing/calculate`) exposant PricingService
2. Câbler auth (OTP + JWT) sur Telima : `AuthRepository` → appels réels
3. Câbler `GET /vehicle-types` sur HomeScreen (remplacer hardcoded)
4. Câbler `POST /pricing/calculate` sur RideBookingScreen + DeliveryBookingScreen
5. Câbler `POST /trips` sur RideBookingScreen + DeliveryBookingScreen
6. Renommer WS events dans `socket_service.dart` (alignement contrat backend)
7. Mettre à jour `TripNotifier` et `DeliveryNotifier` avec nouveaux noms d'events
8. Passer `kDemoMode = false` dans `app_config.dart`
9. Retirer PaymentScreen du routeur (`app_router.dart`)
10. Retirer sélecteur paiement mobile de DeliveryBookingScreen
11. Câbler `GET /users/me` sur SideMenuScreen
12. Masquer entrée "Parrainage" dans SideMenuScreen

### Dépendances
- Sprint 3 ✅ (tracking, chat, notifications, driver endpoints)
- Sprint 2 ✅ (trips, pricing, events)

### Critères de validation
- `npm run build` + lint + tests — tous verts
- Flow client complet : auth → home → booking → pricing → trip creation → driver search → tracking → chat
- `POST /pricing/calculate` retourne prix estimé correct
- WS events alignés entre Telima et backend
- PaymentScreen retirée du flux

### Tests
- Unit : PricingController (validation DTO, calcul prix)
- Integration : create trip from client → dispatch triggered
- E2E : client auth → book ride → tracking via WS

### Risques
- **Google Maps API quota** : Distance Matrix a des quotas, prévoir cache Redis (déjà implémenté Sprint 2)
- **Renommage WS events** : risque de régression côté Telima, tester chaque event

---

## Sprint 5 — Paiements, Commissions & Tarification Dynamique

### Modules backend
- **Payments** : commission chauffeur via Orange Money + webhook idempotent
- **Commissions** : agrégation quotidienne, suivi commissionDue
- **Pricing Engine** : moteur tarification dynamique complet (zones, règles, surge)
- **Zones** : CRUD admin zones de service

### Endpoints REST
| Endpoint | Méthode | Rôle | DTO |
|---|---|---|---|
| `/payments/commission` | POST | driver | `PayCommissionDto { amount, phoneNumber }` |
| `/payments/webhook` | POST | public (Orange Money) | `OrangeMoneyWebhookDto` (signature vérifiée) |
| `/drivers/me/finances` | GET | driver | — |
| `/drivers/me/commissions` | GET | driver | — (paginé) |
| `/admin/zones` | GET/POST | admin | `CreateZoneDto { name, city, radiusKm, surgeMultiplier, isActive }` |
| `/admin/zones/:id` | PUT/DELETE | admin | `UpdateZoneDto` |
| `/admin/pricing-rules` | GET/POST | admin | `CreatePricingRuleDto` |
| `/admin/pricing-rules/:id` | PUT/DELETE | admin | — |

### WebSocket
| Event | Direction | Payload |
|---|---|---|
| `payment:confirmed` | server→driver | `{ transactionId, amount, driverId }` |

### Domain Events
- `payment.succeeded` (déjà existant, câblage webhook)
- `commission.paid` (nouveau)

### Écrans Flutter impactés
- **Telima Pro** : FinanceScreen, OrangeMoneySheet, CommissionLockScreen
- **Dashboard** : ParametrageZones, ParametrageTarification, ParametrageCommissions

### Tâches techniques
1. Créer modèle Prisma `CommissionPayment` (id, driverId, amount, status, transactionRef, paidAt, createdAt)
2. Créer modèle Prisma `ServiceZone` (id, name, city, centerLat, centerLng, radiusKm, surgeMultiplier, isActive)
3. Créer modèle Prisma `PricingRule` (id, name, serviceType, vehicleTypeId?, zoneId?, condition, modifier, priority, isActive)
4. Créer module Payments (`src/modules/payments/`) : interface `PaymentProvider`, `OrangeMoneyProvider`, webhook handler idempotent
5. Créer module Commissions (`src/modules/commissions/`) : service agrégation, calcul commissionDue
6. Étendre PricingEngine : règles dynamiques (zones, paliers, surge, événements spéciaux)
7. Créer ZonesController (CRUD admin)
8. Créer PricingRulesController (CRUD admin)
9. Câbler FinanceScreen : `GET /drivers/me/finances`
10. Câbler OrangeMoneySheet : `POST /payments/commission` + écoute `payment:confirmed`
11. Rendre seuil CommissionLock configurable (backend paramètre global)
12. Câbler ParametrageZones, ParametrageTarification, ParametrageCommissions côté Dashboard

### Dépendances
- Sprint 3 ✅, Sprint 4 ✅
- Prisma migration : `CommissionPayment`, `ServiceZone`, `PricingRule`
- Orange Money API credentials (ou mock pour dev)

### Critères de validation
- Build + lint + tests verts
- Webhook Orange Money idempotent (même transaction → une seule mise à jour)
- `POST /payments/commission` initie paiement, webhook confirme, `commissionDue` mis à jour
- Moteur tarification : prix varie selon zone + surge + règles
- CommissionLock : seuil configurable, blocage fonctionnel

### Tests
- Unit : CommissionService, PricingEngine (règles dynamiques), Webhook idempotency
- Integration : pay commission → webhook → commissionDue updated
- E2E : driver complete trip → commission accrued → pay via Orange Money → webhook → balance updated

### Risques
- **Orange Money API** : credentials potentiellement absents → interface + mock (pattern SmsProvider)
- **Webhook sécurité** : vérifier signature Orange Money, rejoue idempotent
- **Pricing complexity** : tester exhaustivement les combinaisons de règles

---

## Sprint 6 — Dashboard & Battery-Swap

### Modules backend
- **Admin** : stats, finances, reports, gestion users/trips
- **Battery-Swap** : stations + batteries CRUD, annuaire public
- **Dashboard Auth** : login admin

### Endpoints REST
| Endpoint | Méthode | Rôle | DTO |
|---|---|---|---|
| `/auth/admin-login` | POST | public | `AdminLoginDto { email, password }` |
| `/admin/stats` | GET | admin | — |
| `/admin/finances` | GET | admin | — |
| `/admin/reports` | GET | admin | — |
| `/admin/commissions` | GET | admin | — |
| `/users` | GET | admin | `?role=client&search=...` |
| `/trips` | GET | admin | `?service=&status=&from=&to=&search=` |
| `/battery-swap/stations` | GET | public/client | — |
| `/battery-swap/stations/:id` | GET | public/client | — |
| `/battery-swap/stations` | POST | admin | `CreateStationDto` |
| `/battery-swap/stations/:id` | PUT/DELETE | admin | — |
| `/battery-swap/batteries` | GET/POST | admin | `CreateBatteryDto` |
| `/battery-swap/batteries/:id` | PUT/DELETE | admin | — |

### WebSocket
- Aucun en V1 (futur : live tracking dashboard)

### Domain Events
- `driver.validated`, `driver.suspended` (nouveaux, pour notifications)

### Écrans impactés
- **Dashboard** : Login (à créer), Dashboard, Drivers, DriverDetails, Clients, Courses, CourseDetails, Payments, Finances, Stations, Batteries, Reports, ParametrageVehicules, ParametrageTarification, ParametrageCommissions, ParametrageZones
- **Telima** : ChargingStationsScreen

### Tâches techniques
1. Créer `AdminLoginDto` + endpoint `POST /auth/admin-login` (email+password, JWT)
2. Créer AdminModule (`src/modules/admin/`) : stats, finances, reports controllers
3. Étendre UsersController : `GET /users` (admin, filtre rôle)
4. Étendre TripsController : `GET /trips` (admin, filtres)
5. Créer modèle Prisma `BatteryStation` (id, name, address, lat, lng, batteryType, batteryCapacity, batteryPrice, openingHours, isActive)
6. Créer modèle Prisma `Battery` (id, stationId, type, capacity, status, createdAt)
7. Créer module BatterySwap (`src/modules/battery-swap/`) : controller, service, repository
8. Créer page Login.jsx côté Dashboard + protection routes (React Context auth)
9. Câbler toutes les pages Dashboard sur APIs réelles (remplacer données hardcodées)
10. Câbler ChargingStationsScreen sur `GET /battery-swap/stations`
11. Retirer "Salaire" chauffeur de Finances.jsx

### Dépendances
- Sprint 5 ✅ (commissions, pricing)
- Prisma migration : `BatteryStation`, `Battery`
- Ajouter champ `passwordHash` sur `User` (pour admin login) ou table `AdminAccount` séparée

### Critères de validation
- Build + lint + tests verts
- Dashboard accessible uniquement avec auth admin
- Toutes les pages Dashboard affichent données réelles depuis API
- CRUD stations/batteries fonctionnel
- ChargingStationsScreen affiche stations réelles

### Tests
- Unit : AdminService, BatterySwapService
- Integration : admin login → CRUD stations → GET public stations
- E2E : admin validates driver → driver notified

### Risques
- **Admin auth** : décider email+password vs OTP (recommandation : email+password)
- **Volume données** : paginer toutes les listes admin

---

## Sprint 7 — Observabilité, Sécurité, CI/CD

### Modules backend
- **Monitoring** : Prometheus metrics, OpenTelemetry traces
- **Security** : audit, rate limiting renforcé, helmet, CORS strict
- **CI/CD** : GitHub Actions, tests automatisés, build Docker

### Tâches techniques
1. Intégrer `@willsoto/nestjs-prometheus` : metrics HTTP, DB, WS connections, queue depth
2. Intégrer OpenTelemetry : traces distributées (HTTP + WS + BullMQ)
3. Intégrer Sentry : error tracking, source maps
4. Audit sécurité :依赖 audit (`npm audit`), revoir JWT expiry, refresh token rotation
5. Renforcer rate limiting : limites par endpoint critique
6. Configurer Helmet + CORS strict (production)
7. Créer Dockerfile multi-stage (build + runtime)
8. Créer docker-compose.yml (app + postgres + redis)
9. Créer GitHub Actions : lint → build → test → (deploy si main)
10. Configurer healthcheck endpoint complet (DB, Redis, BullMQ)
11. Documenter procédure de déploiement (CONFIGURATION.md)

### Critères de validation
- `docker-compose up` démarre l'app complète
- Prometheus `/metrics` expose les métriques
- Sentry capture les erreurs en dev
- CI pipeline vert sur main
- `npm audit` — 0 vulnérabilités critiques

### Tests
- Tests de charge : `artillery` ou `k6` sur endpoints critiques (auth, create trip)
- Security scan : `npm audit`, review manuelle

### Risques
- **Sentry credentials** : utiliser DSN environnement
- **Docker image size** : optimiser avec multi-stage build

---

## Sprint 8 — Bêta, Recette, Optimisation & Production

### Tâches techniques
1. Tests E2E complets : flux client complet + flux chauffeur complet + flux admin
2. Recette fonctionnelle : tester tous les écrans avec backend live
3. Optimisation requêtes DB : analyser Prisma queries, ajouter index manquants
4. Optimisation WS : connection pooling, heartbeat, reconnexion robuste
5. Tests de charge : simuler 100+ chauffeurs concurrents
6. Configuration production : `.env.production`, secrets management
7. Déploiement : VPS ou cloud (DigitalOcean/Hetzner), Nginx reverse proxy, SSL
8. Monitoring production : alertes Prometheus, Sentry dashboards
9. Documentation finale : API Swagger complète, guide déploiement, runbook
10. Préparation mobile : configurer Firebase projets (Telima + Telima Pro), générer APK/IPA
11. Beta test : déploiement fermé avec chauffeurs pilotes

### Critères de validation
- Tous les flux E2E passent (client, chauffeur, admin)
- Tests de charge : < 2s p95 sur endpoints critiques
- 0 erreur Sentry en staging
- Déploiement production réussi
- APK Telima + Telima Pro générés et fonctionnels

### Tests
- E2E : Playwright (dashboard) + integration tests (mobile + backend)
- Charge : 100 chauffeurs concurrents, 50 courses/min
- Sécurité : penetration testing basique, OWASP top 10

### Risques
- **Africa's Talking credentials** : nécessaires pour OTP réel en production
- **Google Maps API key** : quotas production, billing configuré
- **Orange Money credentials** : nécessaires pour commissions réelles
- **Apple App Store / Google Play** : processus de review, temps non maîtrisé

---

## Récapitulatif des sprints

| Sprint | Durée estimée | Modules backend | Écrans câblés |
|---|---|---|---|
| **3** | 2-3 semaines | Tracking, Chat, Notifications, Trip extensions | Telima Pro (tous), Telima (tracking, chat) |
| **4** | 1-2 semaines | Pricing endpoint | Telima (tous), retrait PaymentScreen |
| **5** | 2 semaines | Payments, Commissions, Pricing dynamique, Zones | Telima Pro (finances), Dashboard (paramétrage) |
| **6** | 2-3 semaines | Admin, Battery-Swap, Dashboard Auth | Dashboard (tous), Telima (charging) |
| **7** | 1-2 semaines | Monitoring, Security, CI/CD | — |
| **8** | 2-3 semaines | Optimisation, E2E, Déploiement | Recette complète |

**Total estimé : 10-16 semaines jusqu'à la mise en production V1.**
