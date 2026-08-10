# Matrice de Cohérence Frontend ↔ Backend V1

> Document de référence figeant l'architecture V1 et l'intégration avec les 3 applications.
> Version 1.0 — Juillet 2026

---

## Sommaire

1. [Conventions de la matrice](#1-conventions-de-la-matrice)
2. [Telima Client — Matrice par écran](#2-telima-client--matrice-par-écran)
3. [Telima Pro — Matrice par écran](#3-telima-pro--matrice-par-écran)
4. [Telima Dashboard — Matrice par page](#4-telima-dashboard--matrice-par-page)
5. [Écarts UI ↔ Backend et ajustements proposés](#5-écarts-ui--backend-et-ajustements-proposés)
6. [Providers externes — Récapitulatif](#6-providers-externes--récapitulatif)

---

## 1. Conventions de la matrice

**Statuts :**
- ✅ **OK** : Backend existant et conforme
- 🔧 **À implémenter** : Backend à créer (sprint planifié)
- ⚠️ **À ajuster** : Backend ou UI nécessite modification
- ❌ **À supprimer (UI)** : Écran/élément UI obsolète pour la V1

**Permissions :**
- `public` : Pas d'auth requise
- `client` : Rôle client (JWT)
- `driver` : Rôle chauffeur (JWT)
- `admin` : Rôle admin (JWT)

---

## 2. Telima Client — Matrice par écran

### 2.1 PhoneScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/auth/presentation/screens/phone_screen.dart` |
| **REST** | `POST /auth/request-otp` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `public` |
| **DTO** | `RequestOtpDto { phone: string (+223XXXXXXXX) }` |
| **Prisma** | `OtpCode` (codeHash, expiresAt, attempts, blockedUntil) |
| **Providers** | SMS (Africa's Talking / MockSmsProvider) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### 2.2 OtpScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/auth/presentation/screens/otp_screen.dart` |
| **REST** | `POST /auth/verify-otp` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `public` |
| **DTO** | `VerifyOtpDto { phone: string, code: string (4 chiffres) }` |
| **Prisma** | `OtpCode`, `User`, `RefreshToken` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI valide tout code à 4 chiffres (`value.length == 4`). À ajuster : appeler `verifyOtp` et gérer réponse JWT. Timer UI = 60s, backend expiration = 5min. |

### 2.3 ProfileCreationScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/auth/presentation/screens/profile_creation_screen.dart` |
| **REST** | `PATCH /users/me` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `client` |
| **DTO** | `UpdateUserDto { firstName?: string, lastName?: string, email?: string }` |
| **Prisma** | `User` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI capture firstName, lastName, email. Backend `UpdateUserDto` couvre ces champs. |

### 2.4 HomeScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/home/presentation/screens/home_screen.dart` |
| **REST** | `GET /vehicle-types?serviceType=ride` (liste véhicules disponibles) |
| **WebSocket** | — (pas de WS à ce stade) |
| **Domain Events** | — |
| **Permissions** | `client` |
| **DTO** | Réponse: `VehicleType[]` (id, name, serviceType, capacity, baseFare, pricePerKm, pricePerMin, commissionPercentage, isActive) |
| **Prisma** | `VehicleType` |
| **Providers** | Google Maps Flutter (carte + markers) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI hardcode 3 types véhicule (moto/eco/fraich). À ajuster : récupérer depuis API. Switch binaire "Se déplacer"/"Livraison" — à étendre futur. |

### 2.5 AddressSelectionScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/home/presentation/screens/address_selection_screen.dart` (via route `/address-selection`) |
| **REST** | — (pas d'API dédiée, géocoding via Google Maps SDK) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `client` |
| **DTO** | — |
| **Prisma** | — (adresses stockées en Hive local) |
| **Providers** | Google Maps Places API (autocomplete) |
| **Statut** | ⚠️ À ajuster |
| **Note** | Les adresses sont stockées localement (Hive). Backend : pas d'API adresses planifiée en V1. Si on veut synchroniser, créer `GET/POST/DELETE /users/addresses` (modèle Prisma `SavedAddress`). Recommandation : garder en local pour V1, API en post-V1. |

### 2.6 RideBookingScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/ride/presentation/screens/ride_booking_screen.dart` |
| **REST** | `POST /pricing/calculate` (prix estimé), `POST /trips` (création course) |
| **WebSocket** | — |
| **Domain Events** | `trip.created` (après `POST /trips`) |
| **Permissions** | `client` |
| **DTO** | Calcul: `PriceQuoteInput { serviceType, vehicleTypeId, pickup, dropoff }`. Création: `CreateTripDto { serviceType: 'ride', vehicleTypeId, pickup: GeoPointDto, pickupAddress, dropoff: GeoPointDto, dropoffAddress, passengerCount?, notes? }` |
| **Prisma** | `VehicleType`, `Trip`, `RideDetails` |
| **Providers** | Google Maps Flutter (carte, markers, polylines), Google Distance Matrix (via backend) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI hardcode prix (500/1500/1950 FCFA). À ajuster : appeler `POST /pricing/calculate`. Types véhicule UI (moto/eco/fraich) à aligner avec backend VehicleType. |

### 2.7 DeliveryBookingScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/delivery/presentation/screens/delivery_booking_screen.dart` |
| **REST** | `POST /pricing/calculate`, `POST /trips` |
| **WebSocket** | — |
| **Domain Events** | `trip.created` |
| **Permissions** | `client` |
| **DTO** | `CreateTripDto { serviceType: 'delivery', vehicleTypeId, pickup, pickupAddress, dropoff, dropoffAddress, recipientName?, recipientPhone?, parcelDescription?, parcelWeightKg?, parcelDimensions?, isFragile?, notes? }` |
| **Prisma** | `VehicleType`, `Trip`, `DeliveryDetails` |
| **Providers** | Google Maps Flutter |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI capture: type colis (leger/moyen/volumineux), destinataire, instructions, véhicule (moto/tricycle), paiement (Moov/Wave/Orange). À ajuster : retirer sélecteur paiement mobile (cash only V1). Mapper type colis vers `parcelDescription`. |

### 2.8 PaymentScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/payment/presentation/screens/payment_screen.dart` |
| **REST** | Aucun (V1 = cash uniquement) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `client` |
| **DTO** | — |
| **Prisma** | — |
| **Providers** | — |
| **Statut** | ❌ À supprimer de l'UI (V1) |
| **Note** | Cet écran propose Orange Money, Wave, Moov Money. **Obsolète en V1** : le client paie en espèces directement au chauffeur. Retirer du flux de navigation. Le flux doit être RideBookingScreen → DriverSearchScreen (sans passage par PaymentScreen). L'infrastructure backend Payment reste générique pour future V2. |

### 2.9 DriverSearchScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/ride/presentation/screens/driver_search_screen.dart` |
| **REST** | — (le trip est déjà créé avant cet écran) |
| **WebSocket** | Écoute: `ride:driver_accepted` (ou `delivery:pickup_en_route`). Émission: `ride:join_room` / `delivery:join_room` |
| **Domain Events** | `dispatch.driver_assigned` (côté backend) |
| **Permissions** | `client` |
| **DTO** | — |
| **Prisma** | `Trip`, `DispatchAttempt` |
| **Providers** | Google Maps Flutter |
| **Statut** | ⚠️ À ajuster |
| **Note** | UI simule la recherche avec timers (6s, 11s). À ajuster : écouter WS `ride:driver_accepted` pour transition vers tracking. Événements legacy à renommer. |

### 2.10 RideTrackingScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/ride/presentation/screens/ride_tracking_screen.dart` |
| **REST** | `GET /trips/:id` (récupération détails trip) |
| **WebSocket** | Écoute: `ride:driver_arrived`, `ride:started`, `ride:completed`, `ride:cancelled`, `driver:location_update`. Émission: `ride:rejoin_room` (reconnexion) |
| **Domain Events** | `trip.driver_arrived`, `trip.started`, `trip.completed`, `trip.cancelled` |
| **Permissions** | `client` |
| **DTO** | — |
| **Prisma** | `Trip`, `Driver`, `Vehicle` |
| **Providers** | Google Maps Flutter, Socket.IO (via `SocketService`) |
| **Statut** | ⚠️ À ajuster |
| **Note** | UI utilise `kDemoMode` + `DemoTripSimulator`. À ajuster : basculer `kDemoMode = false`, écouter WS events avec noms backend (`ride:*`), mettre à jour `TripNotifier` depuis WS. |

### 2.11 DeliveryTrackingScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/delivery/presentation/screens/delivery_tracking_screen.dart` |
| **REST** | `GET /trips/:id` |
| **WebSocket** | Écoute: `delivery:pickup_en_route`, `delivery:parcel_picked_up`, `delivery:delivered`, `delivery:cancelled`, `driver:location_update`. Émission: `delivery:rejoin_room`, `delivery:client_confirmed`, `delivery_issue_reported` |
| **Domain Events** | `trip.started`, `trip.completed`, `trip.cancelled` |
| **Permissions** | `client` |
| **DTO** | — |
| **Prisma** | `Trip`, `DeliveryDetails`, `Driver`, `Vehicle` |
| **Providers** | Google Maps Flutter, Socket.IO |
| **Statut** | ⚠️ À ajuster |
| **Note** | UI simule avec `DemoDeliverySimulator`. À ajuster : WS events avec noms backend. `delivery:client_confirmed` à câbler. `delivery_issue_reported` : backend à prévoir (endpoint ou WS event). |

### 2.12 ChatScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/chat/presentation/screens/chat_screen.dart` |
| **REST** | `GET /trips/:id/messages` (historique), `POST /trips/:id/messages` (envoi texte) |
| **WebSocket** | Écoute: `chat:message` (nouveau message). Émission: `chat:message` (envoi), `chat:audio` (audio via S3 URL) |
| **Domain Events** | `chat.message_sent` (à définir) |
| **Permissions** | `client` |
| **DTO** | `CreateMessageDto { content?: string, audioUrl?: string }`. Réponse: `ChatMessage { id, tripId, senderId, senderRole, content, audioUrl, createdAt }` |
| **Prisma** | `ChatMessage` (à créer: id, tripId, senderId, senderRole, content, audioUrl, createdAt) |
| **Providers** | Socket.IO, S3 Storage (audio upload), `flutter_sound` ou `record` (enregistrement audio) |
| **Statut** | 🔧 À implémenter (backend + câblage frontend) |
| **Note** | UI a TODOs explicites: "wire up flutter_sound" (ligne 68), "send recorded audio via Socket.IO" (ligne 74). Messages hardcodés. |

### 2.13 ChargingStationsScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/charging/presentation/screens/charging_stations_screen.dart` |
| **REST** | `GET /battery-swap/stations` (liste avec disponibilité), `GET /battery-swap/stations/:id` (détail) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `public` ou `client` |
| **DTO** | Réponse: `Station { id, name, address, lat, lng, batteryType, availableBatteries, totalBatteries, supportedModels, openingHours, status }` |
| **Prisma** | `BatteryStation` (à créer), `Battery` (à créer) |
| **Providers** | Google Maps Flutter |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |
| **Note** | UI complète avec carte, markers, détails station. Données hardcodées. Pas de réservation ni paiement en V1. |

### 2.14 SideMenuScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/features/profile/presentation/screens/side_menu_screen.dart` |
| **REST** | `GET /users/me` (profil), `POST /auth/logout` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `client` |
| **DTO** | Réponse: `User { id, phone, role, firstName, lastName, email, createdAt }` |
| **Prisma** | `User` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI hardcode "Moussa Traore" + "+223 76 12 34 56" + rating 4.8. À ajuster : récupérer depuis `GET /users/me`. Entrée "Parrainage" : non prévu V1, masquer. Entrées "Historique", "Mes adresses", "Mes contacts", "Paramètres", "Aide", "CGU" : à câbler ou masquer selon priorité. |

---

## 3. Telima Pro — Matrice par écran

### 3.1 PhoneScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/phone_screen.dart` |
| **REST** | `POST /auth/request-otp` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `public` |
| **DTO** | `RequestOtpDto { phone: string }` |
| **Prisma** | `OtpCode` |
| **Providers** | SMS (Africa's Talking / MockSmsProvider) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI hardcode `+223` country code. Simule avec `Future.delayed(2s)`. À ajuster : appeler API. |

### 3.2 OtpScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/otp_screen.dart` |
| **REST** | `POST /auth/verify-otp` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `public` |
| **DTO** | `VerifyOtpDto { phone, code }` |
| **Prisma** | `OtpCode`, `User`, `RefreshToken` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI: 4 champs OTP, timer 45s (`Constants.otpTimeoutSeconds`). Backend: expiration 5min. À aligner : timer UI à passer à 60s ou 300s. |

### 3.3 OnboardingScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/onboarding_screen.dart` |
| **REST** | `POST /drivers/upload-document` (upload permis, carte d'identité, carte grise), `POST /drivers/register` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `driver` |
| **DTO** | `RegisterDriverDto { photoUrl?, licenseUrl, idCardUrl, vehicle: VehicleInputDto { vehicleTypeId, brand, model, year, plateNumber, energy, registrationDocUrl? } }` |
| **Prisma** | `Driver`, `Vehicle`, `VehicleType` |
| **Providers** | S3 Storage (upload documents), `image_picker` (sélection images) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI: 3 pages (identité+documents, véhicule, énergie+clim). UI capture: firstName, lastName, brand, model, year, plate, energy (Electrique/Essence/Diesel), clim (Avec/Sans). Backend `RegisterDriverDto` n'inclut pas firstName/lastName (gérés via `PATCH /users/me`). Clim non stocké dans `Vehicle` — à ajouter ou gérer via `VehicleType`. |

### 3.4 WaitingValidationScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/auth/waiting_validation_screen.dart` |
| **REST** | `GET /drivers/me` (polling statut) |
| **WebSocket** | Écoute (futur): `driver:validated` / `driver:rejected` (push notification) |
| **Domain Events** | — |
| **Permissions** | `driver` |
| **DTO** | Réponse: `Driver { id, status: 'pending_validation' | 'validated' | 'suspended' | 'rejected' }` |
| **Prisma** | `Driver` |
| **Providers** | FCM (notification validation) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ (endpoint `GET /drivers/me` existe) |
| **Note** | UI simule validation après 3s. À ajuster : polling `GET /drivers/me` ou FCM push. |

### 3.5 HomeScreen (Driver)

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/home/home_screen.dart` |
| **REST** | `PATCH /drivers/me/online-status` (online/offline), `GET /drivers/me` (profil + commissionDue) |
| **WebSocket** | Écoute: `trip:new_request` (nouvelle course). Émission: `driver:join_room`, `driver:online`, `driver:offline` |
| **Domain Events** | `driver.online`, `driver.offline` |
| **Permissions** | `driver` |
| **DTO** | `UpdateOnlineStatusDto { isOnline: boolean }`. Réception trip: `TripRequestPayload { tripId, serviceType, pickupAddress, dropoffAddress, estimatedPrice, commission, distanceKm, clientName, clientRating, vehicleType }` |
| **Prisma** | `Driver`, `Trip` |
| **Providers** | Google Maps Flutter, Socket.IO (à implémenter), FCM |
| **Statut** | 🔧 À implémenter (backend WS + câblage frontend) |
| **Note** | UI: CommissionLock si commissionDue > 5000 FCFA (hardcodé). À ajuster : seuil configurable côté backend (ServiceConfig ou paramètre global). TripRequestScreen overlay quand `tripStatus == 'ping'`. |

### 3.6 TripRequestScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/trip_request_screen.dart` |
| **REST** | — (via WS uniquement) |
| **WebSocket** | Émission: `trip:accept`, `trip:decline` |
| **Domain Events** | `trip.accepted` (après accept), `dispatch.failed` (si tous refusent) |
| **Permissions** | `driver` |
| **DTO** | — (payload WS) |
| **Prisma** | `Trip`, `DispatchAttempt` |
| **Providers** | Son + vibration (`AudioPlayer` / `HapticFeedback`) |
| **Statut** | 🔧 À implémenter (backend WS + câblage frontend) |
| **Note** | UI: timer 40s (`Constants.pingTimeoutSeconds`), affiche prix + commission + adresses + colis si livraison. À aligner : timeout backend dispatch (BullMQ) vs timer frontend. Distingue DEPLACEMENT/LIVRAISON. |

### 3.7 PickupScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/pickup_screen.dart` |
| **REST** | `PATCH /trips/:id/status` (status: `driver_arriving`) |
| **WebSocket** | Émission: `driver:position` (GPS broadcast). Écoute: `ride:cancelled` / `delivery:cancelled` |
| **Domain Events** | `trip.driver_arrived` |
| **Permissions** | `driver` |
| **DTO** | `UpdateTripStatusDto { status: 'driver_arriving' }` |
| **Prisma** | `Trip` |
| **Providers** | Google Maps Flutter, Socket.IO, GPS (`geolocator` ou `location`) |
| **Statut** | 🔧 À implémenter (backend + câblage frontend) |
| **Note** | UI: navigation vers pickup, timer attente client, bouton "Arrivé", chat. À ajuster : envoyer `PATCH /trips/:id/status` pour `driver_arriving`, puis `driver_arrived`. |

### 3.8 InRouteScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/in_route_screen.dart` |
| **REST** | `PATCH /trips/:id/status` (status: `in_progress`) |
| **WebSocket** | Émission: `driver:position` (GPS broadcast). Écoute: `ride:cancelled` / `delivery:cancelled` |
| **Domain Events** | `trip.started` |
| **Permissions** | `driver` |
| **DTO** | `UpdateTripStatusDto { status: 'in_progress' }` |
| **Prisma** | `Trip` |
| **Providers** | Google Maps Flutter, Socket.IO, GPS |
| **Statut** | 🔧 À implémenter (backend + câblage frontend) |
| **Note** | UI: navigation vers destination, banner "Livraison en cours" / "En route", chat. À ajuster : envoyer `PATCH /trips/:id/status` pour `in_progress`. |

### 3.9 ClosingScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/closing_screen.dart` |
| **REST** | `PATCH /trips/:id/status` (status: `completed`), `POST /trips/:id/payment-received` (confirmation cash) |
| **WebSocket** | — (broadcast backend: `ride:completed` / `delivery:delivered` vers client) |
| **Domain Events** | `trip.completed` |
| **Permissions** | `driver` |
| **DTO** | `UpdateTripStatusDto { status: 'completed' }`. `PaymentReceivedDto` (à créer: `{ amount: number }`) |
| **Prisma** | `Trip`, `Driver` (balance update) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend endpoint `payment-received` + câblage frontend) |
| **Note** | UI: affiche montant à encaisser, texte explicite "Ce paiement est géré directement entre vous et le client, hors application". Bouton "Montant encaissé - Cloturer la course". À implémenter : endpoint `POST /trips/:id/payment-received` qui confirme cash reçu et déclenche `trip.completed`. |

### 3.10 RatingScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/rating_screen.dart` |
| **REST** | `POST /trips/:id/rating` |
| **WebSocket** | — |
| **Domain Events** | `trip.rated` (à définir) |
| **Permissions** | `driver` |
| **DTO** | `CreateRatingDto { rating: number (1-5), tags?: string[] }` (à créer) |
| **Prisma** | `TripRating` (à créer: id, tripId, raterId, raterRole, rating, tags, createdAt) ou champ sur Trip |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend + câblage frontend) |
| **Note** | UI: étoiles 1-5 + tags (Courtois, Ponctuel, Retard, Impoli, Propre). Évaluation du client par le chauffeur. Backend : créer endpoint + modèle. |

### 3.11 FinanceScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/finance/finance_screen.dart` |
| **REST** | `GET /drivers/me/finances` (solde, commissions, historique), `GET /trips/me?role=driver` (historique courses) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `driver` |
| **DTO** | `FinanceSummaryDto { balance, commissionDue, commissionPaid, transactions: CommissionTransaction[] }` (à créer) |
| **Prisma** | `Driver` (balance, commissionDue), `Trip` (commission par course), `CommissionPayment` (à créer) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |
| **Note** | UI: solde, commissions dues/payées, graphiques jour/semaine/mois, historique. Données mockées dans `FinanceProvider`. |

### 3.12 OrangeMoneySheet

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/finance/orange_money_sheet.dart` |
| **REST** | `POST /payments/commission` (initiation paiement commission via Orange Money) |
| **WebSocket** | Écoute: `payment:confirmed` (confirmation webhook) |
| **Domain Events** | `payment.succeeded` |
| **Permissions** | `driver` |
| **DTO** | `PayCommissionDto { amount: number, phoneNumber: string }` (à créer) |
| **Prisma** | `CommissionPayment` (à créer: id, driverId, amount, status, transactionRef, paidAt) |
| **Providers** | Orange Money API / Webhook |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |
| **Note** | UI: affiche montant dû, bouton "Payer". Simule paiement. À implémenter : initier paiement Orange Money, attendre webhook confirmation. |

### 3.13 CommissionLockScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/widgets/commission_lock.dart` |
| **REST** | `GET /drivers/me` (vérifier commissionDue) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `driver` |
| **DTO** | — |
| **Prisma** | `Driver` (commissionDue) |
| **Providers** | — |
| **Statut** | ⚠️ À ajuster |
| **Note** | UI: seuil hardcodé 5000 FCFA dans `HomeScreen`. À ajuster : seuil configurable côté backend (paramètre global ou ServiceConfig). |

### 3.14 HistoryScreen

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/drawer/history_screen.dart` |
| **REST** | `GET /trips/me?role=driver&page=1&limit=20` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `driver` |
| **DTO** | Réponse: `PaginatedTrips { items: Trip[], total, page, limit }` |
| **Prisma** | `Trip` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### 3.15 ChatScreen (Telima Pro)

| Aspect | Valeur |
|---|---|
| **Fichier** | `lib/presentation/screens/trip/chat_screen.dart` |
| **REST** | `GET /trips/:id/messages`, `POST /trips/:id/messages` |
| **WebSocket** | Écoute: `chat:message`. Émission: `chat:message`, `chat:audio` |
| **Domain Events** | `chat.message_sent` |
| **Permissions** | `driver` |
| **DTO** | `CreateMessageDto { content?, audioUrl? }` |
| **Prisma** | `ChatMessage` (à créer) |
| **Providers** | Socket.IO, S3 Storage, audio recording |
| **Statut** | 🔧 À implémenter (backend Sprint 3 + câblage frontend) |

---

## 4. Telima Dashboard — Matrice par page

### 4.1 Login (à créer)

| Aspect | Valeur |
|---|---|
| **Fichier** | À créer (`src/Pages/Login.jsx`) |
| **REST** | `POST /auth/request-otp` + `POST /auth/verify-otp` (ou email+password pour admin) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `public` → `admin` |
| **DTO** | `RequestOtpDto` / `VerifyOtpDto` (ou `AdminLoginDto { email, password }` à créer) |
| **Prisma** | `User` (role: admin) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (UI + backend) |
| **Note** | Aucune page login existe actuellement. À décider : OTP (comme clients) ou email+password pour admin. Recommandation : email+password pour admin (plus simple, moins de coût SMS). |

### 4.2 Dashboard

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Dashboard.jsx` |
| **REST** | `GET /admin/stats` (KPIs agrégés: courses, revenus, chauffeurs actifs, clients) |
| **WebSocket** | — (futur: live updates) |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `AdminStatsDto { totalRevenue, totalRides, totalDeliveries, activeDrivers, registeredClients, revenueByService: { ride, delivery, batterySwap, batteryCharged } }` (à créer) |
| **Prisma** | `Trip`, `Driver`, `User` (agrégations) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### 4.3 Drivers

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Drivers.jsx` |
| **REST** | `GET /drivers?status=...` (liste filtrée) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | Réponse: `Driver[]` (id, user: {firstName, lastName, phone, email}, status, vehicle, rating, isOnline) |
| **Prisma** | `Driver`, `User`, `Vehicle` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ (endpoint existe) |

### 4.4 DriverDetails / DriverValidation

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/DriverDetails.jsx` (ou intégrée dans Drivers) |
| **REST** | `GET /drivers/:id`, `PATCH /drivers/:id/validate`, `PATCH /drivers/:id/suspend` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `SuspendDriverDto { reason: string }` |
| **Prisma** | `Driver`, `User`, `Vehicle` |
| **Providers** | S3 (visualisation documents chauffeur) |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### 4.5 Clients

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Clients.jsx` |
| **REST** | `GET /users?role=client` (à créer: filtre par rôle) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | Réponse: `User[]` filtré par role=client |
| **Prisma** | `User` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend: ajouter filtre rôle sur `GET /users` + câblage frontend) |
| **Note** | Backend actuel: `GET /users/me` uniquement. À étendre: `GET /users?role=client` (admin). |

### 4.6 Courses

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Courses.jsx` |
| **REST** | `GET /trips` (admin, avec filtres: service, statut, période, recherche) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | Réponse: `PaginatedTrips { items: Trip[], total, page, limit }` |
| **Prisma** | `Trip`, `User` (client), `Driver` (chauffeur), `VehicleType` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend: étendre `GET /trips` pour admin + câblage frontend) |
| **Note** | Backend actuel: `GET /trips/me` (client/driver). À ajouter: `GET /trips` (admin, tous trips avec filtres). |

### 4.7 CourseDetails

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/CourseDetails.jsx` (ou intégrée) |
| **REST** | `GET /trips/:id` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | Réponse: `Trip` avec relations (client, driver, vehicleType, rideDetails, deliveryDetails, dispatchAttempts) |
| **Prisma** | `Trip` + relations |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |

### 4.8 Payments

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Payments.jsx` |
| **REST** | `GET /admin/commissions` (liste commissions par chauffeur, statut payée/non payée) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `CommissionSummaryDto { driverId, driverName, totalDue, totalPaid, courses: Trip[] }` (à créer) |
| **Prisma** | `Driver` (commissionDue), `Trip` (commission par course), `CommissionPayment` (à créer) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |

### 4.9 Finances

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Finances.jsx` |
| **REST** | `GET /admin/finances` (CA jour/mois, revenus, commissions, transactions) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `AdminFinanceDto { dailyRevenue, monthlyRevenue, totalRevenue, totalCommissions, transactions: Transaction[] }` (à créer) |
| **Prisma** | `Trip`, `Driver`, `CommissionPayment` (agrégations) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |
| **Note** | UI inclut "Salaire" chauffeur (lignes S001-S005) — concept non prévu backend. À retirer de l'UI ou à clarifier (commission ≠ salaire). |

### 4.10 Stations

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Stations.jsx` |
| **REST** | `GET /battery-swap/stations`, `POST /battery-swap/stations`, `PUT /battery-swap/stations/:id`, `DELETE /battery-swap/stations/:id` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` (CRUD), `public`/`client` (GET uniquement) |
| **DTO** | `CreateStationDto { name, address, lat, lng, batteryType, batteryCapacity, batteryPrice }` (à créer) |
| **Prisma** | `BatteryStation` (à créer), `Battery` (à créer) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### 4.11 Batteries

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Batteries.jsx` |
| **REST** | `GET /battery-swap/batteries`, `POST /battery-swap/batteries`, `PUT /battery-swap/batteries/:id`, `DELETE /battery-swap/batteries/:id` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `CreateBatteryDto { type, capacity, quantity, stationId }` (à créer) |
| **Prisma** | `Battery` (à créer) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### 4.12 Reports

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/Reports.jsx` |
| **REST** | `GET /admin/reports` (stats par véhicule, chauffeur, évolution mensuelle) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `ReportDto { vehicleStats, driverStats, monthlyEvolution }` (à créer) |
| **Prisma** | `Trip`, `Driver`, `VehicleType` (agrégations) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 6 + câblage frontend) |

### 4.13 ParametrageTarification

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageTarification.jsx` |
| **REST** | `GET /vehicle-types` (grille tarifaire), `PATCH /vehicle-types/:id` (modification tarifs) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `UpdateVehicleTypeDto { baseFare?, pricePerKm?, pricePerMin?, commissionPercentage? }` |
| **Prisma** | `VehicleType` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ (GET + PATCH existent) |
| **Note** | UI: grille par type véhicule (tarif base, prix/km, prix/min, commission). Backend `UpdateVehicleTypeDto` couvre ces champs. |

### 4.14 ParametrageVehicules

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageVehicules.jsx` |
| **REST** | `GET /vehicle-types?includeInactive=true`, `POST /vehicle-types`, `PATCH /vehicle-types/:id`, `DELETE /vehicle-types/:id` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `CreateVehicleTypeDto { name, serviceType, capacity, baseFare, pricePerKm, pricePerMin, commissionPercentage, isActive? }` |
| **Prisma** | `VehicleType` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI: CRUD local avec useState, champ "service" (Déplacement/Livraison). Backend: `serviceType` enum. Fonction "Masquer/Afficher" = `isActive` toggle. |

### 4.15 ParametrageCommissions

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageCommissions.jsx` |
| **REST** | `GET /vehicle-types` (commissionPercentage par type), `PATCH /vehicle-types/:id` (modification commission) |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `UpdateVehicleTypeDto { commissionPercentage? }` |
| **Prisma** | `VehicleType` |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (câblage frontend) — backend ✅ |
| **Note** | UI: taux commission par type véhicule. Backend: `commissionPercentage` sur `VehicleType`. Pas d'endpoint séparé nécessaire. |

### 4.16 ParametrageZones

| Aspect | Valeur |
|---|---|
| **Fichier** | `src/Pages/ParametrageZones.jsx` |
| **REST** | `GET /admin/zones`, `POST /admin/zones`, `PUT /admin/zones/:id`, `DELETE /admin/zones/:id` |
| **WebSocket** | — |
| **Domain Events** | — |
| **Permissions** | `admin` |
| **DTO** | `CreateZoneDto { name, city, radiusKm, surgeMultiplier, isActive }` (à créer) |
| **Prisma** | `ServiceZone` (à créer: id, name, city, radiusKm, surgeMultiplier, isActive, createdAt) |
| **Providers** | — |
| **Statut** | 🔧 À implémenter (backend Sprint 5 + câblage frontend) |
| **Note** | UI: ville/zone, rayon, majoration (surge), statut. Backend: modèle `ServiceZone` à créer pour moteur tarification dynamique. |

---

## 5. Écarts UI ↔ Backend et ajustements proposés

### 5.1 Écarts critiques — Ajustements backend

| # | Écart | Ajustement proposé | Priorité |
|---|---|---|---|
| 1 | **PaymentScreen (Telima client)** propose Orange Money / Wave | **UI**: Retirer du flux (`RideBookingScreen` → `DriverSearchScreen` directement). **Backend**: Garder infrastructure Payment générique (interface `PaymentProvider`) pour V2. | P0 Sprint 3 |
| 2 | **DeliveryBookingScreen** propose Moov Money, Wave, Orange Money | **UI**: Retirer sélecteur moyen de paiement. **Backend**: `payment_method` = `cash` par défaut sur Trip. | P0 Sprint 3 |
| 3 | **Telima Pro n'a pas de SocketService** | **Backend**: Implémenter WS events `trip:new_request`, `trip:accept`, `trip:decline` dans Events Gateway. **Frontend**: Créer `SocketService` côté Telima Pro. | P0 Sprint 3 |
| 4 | **ClosingScreen** : pas d'endpoint `POST /trips/:id/payment-received` | **Backend**: Ajouter endpoint qui confirme cash reçu, déclenche `trip.completed`, met à jour `Driver.balance`. | P0 Sprint 3 |
| 5 | **RatingScreen (Telima Pro)** : pas d'endpoint ni modèle rating | **Backend**: Créer `POST /trips/:id/rating` + modèle `TripRating` (ou champ sur Trip). | P1 Sprint 3 |
| 6 | **ChatScreen** : pas de backend chat | **Backend**: Créer module Chat (modèle `ChatMessage`, endpoints REST, WS events, S3 audio upload). | P0 Sprint 3 |
| 7 | **Dashboard n'a pas d'auth** | **Backend**: Ajouter `AdminLoginDto` (email+password) ou réutiliser OTP. **Frontend**: Créer page Login + protection routes. | P0 Sprint 6 |
| 8 | **Dashboard Courses** : `GET /trips` admin n'existe pas | **Backend**: Étendre TripsController avec `GET /trips` (admin, filtres: service, statut, période). | P1 Sprint 6 |
| 9 | **Dashboard Clients** : `GET /users?role=client` n'existe pas | **Backend**: Étender UsersController avec `GET /users` (admin, filtre rôle). | P1 Sprint 6 |
| 10 | **Dashboard Finances** : "Salaire" chauffeur | **UI**: Retirer ou renommer (commission ≠ salaire). **Backend**: Pas de concept de salaire. | P2 Sprint 6 |

### 5.2 Écarts de vocabulaire — Ajustements frontend

| # | Écart | Ajustement | Sprint |
|---|---|---|---|
| 11 | WS events Telima client legacy (`driver_accepted` etc.) | Renommer vers `ride:driver_accepted` etc. dans `socket_service.dart` + providers | Sprint 4 |
| 12 | Trip status Telima Pro (`idle/ping/approaching` etc.) | Mapper vers backend (`pending/accepted/driver_arriving` etc.) dans `TripProvider` | Sprint 3 |
| 13 | Service type Telima Pro (`DEPLACEMENT/LIVRAISON`) | Mapper vers `ride/delivery` lors du câblage | Sprint 3 |
| 14 | Types véhicule Telima client (`moto/eco/fraich`) | Récupérer depuis `GET /vehicle-types` au lieu de hardcoder | Sprint 4 |
| 15 | Timer OTP Telima Pro (45s) vs backend (5min) | Aligner timer UI sur 60s (renvoi possible) | Sprint 3 |

### 5.3 Éléments UI à masquer/retirer en V1

| Élément | App | Action | Raison |
|---|---|---|---|
| PaymentScreen | Telima client | Retirer du flux | Cash only V1 |
| Sélecteur paiement mobile (DeliveryBookingScreen) | Telima client | Retirer | Cash only V1 |
| "Parrainage" (SideMenuScreen) | Telima client | Masquer | Non prévu V1 |
| "Salaire" chauffeur (Finances) | Dashboard | Retirer | Concept non applicable |
| AddDriver.jsx | Dashboard | Non router (déjà non routée) | Inscription via app chauffeur |

### 5.4 Éléments backend à créer pour couvrir l'UI existante

| Module/Endpoint | Sprint | Écrans concernés |
|---|---|---|
| Module Chat (ChatMessage, REST, WS, S3 audio) | Sprint 3 | ChatScreen (Telima + Telima Pro) |
| Module Tracking (GPS position broadcast) | Sprint 3 | PickupScreen, InRouteScreen, RideTrackingScreen, DeliveryTrackingScreen |
| Module Notifications (FCM) | Sprint 3 | HomeScreen (driver), RideTrackingScreen, WaitingValidationScreen |
| `POST /trips/:id/payment-received` | Sprint 3 | ClosingScreen |
| `POST /trips/:id/rating` + modèle TripRating | Sprint 3 | RatingScreen |
| `GET /drivers/me/finances` | Sprint 5 | FinanceScreen |
| `POST /payments/commission` + CommissionPayment | Sprint 5 | OrangeMoneySheet |
| `GET /admin/stats` | Sprint 6 | Dashboard |
| `GET /trips` (admin) | Sprint 6 | Courses |
| `GET /users` (admin) | Sprint 6 | Clients |
| `GET /admin/commissions` | Sprint 6 | Payments |
| `GET /admin/finances` | Sprint 6 | Finances |
| `GET /admin/reports` | Sprint 6 | Reports |
| Module Battery-Swap (Station, Battery, CRUD) | Sprint 6 | Stations, Batteries, ChargingStationsScreen |
| `GET/POST/PUT/DELETE /admin/zones` + ServiceZone | Sprint 5 | ParametrageZones |
| Auth Dashboard (login admin) | Sprint 6 | Login (à créer) |

---

## 6. Providers externes — Récapitulatif

| Provider | Usage | Apps concernées | Statut | Sprint |
|---|---|---|---|---|
| **Google Maps Flutter** | Carte, markers, polylines | Telima, Telima Pro | ✅ Implémenté côté UI | — |
| **Google Maps Places** | Autocomplete adresses | Telima | ✅ Implémenté côté UI | — |
| **Google Distance Matrix** | Calcul distance/durée | Backend (via PricingService) | ✅ Implémenté (Sprint 2) | — |
| **Socket.IO** | Temps réel (courses, tracking, chat) | Telima (✅ câblé, events legacy), Telima Pro (❌ à créer), Dashboard (futur) | 🔧 À implémenter | Sprint 3-4 |
| **SMS (Africa's Talking)** | Envoi OTP | Backend | ✅ Interface + Mock (Sprint 1) | Credentials à configurer |
| **S3 Storage** | Upload documents chauffeur, audio chat | Backend, Telima Pro, Telima | ✅ Interface + Mock (Sprint 1) | Credentials à configurer |
| **FCM (Firebase Cloud Messaging)** | Push notifications | Telima, Telima Pro | ❌ À implémenter | Sprint 3 |
| **Orange Money Webhook** | Paiement commissions chauffeur | Backend | 🔧 À implémenter | Sprint 5 |
| **GPS (geolocator/location)** | Position chauffeur | Telima Pro | ❌ À implémenter côté Flutter | Sprint 3 |
| **Audio recording (flutter_sound/record)** | Messages audio chat | Telima, Telima Pro | ❌ À implémenter côté Flutter | Sprint 3 |
