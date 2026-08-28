# Telima Ecosystem — Audit End-to-End

**Date:** 2026-08-12  
**Auditeur:** Cascade  
**Périmètre:** Telima Client, Telima Pro, Telima Dashboard, Telima Backend, PostgreSQL/PostGIS, Redis, FCM, Render

---

## 1. Architecture

```
Telima Client (Flutter/Riverpod)  ──┐
  Dio + socket_io + Hive            │
                                     ├── REST /v1 ──→ NestJS Backend
Telima Pro (Flutter/Provider)    ──┤  WebSocket   ──→ Socket.io + Redis adapter
  http + socket_io + SharedPrefs    │                  ↓
                                     │          PostgreSQL/PostGIS + Redis
Telima Dashboard (React/Vite)   ──┘  fetch only     BullMQ (dispatch timeouts)
  No WebSocket, polling 30s                           FCM (firebase-admin)
```

---

## 2. API Contracts — Cartographie

### Client (Flutter) — `trips_api.dart`
`POST /trips`, `POST /pricing/quote`, `GET /trips/:id`, `GET /trips/me`, `PATCH /trips/:id/status`, `POST /trips/:id/rating`, `GET /trips/:tripId/messages`, `POST /chat/upload-audio`

### Pro (Flutter) — `trips_api.dart` + `drivers_api.dart` + `auth_api.dart`
`POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/logout`, `GET /drivers/me`, `POST /drivers/register`, `PATCH /drivers/me`, `PATCH /drivers/me/online-status`, `GET /trips/:id`, `POST /trips/:id/accept`, `POST /trips/:id/decline`, `PATCH /trips/:id/status`, `POST /trips/:id/payment-received`, `POST /trips/:id/rating`, `GET /trips/me`

### Dashboard (React) — `client.js`
`POST /auth/admin/login`, `GET /admin/stats`, `GET /admin/finances`, `GET /admin/reports/commissions`, `GET /drivers`, `PATCH /drivers/:id/validate`, `PATCH /drivers/:id/suspend`, `GET/POST /admin/users`, `GET /admin/trips`, `GET/POST/PATCH/DELETE /battery-swap/stations`, `GET/POST/PATCH/DELETE /admin/zones`, `/admin/pricing-rules`, `/vehicle-types`, `GET /admin/payments`, `GET/PATCH /admin/settings`

### WebSocket Events
`trip:new_request` (S→D), `ride:driver_accepted/arrived/started/completed/cancelled` (S→C), `driver:position` (D→S), `driver:location_update` (S→C), `trip:accept/decline/join` (D→S), `message:send/received` (bidirectional), `delivery:client_confirmed` (C→S)

---

## 3. États Métier — Incohérences

**Backend (Prisma):** `pending → accepted → driver_arriving → in_progress → completed` + `cancelled_by_client/driver/auto`

**Client:** `searching → driverAccepted → driverArrived → tripStarted → tripCompleted` + `cancelled/noDriverFound`

**Pro:** `idle → ping → approaching → waiting → in_progress → closing → rating`

**Dashboard:** `pending/accepted/ongoing/completed/cancelled`

- **P1:** Dashboard utilise `ongoing` au lieu de `in_progress` — filtres cassés
- **P2:** Dashboard manque labels pour `driver_arriving`, `cancelled_by_*`
- **P2:** Pas de statut `arrived` distinct côté backend

---

## 4. Problèmes par Sévérité

### P0 — Critique (production-blocking)

| # | Problème | Composant | Certitude |
|---|----------|-----------|-----------|
| P0-1 | Pas de push FCM pour `trip:new_request` — `NotificationHandler` ne gère pas `TripCreated` | Backend | Certain |
| P0-2 | Aucune app Flutter n'enregistre de token FCM — `POST /devices/register` jamais appelé | Client+Pro | Certain |
| P0-3 | Telima Pro n'a aucune dépendance Firebase — pas de push possible | Pro | Certain |
| P0-4 | Pas de service GPS en arrière-plan sur Pro — chauffeurs invisibles au dispatch | Pro | Certain |
| P0-5 | Déconnexion WS marque immédiatement le chauffeur offline — pas de délai de grâce | Backend | Certain |
| P0-6 | Pas de timeout serveur HTTP configuré — requêtes peuvent pendre indéfiniment | Backend | Certain |
| P0-7 | Render free tier cold starts — 30-60s de latence au réveil | Infrastructure | Probable |
| P0-8 | Dashboard sans WebSocket — aucune visibilité temps réel | Dashboard | Certain |

### P1 — Élevé

| # | Problème | Composant |
|---|----------|-----------|
| P1-1 | Firebase Messaging en dépendance Client mais non implémenté | Client |
| P1-2 | Pas de polling automatique côté Client quand WS down | Client |
| P1-3 | Presence TTL 120s sans heartbeat périodique (Pro) — chauffeur stationnaire expire | Pro+Backend |
| P1-4 | `declineTrip()` fire-and-forget — refus silencieusement perdu | Pro |
| P1-5 | Pas de ping/timeout WebSocket explicite | Backend |
| P1-6 | Healthcheck séquentiel — timeout sur cold start | Backend |
| P1-7 | Pas de graceful shutdown — connexions non fermées | Backend |
| P1-8 | Pas de rate limiting | Backend |
| P1-9 | CORS REST non configuré explicitement | Backend |
| P1-10 | Dashboard status mismatch `ongoing` vs `in_progress` | Dashboard |
| P1-11 | Dashboard pas de pagination sur Courses | Dashboard |
| P1-12 | Dashboard pas d'error boundary | Dashboard |
| P1-13 | Pas de retry exponentiel sur dispatch | Backend |
| P1-14 | FcmPushProvider ne nettoie pas tokens invalides | Backend |
| P1-15 | `completeTrip()` non atomique — payment+status en 2 appels | Pro |
| P1-16 | Pas de connection pooling Prisma configuré | Backend |

### P2 — Moyen

| # | Problème | Composant |
|---|----------|-----------|
| P2-1 | Dashboard styles inline partout | Dashboard |
| P2-2 | Pas de lazy loading (Dashboard) | Dashboard |
| P2-3 | Pas de tests (Dashboard) | Dashboard |
| P2-4 | `VITE_API_URL` hardcodé dans netlify.toml | Dashboard |
| P2-5 | Pas d'observabilité (structured logging, metrics) | Backend |
| P2-6 | Pas de Redis sentinel/cluster | Backend |
| P2-7 | CORS WebSocket non restreint | Backend |
| P2-8 | Idempotency lock non nettoyé sur erreur | Backend |
| P2-9 | Pas de rayon de dispatch dynamique | Backend |
| P2-10 | Dashboard labels de statut incomplets | Dashboard |
| P2-11 | Pas de gestion offline (Client + Pro) | Flutter apps |
| P2-12 | `http` package au lieu de Dio (Pro) | Pro |
| P2-13 | Pas de sanitization des entrées | Backend |
| P2-14 | Admin settings sans DTO validation | Backend |

---

## 5. Flux Critiques — Points de Rupture

### 5.1 Création de course (Client → Dispatch → Pro)
1. **P0:** Si WS Pro déconnecté → `trip:new_request` perdu, pas de push FCM de fallback
2. **P0:** Si app Pro en arrière-plan → pas de GPS → chauffeur invisible au dispatch
3. **P1:** Si WS Client déconnecté à l'acceptation → `ride:driver_accepted` perdu, pas de polling auto

### 5.2 Suivi GPS (Pro → Backend → Client)
1. **P0:** App Pro en arrière-plan → `getPositionStream()` s'arrête
2. **P1:** `distanceFilter: 10m` → updates rares en zone dense à faible vitesse
3. **P1:** Pas de REST fallback pour la position si WS down

### 5.3 Annulation
1. **P1:** Si WS Pro déconnecté → `ride:cancelled` perdu, pas de polling de statut côté Pro
2. **P1:** Pas de push FCM pour informer le client si WS déconnecté

---

## 6. Plan d'Implémentation

### Phase 1 — P0 (1-2 semaines)

| Action | Effort |
|--------|--------|
| Ajouter push FCM pour `TripCreated` dans `NotificationHandler` | 2h |
| Intégrer `firebase_messaging` dans Telima Pro + enregistrement token | 1j |
| Implémenter init Firebase + enregistrement token dans Telima Client | 0.5j |
| Ajouter service GPS en arrière-plan (`flutter_background_service`) dans Pro | 2j |
| Ajouter délai de grâce (30-60s) avant `setOffline` dans disconnection handler | 2h |
| Configurer `server.timeout` et `server.keepAliveTimeout` dans `main.ts` | 0.5h |
| Upgrade Render free → paid (au minimum web service + Redis) | Action externe |
| Ajouter WebSocket au Dashboard (`socket.io-client`) pour courses/chauffeurs | 1j |

### Phase 2 — P1 (2-3 semaines)

| Action | Effort |
|--------|--------|
| Implémenter polling automatique côté Client quand WS déconnecté | 4h |
| Ajouter heartbeat périodique côté Pro (toutes les 60s) | 2h |
| Corriger `declineTrip()` pour gérer les erreurs proprement | 2h |
| Configurer `pingInterval`/`pingTimeout` sur le gateway WebSocket | 1h |
| Rendre le healthcheck parallèle (`Promise.all`) | 1h |
| Ajouter `onModuleDestroy` à `PrismaService` pour graceful shutdown | 1h |
| Ajouter `@nestjs/throttler` pour rate limiting | 2h |
| Configurer CORS REST avec origines autorisées | 1h |
| Corriger `ongoing` → `in_progress` dans Dashboard | 0.5h |
| Ajouter pagination sur Courses (Dashboard) | 4h |
| Ajouter ErrorBoundary (Dashboard) | 2h |
| Ajouter retry exponentiel sur dispatch (délai entre retries) | 2h |
| Nettoyer tokens FCM invalides dans `FcmPushProvider` | 2h |
| Rendre `completeTrip()` atomique (transaction ou endpoint unique) | 4h |
| Configurer connection pooling Prisma | 1h |

### Phase 3 — P2 (2-4 semaines)

| Action | Effort |
|--------|--------|
| Migrer Dashboard vers TailwindCSS ou CSS modules | 3j |
| Ajouter `React.lazy()` pour lazy loading des pages | 4h |
| Ajouter tests Dashboard (Vitest + Testing Library) | 2j |
| Externaliser `VITE_API_URL` par environnement | 1h |
| Ajouter structured logging (Pino ou Winston) + request ID | 1j |
| Ajouter sanitization des entrées (class-transformer) | 4h |
| Ajouter DTO validation pour admin settings | 2h |
| Migrer Pro de `http` vers `dio` | 2j |
| Ajouter gestion offline (file d'attente de requêtes) | 3j |
| Ajouter rayon de dispatch dynamique (expansion progressive) | 4h |
| Configurer Redis sentinel/cluster | 1j |
| Ajouter tests E2E backend (supertest) | 2j |

---

## 7. Verdict

**Le système n'est PAS production-ready.** 8 problèmes P0 bloquent la fiabilité minimale:

1. **Notifications push inexistantes** — les chauffeurs ne peuvent pas recevoir de demandes de course hors WebSocket actif
2. **GPS en arrière-plan absent** — les chauffeurs disparaissent du dispatch quand l'app passe en arrière-plan
3. **Présence trop fragile** — une fluctuation réseau retire immédiatement le chauffeur du pool
4. **Pas de timeout serveur** — le système peut pendre indéfiniment
5. **Render free tier** — cold starts inacceptables pour un service de mobilité
6. **Dashboard aveugle** — pas de temps réel pour l'admin

Les fondations backend (state machine, dispatch, idempotency, PostGIS, Redis locks) sont solides. Les problèmes sont concentrés sur:
- L'intégration push notifications (backend + apps)
- La résilience de la présence/connexion
- L'infrastructure (Render free tier)
- Le temps réel du dashboard

**Recommandation:** Exécuter Phase 1 (P0) avant toute mise en production. Phase 2 (P1) dans le mois qui suit.
