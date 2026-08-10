# Configuration & Déploiement — Telima Backend

> Document exhaustif pour installer et faire fonctionner le backend de A à Z.
> À maintenir à jour au fur et à mesure du développement.

---

## Table des matières

1. [Prérequis système](#1-prérequis-système)
2. [Variables d'environnement](#2-variables-denvironnement-env)
3. [Services externes](#3-services-externes-à-configurer)
4. [Configuration Docker](#4-configuration-docker)
5. [Commandes d'installation et de migration](#5-commandes-dinstallation-et-de-migration)
6. [Ports utilisés](#6-ports-utilisés)
7. [Domaines, DNS, SSL et reverse proxy](#7-domaines-dns-ssl-et-reverse-proxy)
8. [Permissions IAM et accès](#8-permissions-iam-et-accès-nécessaires)
9. [Tâches cron, workers et files BullMQ](#9-tâches-cron-workers-et-files-bullmq)
10. [Sécurité](#10-sécurité)
11. [Points de blocage potentiels](#11-points-de-blocage-potentiels)
12. [Checklist de déploiement](#12-checklist-de-déploiement)
13. [Historique des versions](#13-historique-des-versions-de-ce-document)

---

## 1. Prérequis système

| Prérequis | Version min | Recommandé | Vérification |
|---|---|---|---|
| Node.js | 20.x | 20.x LTS | `node --version` |
| npm | 10.x | 10.x | `npm --version` |
| Docker | 24.x | 25.x+ | `docker --version` |
| Docker Compose | v2.20+ | v2.25+ | `docker compose version` |
| PostgreSQL | 15 | 15 (avec PostGIS 3.4) | Inclus via Docker |
| Redis | 7.x | 7.x | Inclus via Docker |

---

## 2. Variables d'environnement (.env)

### 2.1 Variables obligatoires

| Variable | Description | Dev | Préprod | Prod |
|---|---|---|---|---|
| `DATABASE_URL` | URL PostgreSQL. Format : `postgresql://user:pass@host:port/db?schema=public` | `postgresql://telima_user:telima_password@localhost:5432/telima_dev?schema=public` | URL DB préprod | URL DB managée (RDS, Supabase) |
| `REDIS_HOST` | Hôte Redis | `localhost` | Hôte Redis préprod | Hôte Redis managé |
| `REDIS_PORT` | Port Redis | `6379` | `6379` | `6379` |
| `JWT_ACCESS_SECRET` | Secret access tokens (min 32 caractères) | Chaîne aléatoire 32+ chars | **Générer une clé unique** | **Générer une clé unique forte** |
| `JWT_REFRESH_SECRET` | Secret refresh tokens (min 32 caractères, différent de JWT_ACCESS_SECRET) | Chaîne aléatoire 32+ chars | **Générer une clé unique** | **Générer une clé unique forte** |
| `JWT_ACCESS_EXPIRES_IN` | Durée de validité access tokens | `15m` | `15m` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Durée de validité refresh tokens | `30d` | `30d` | `30d` |

> **⚠️ CRITIQUE** : `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` doivent être des
> chaînes aléatoires d'au moins 32 caractères, différentes l'une de l'autre.
> En production, stocker dans un gestionnaire de secrets (AWS Secrets Manager,
> Vault, etc.), jamais en clair dans le repo.
>
> **Générer un secret** : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 2.2 Variables optionnelles (avec valeurs par défaut)

| Variable | Défaut | Description | Dev | Préprod | Prod |
|---|---|---|---|---|---|
| `NODE_ENV` | `development` | Environnement d'exécution (`development`, `test`, `production`) | `development` | `production` | `production` |
| `PORT` | `3000` | Port d'écoute | `3000` | `3000` | `3000` (ou 8080 derrière proxy) |
| `APP_URL` | `http://localhost:3000` | URL publique de l'API (pour URLs de fichiers) | `http://localhost:3000` | `https://api.preprod.telima.ml` | `https://api.telima.ml` |
| `CORS_ORIGINS` | vide = tout en dev, rien en prod | Origines CORS autorisées, séparées par virgules | `http://localhost:5173,http://localhost:3001` | `https://preprod.telima.ml,https://dashboard.preprod.telima.ml` | `https://telima.ml,https://dashboard.telima.ml,https://pro.telima.ml` |
| `LOG_LEVEL` | `info` | Niveau de log Pino (`trace`, `debug`, `info`, `warn`, `error`) | `debug` | `info` | `info` (ou `warn`) |
| `SWAGGER_ENABLED` | `false` | Activer Swagger UI sur `/docs` | `true` | `true` | `false` (ou `true` si API interne) |
| `REDIS_PASSWORD` | (vide) | Mot de passe Redis | (vide) | Mot de passe Redis préprod | Mot de passe Redis managé |
| `GOOGLE_MAPS_CACHE_TTL` | `3600` | TTL du cache Redis pour les résultats Google Distance Matrix (secondes) | `3600` | `3600` | `3600` |

### 2.3 Variables OTP

| Variable | Défaut | Description | Dev | Prod |
|---|---|---|---|---|
| `OTP_LENGTH` | `4` | Nombre de chiffres du code OTP (4 = décision actée) | `4` | `4` |
| `OTP_EXPIRES_MINUTES` | `5` | Durée de validité d'un code OTP | `5` | `5` |
| `OTP_MAX_ATTEMPTS` | `3` | Tentatives max avant verrouillage | `3` | `3` |
| `OTP_LOCK_MINUTES` | `30` | Durée de verrouillage après max tentatives | `30` | `30` |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Délai minimum entre deux demandes OTP | `60` | `60` |
| `OTP_EXPOSE_IN_RESPONSE` | `false` | Exposer le code OTP dans la réponse (**dev uniquement, JAMAIS en prod**) | `true` | `false` |

### 2.4 Variables de providers (sélection d'implémentation)

| Variable | Défaut | Valeurs possibles | Description |
|---|---|---|---|
| `SMS_PROVIDER` | `mock` | `mock`, `sendtext` | Fournisseur SMS pour OTP (ADR-012) |
| `STORAGE_PROVIDER` | `local` | `local`, `s3` | Fournisseur de stockage de fichiers |
| `PAYMENT_PROVIDER` | `mock` | `mock`, `orange_money` | Fournisseur de paiement (commissions) |
| `DISTANCE_PROVIDER` | `mock` | `mock`, `google` | Fournisseur de calcul de distance |
| `PUSH_PROVIDER` | `mock` | `mock`, `fcm` | Fournisseur de notifications push |

### 2.5 Variables d'observabilité (Sprint 3+ — roadmap)

| Variable | Défaut | Description | Dev | Prod |
|---|---|---|---|---|
| `SENTRY_DSN` | (vide) | DSN Sentry pour error tracking (vide = désactivé) | (vide) | DSN Sentry prod |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Taux d'échantillonnage Sentry Performance | `0.1` | `0.1` |
| `METRICS_ENABLED` | `false` | Activer l'endpoint Prometheus `/metrics` | `false` | `true` |
| `METRICS_PATH` | `/metrics` | Chemin de l'endpoint Prometheus | `/metrics` | `/metrics` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (vide) | Endpoint du collector OpenTelemetry (vide = désactivé) | (vide) | `http://otel-collector:4318` |
| `OTEL_SERVICE_NAME` | `telima-backend` | Nom du service pour les traces | `telima-backend` | `telima-backend` |
| `OTEL_RESOURCE_ATTRIBUTES` | `environment=dev` | Attributs de ressource OpenTelemetry | `environment=dev` | `environment=prod,version=x.y.z` |

### 2.6 Variables de providers — Configuration spécifique

#### sendtext.sn (SMS) — Configuré (ADR-012)

| Variable | Obligatoire | Description | Dev | Prod |
|---|---|---|---|---|
| `SENDTEXT_API_KEY` | Oui si `SMS_PROVIDER=sendtext` | Clé API (header `snt-api-key`) | Clé du compte | Clé du compte |
| `SENDTEXT_API_SECRET` | Oui si `SMS_PROVIDER=sendtext` | Secret API (header `snt-api-secret`) | Secret du compte | Secret du compte |
| `SENDTEXT_SENDER_NAME` | Non (défaut `Telima`) | Nom d'expéditeur affiché sur le SMS | `Telima` | `Telima` |
| `SENDTEXT_API_URL` | Non (défaut `https://api.sendtext.sn/v1/sms/ml`) | Endpoint d'envoi | — | — |

**Console** : https://sendtext.sn/ (espace développeur, génération du couple key/secret)
**Authentification** : headers `snt-api-key` / `snt-api-secret` (confirmé par sonde live — ni Bearer, ni Basic, ni champ body)
**Format numéro** : `223XXXXXXXX` (indicatif sans `+`, normalisé par le provider depuis le E.164 interne)
**Réponse succès** : `{ statusId: 1, messageId: "..." }` — le `messageId` est persisté sur `otp_codes.sms_message_id` pour traçabilité
**Erreurs** : `{ apiCode, apiMsg }` ; un échec fournisseur supprime l'OTP en attente (pas de pénalité quota) et retourne HTTP 503
**Sécurité** : le code OTP n'est jamais journalisé par ce provider ; rate limit API : 700 requêtes

#### AWS S3 (Storage) — À prévoir (credentials pas encore disponibles)

| Variable | Obligatoire | Description | Dev | Prod |
|---|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | Oui si `STORAGE_PROVIDER=s3` | Clé d'accès AWS IAM | Clé IAM dev | Clé IAM prod (rotation) |
| `AWS_SECRET_ACCESS_KEY` | Oui si `STORAGE_PROVIDER=s3` | Clé secrète AWS IAM | Secret dev | Secret prod (rotation) |
| `AWS_S3_BUCKET` | Oui si `STORAGE_PROVIDER=s3` | Nom du bucket S3 | `telima-dev-uploads` | `telima-prod-uploads` |
| `AWS_S3_REGION` | Oui si `STORAGE_PROVIDER=s3` | Région du bucket | `eu-west-1` | `eu-west-1` |
| `STORAGE_LOCAL_PATH` | Non (défaut: `./uploads`) | Chemin local si `STORAGE_PROVIDER=local` | `./uploads` | — |

**CloudFront (à prévoir pour production)** :
Si CloudFront est utilisé pour servir les fichiers S3 via CDN :

| Variable | Obligatoire | Description |
|---|---|---|
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | Non | ID de la distribution CloudFront (pour invalidation de cache) |
| `CDN_BASE_URL` | Non | URL de base du CDN (ex: `https://cdn.telima.ml`) — remplace `APP_URL` pour les URLs de fichiers |

**Permissions IAM requises** : Voir section 8.1.

#### Orange Money (Payment) — À prévoir Sprint 4

| Variable | Obligatoire | Description | Dev | Prod |
|---|---|---|---|---|
| `OM_API_KEY` | Oui si `PAYMENT_PROVIDER=orange_money` | Clé API Orange Money | Clé sandbox | Clé production |
| `OM_MERCHANT_KEY` | Oui si `PAYMENT_PROVIDER=orange_money` | Clé marchand | Clé sandbox | Clé production |
| `OM_WEBHOOK_SECRET` | Oui si `PAYMENT_PROVIDER=orange_money` | Secret pour vérifier la signature du webhook | Secret sandbox | Secret production |
| `OM_WEBHOOK_URL` | Oui si `PAYMENT_PROVIDER=orange_money` | URL publique du webhook | `https://api.preprod.telima.ml/v1/payments/webhook` | `https://api.telima.ml/v1/payments/webhook` |
| `OM_CURRENCY` | Non (défaut: `XOF`) | Devise (XOF = Franc CFA) | `XOF` | `XOF` |

**Console** : https://developer.orange.com/ (créer une application Orange Money Web Payment)
**Webhook** : Configurer l'URL de callback dans la console Orange Money.
**Idempotence** : Le webhook doit être idempotent (transactionId en clé de déduplication).
**URLs Orange Money** :
- Sandbox : `https://api.sandbox.orange.com/orangemoney/ml/v1/`
- Production : `https://api.orange.com/orangemoney/ml/v1/`

#### Google Maps (Distance) — À prévoir Sprint 2

| Variable | Obligatoire | Description | Dev | Prod |
|---|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Oui si `DISTANCE_PROVIDER=google` | Clé API Google Maps | Clé dev (restriction IP localhost) | Clé prod (restriction IP serveur) |
| `GOOGLE_MAPS_CACHE_TTL` | Non (défaut: `3600`) | TTL du cache Redis pour les résultats (en secondes) | `3600` | `3600` |

**Console** : https://console.cloud.google.com/
**APIs à activer dans Google Cloud** :
- ✅ **Distance Matrix API** — calcul distance/durée entre deux points
- ⬜ **Geocoding API** — conversion adresses → coordonnées (à prévoir si besoin)
- ⬜ **Places API** — autocomplétion d'adresses (à prévoir si besoin)
- ⬜ **Routes API** — itinéraires détaillés (alternative à Distance Matrix, à évaluer)

**Restriction de clé** : Restreindre la clé API par IP (serveur) pour éviter l'usage abusif.
**Quota** : 200$/mois de crédit gratuit. Surveiller l'usage dans la console GCP.

#### Firebase / FCM (Push) — À prévoir Sprint 3

| Variable | Obligatoire | Description | Dev | Prod |
|---|---|---|---|---|
| `FCM_SERVICE_ACCOUNT_PATH` | Oui si `PUSH_PROVIDER=fcm` | Chemin vers le fichier JSON du compte de service Firebase | `/path/to/firebase-dev.json` | `/etc/telima/firebase-admin.json` |
| `FCM_PROJECT_ID` | Oui si `PUSH_PROVIDER=fcm` | ID du projet Firebase | `telima-dev` | `telima-prod` |

**Console** : https://console.firebase.google.com/
**Étapes** :
1. Créer un projet Firebase
2. Paramètres projet → Comptes de service → Générer une nouvelle clé privée → Télécharger JSON
3. Stocker le fichier hors du repo (ex: `/etc/telima/firebase-admin.json` ou secret K8s)
4. Le fichier donne accès complet à FCM — **à protéger comme un secret**

---

## 3. Services externes à configurer

### 3.1 Services requis immédiatement (Sprint 1)

| Service | Statut | Configuration |
|---|---|---|
| **PostgreSQL 15 + PostGIS 3.4** | ✅ Via Docker Compose | Voir section 4 |
| **Redis 7** | ✅ Via Docker Compose | Voir section 4 |

### 3.2 Services à prévoir pour les prochains sprints

| Service | Sprint | Provider | Statut | Action requise |
|---|---|---|---|---|
| **sendtext.sn** (SMS) | Sprint 1 | `SMS_PROVIDER=sendtext` | ✅ Configuré et testé (ADR-012) | — |
| **AWS S3** (Storage) | Sprint 1+ | `STORAGE_PROVIDER=s3` | ⏳ Credentials non disponibles | Créer un bucket, IAM user |
| **AWS CloudFront** (CDN) | Sprint 1+ | `CDN_BASE_URL` | ⬜ Pas encore | Créer une distribution CloudFront devant le bucket S3 |
| **Google Maps Distance Matrix** | Sprint 2 | `DISTANCE_PROVIDER=google` | ⏳ Pas encore | Créer un projet GCP, activer l'API, obtenir une clé |
| **Firebase Cloud Messaging** | Sprint 3 | `PUSH_PROVIDER=fcm` | ⏳ Pas encore | Créer un projet Firebase, télécharger le service account |
| **Orange Money Web Payment** | Sprint 4 | `PAYMENT_PROVIDER=orange_money` | ⏳ Pas encore | Créer un compte développeur Orange, configurer webhook |

---

## 4. Configuration Docker

### 4.1 Docker Compose (développement local)

Le fichier `docker-compose.yml` définit 3 services :

| Service | Image | Port | Healthcheck |
|---|---|---|---|
| `api` | Build local (Dockerfile) | `3000:3000` | `wget http://localhost:3000/v1/health` |
| `postgres` | `postgis/postgis:15-3.4-alpine` | `5432:5432` | `pg_isready -U telima_user` |
| `redis` | `redis:7-alpine` | `6379:6379` | `redis-cli ping` |

**Démarrage** :
```bash
# Démarrer Postgres + Redis uniquement (pour dev local avec nest start)
docker compose up -d postgres redis

# Démarrer tous les services (API incluse)
docker compose up -d
```

**Volumes** :
| Volume | Type | Description |
|---|---|---|
| `pgdata` | Docker volume | Données PostgreSQL (persistant) |
| `redisdata` | Docker volume | Données Redis (persistant, AOF) |
| `./uploads:/app/uploads` | Bind mount | Fichiers uploadés (dev local uniquement) |

**Redis password** : En production, configurer `REDIS_PASSWORD` et ajouter `--requirepass` dans la commande Redis :
```yaml
redis:
  command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
```

### 4.2 Dockerfile

Multi-stage build :
1. **Builder** : `node:20-alpine`, `npm ci`, `prisma generate`, `nest build`
2. **Production** : `node:20-alpine`, `npm ci --omit=dev`, `prisma generate`, copie `dist/`
   - S'exécute en tant qu'utilisateur non-root `telima` (sécurité)
   - Healthcheck intégré sur `/v1/health`

**Entrypoint** : `docker-entrypoint.sh` exécute :
1. `npx prisma migrate deploy` — applique les migrations
2. `npx prisma db seed` — seed si la DB est vide
3. `node dist/main` — démarre l'application

### 4.3 .dockerignore

Exclut du build context : `node_modules`, `dist`, `coverage`, `.env`, `.git`, `uploads`, `test`, `docs`, `*.md`, `.eslintrc.js`, `.prettierrc`.

### 4.4 Configuration production

| Élément | Recommandation |
|---|---|
| **Reverse proxy** | Nginx ou Caddy (TLS termination) |
| **TLS** | Let's Encrypt (Caddy auto) ou AWS ACM + ALB |
| **Domaine API** | `https://api.telima.ml` |
| **Domaine Swagger** | `https://api.telima.ml/docs` (si `SWAGGER_ENABLED=true`) |
| **Webhook Orange Money** | `https://api.telima.ml/v1/payments/webhook` |
| **PostgreSQL** | AWS RDS ou Supabase (PostGIS supporté). Backups quotidiens + PITR. |
| **Redis** | AWS ElastiCache ou Upstash. Persistence AOF. |
| **S3 Bucket** | `telima-prod-uploads` (région eu-west-1) |
| **CloudFront** | Distribution CDN devant le bucket S3 (optionnel mais recommandé) |
| **FCM Service Account** | Fichier JSON monté en volume ou secret K8s |
| **Conteneur** | Utilisateur non-root `telima` (déjà configuré dans Dockerfile) |

### 4.5 Sauvegardes

| Élément | Stratégie | Rétention |
|---|---|---|
| **PostgreSQL** | Snapshot quotidien + Point-in-Time Recovery (PITR) | 7 jours (prod), 3 jours (préprod) |
| **Redis** | Persistence AOF (déjà configurée) | Pas de sauvegarde (cache volatile) |
| **S3** | Versioning S3 + Lifecycle rules (transition Glacier après 90j) | Indéfini (versioning) |
| **Code** | Git (GitHub/GitLab) | Indéfini |

---

## 5. Commandes d'installation et de migration

### 5.1 Première installation

```bash
# 1. Cloner le repo
git clone <repo-url> telima-backend
cd telima-backend

# 2. Installer les dépendances
npm install

# 3. Copier .env.example vers .env et configurer
cp .env.example .env
# Éditer .env avec les valeurs correctes

# 4. Démarrer Postgres + Redis via Docker
docker compose up -d postgres redis

# 5. Générer le client Prisma
npx prisma generate

# 6. Créer et appliquer la migration initiale
npx prisma migrate dev --name init

# 7. Seed la base de données
npx prisma db seed

# 8. Démarrer le serveur en mode dev
npm run start:dev
```

### 5.2 Commandes courantes

```bash
# Build
npm run build

# Lint
npm run lint

# Tests unitaires
npm run test

# Tests e2e
npm run test:e2e

# Prisma
npx prisma generate          # Régénérer le client après changement de schema
npx prisma migrate dev       # Créer + appliquer une migration (dev)
npx prisma migrate deploy    # Appliquer les migrations existantes (prod)
npx prisma db seed           # Seed
npx prisma studio            # Interface visuelle de la DB

# Docker
docker compose up -d                    # Tout démarrer
docker compose up -d postgres redis     # DB + cache uniquement
docker compose down                     # Arrêter
docker compose down -v                  # Arrêter + supprimer les volumes (⚠️ data perdue)
docker compose logs -f api              # Voir les logs de l'API en temps réel
docker compose ps                       # Statut des services + healthchecks
```

### 5.3 Migrations futures

```bash
# Après modification de prisma/schema.prisma :
npx prisma migrate dev --name <description_courte>

# En production (CI/CD) :
npx prisma migrate deploy
```

### 5.4 Déploiement

```bash
# Build de l'image Docker
docker compose build

# Déploiement (ex: sur un VPS)
docker compose up -d

# Vérifier que tout est sain
docker compose ps    # Tous les services doivent être "healthy"
curl https://api.telima.ml/v1/health   # Doit retourner {"status":"ok"}
```

---

## 6. Ports utilisés

| Service | Port | Protocol | Description | Exposé publiquement ? |
|---|---|---|---|---|
| API (NestJS) | `3000` | HTTP | REST API + Swagger UI | Non (via reverse proxy) |
| API (NestJS) | `3000` | WebSocket | Socket.io (même port, upgrade HTTP) | Non (via reverse proxy) |
| PostgreSQL | `5432` | TCP | Base de données | Non (interne uniquement) |
| Redis | `6379` | TCP | Cache + BullMQ + Socket.io adapter | Non (interne uniquement) |
| Nginx/Caddy | `80` | HTTP | Redirection vers 443 | Oui |
| Nginx/Caddy | `443` | HTTPS | TLS termination → forward 3000 | Oui |

> En production, seuls les ports 80 et 443 doivent être exposés publiquement.
> L'API écoute sur 3000 en interne. Le reverse proxy forward vers 3000.

---

## 7. Domaines, DNS, SSL et reverse proxy

### 7.1 Domaines à configurer

| Domaine | Environnement | Type DNS | Cible | Description |
|---|---|---|---|---|
| `api.telima.ml` | Prod | A / CNAME | IP du serveur ou ALB | API de base |
| `api.preprod.telima.ml` | Préprod | A / CNAME | IP du serveur préprod | API préprod |
| `telima.ml` | Prod | A | IP du frontend | App client (Flutter web) |
| `dashboard.telima.ml` | Prod | A / CNAME | IP du frontend | Back-office React |
| `pro.telima.ml` | Prod | A / CNAME | IP du frontend | App chauffeur (Flutter web) |
| `cdn.telima.ml` | Prod | CNAME | CloudFront | CDN pour fichiers S3 (si configuré) |

### 7.2 SSL / TLS

| Environnement | Méthode | Renouvellement |
|---|---|---|
| Dev | Pas de TLS (localhost) | — |
| Préprod | Let's Encrypt (Caddy auto ou certbot) | Automatique (tous les 60j) |
| Prod | Let's Encrypt ou AWS ACM (ALB) | Automatique |

### 7.3 Reverse proxy

#### Option Caddy (recommandé — configuration automatique TLS) :
```caddyfile
api.telima.ml {
    reverse_proxy localhost:3000
}
```

#### Option Nginx :
```nginx
server {
    listen 80;
    server_name api.telima.ml;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.telima.ml;

    ssl_certificate /etc/letsencrypt/live/api.telima.ml/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.telima.ml/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 7.4 URLs et callbacks

| URL | Environnement | Description |
|---|---|---|
| `http://localhost:3000` | Dev | API de base |
| `http://localhost:3000/docs` | Dev | Swagger UI |
| `http://localhost:3000/v1/health` | Dev | Healthcheck |
| `http://localhost:5173` | Dev | Frontend dashboard (Vite) |
| `http://localhost:3001` | Dev | Frontend telima (Flutter web) |
| `https://api.preprod.telima.ml` | Préprod | API de base |
| `https://api.preprod.telima.ml/docs` | Préprod | Swagger UI |
| `https://api.preprod.telima.ml/v1/payments/webhook` | Préprod | Webhook Orange Money (Sprint 4) |
| `https://api.telima.ml` | Prod | API de base |
| `https://api.telima.ml/docs` | Prod | Swagger UI (si activé) |
| `https://api.telima.ml/v1/payments/webhook` | Prod | Webhook Orange Money (Sprint 4) |

---

## 8. Permissions IAM et accès nécessaires

### 8.1 AWS (S3 Storage + CloudFront)

#### IAM Policy pour S3 :
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::telima-prod-uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::telima-prod-uploads"
    }
  ]
}
```

#### IAM Policy pour CloudFront (invalidation de cache) :
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation"],
      "Resource": "arn:aws:cloudfront::*:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

#### Bucket policy (lecture publique pour les fichiers via CDN) :
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::telima-prod-uploads/*",
      "Condition": {
        "StringEquals": {
          "aws:Referer": ["cdn.telima.ml"]
        }
      }
    }
  ]
}
```

### 8.2 Google Cloud (Maps)

- Activer **Distance Matrix API** sur le projet GCP
- Créer une **API key** avec restriction par IP (serveur uniquement)
- APIs à activer : Distance Matrix API (obligatoire), Geocoding API (optionnel), Places API (optionnel)
- Quota : 200$/mois de crédit gratuit, surveiller l'usage

### 8.3 Firebase (FCM)

- Rôle : **Firebase Admin** (envoi de notifications)
- Le fichier JSON du compte de service donne accès complet à FCM — à protéger comme un secret
- Aucune configuration IAM supplémentaire nécessaire

### 8.4 Orange Money

- Créer une application sur https://developer.orange.com/
- Obtenir : `API Key`, `Merchant Key`
- Configurer l'URL de webhook dans la console
- Le webhook doit être accessible en HTTPS publiquement

### 8.5 sendtext.sn

- Console : https://sendtext.sn/ (espace développeur)
- Générer le couple `SENDTEXT_API_KEY` / `SENDTEXT_API_SECRET`
- Vérifier le solde de crédits SMS avant les tests réels (rate limit : 700 requêtes)
- Le sender name `Telima` est passé à chaque envoi via `SENDTEXT_SENDER_NAME`

---

## 9. Tâches cron, workers et files BullMQ

### 9.1 Workers BullMQ (Sprint 2 — implémenté)

| Worker | Queue | Trigger | Description | Sprint |
|---|---|---|---|---|
| Dispatch timeout | `dispatch-timeout` | Job programmé à la notification d'un chauffeur | Si le chauffeur ne répond pas en 15s, passer au suivant ou annuler | Sprint 2 ✅ |
| Trip auto-cancel | `dispatch-timeout` | Après max tentatives (3) | Si aucun chauffeur trouvé, annuler la course (cancelled_auto) | Sprint 2 ✅ |
| Send notification | `notifications` | Domain Event (TripAccepted, etc.) | Envoi push/WS asynchrone | Sprint 3 |
| Push token cleanup | `maintenance` | Cron `0 4 * * 0` (dimanche 4h) | Nettoyer les tokens FCM invalides | Sprint 3 |
| Commission aggregation | `maintenance` | Cron `0 2 * * *` (2h du matin) | Agréger les commissions dues par chauffeur | Sprint 4 |
| Payment reconciliation | `payments-reconciliation` | Cron `0 */6 * * *` (toutes les 6h) | Vérifier le statut des transactions en attente | Sprint 4 |

### 9.2 Configuration BullMQ (Sprint 2 — implémenté)

BullMQ utilise Redis comme backend. La connexion est configurée via `BullModule.forRootAsync`
qui lit `REDIS_HOST`, `REDIS_PORT` et `REDIS_PASSWORD` depuis la configuration.

**Préfixe des queues** : `bull:telima:` (pour éviter les collisions si plusieurs
environnements partagent le même Redis — à éviter en production).

**Configuration du worker dispatch-timeout** :
- `removeOnComplete: true` — les jobs complétés sont supprimés automatiquement
- `removeOnFail: 100` — on garde au max 100 jobs échoués pour debugging
- `delay: 15000` (15s) — le job s'exécute 15s après sa planification
- `attempts: 0` — pas de retry (le timeout est géré manuellement par DispatchService)

### 9.3 Redis (cache, locks et présence)

| Clé | TTL | Description |
|---|---|---|
| `telima:driver:dispatch:{driverId}` | 30s | Lock de dispatch (SETNX) — empêche un chauffeur d'être notifié pour 2 courses simultanées |
| `telima:driver:presence` | 120s (sorted set) | Présence online des chauffeurs (score = timestamp dernier heartbeat) |
| `distance:{origin_hash}:{dest_hash}:{mode}` | 1h | Cache des résultats Google Distance Matrix (Sprint 2, si DISTANCE_PROVIDER=google) |
| `otp:cooldown:{phone}` | 60s | Cooldown de resend OTP (alternative à la requête DB) |

**Nettoyage automatique** :
- Locks de dispatch : TTL 30s, libérés manuellement à l'accept/decline/timeout
- Présence : `zremrangebyscore` nettoie les entrées > 120s à chaque appel `getOnlineDriverIds()`

---

## 10. Sécurité

### 10.1 JWT

| Aspect | Configuration |
|---|---|
| **Access token** | Signé avec `JWT_ACCESS_SECRET`, expire en `15m` |
| **Refresh token** | Signé avec `JWT_REFRESH_SECRET`, expire en `30d` |
| **Stockage refresh token** | Hashé en DB (SHA-256), jamais en clair |
| **Rotation** | À chaque utilisation du refresh token, l'ancien est révoqué et un nouveau est émis |
| **Révocation** | Au logout, le refresh token est marqué `revokedAt` en DB |
| **Transport** | Dans le body JSON (pas de cookie HttpOnly — décision actée §3) |

### 10.2 CORS

| Environnement | Configuration |
|---|---|
| Dev | `CORS_ORIGINS=http://localhost:5173,http://localhost:3001` (ou vide = tout autoriser) |
| Préprod | `CORS_ORIGINS` avec les domaines exacts des fronts préprod |
| Prod | `CORS_ORIGINS` obligatoire — si vide, **toutes les origines sont rejetées** |

### 10.3 Rate limiting (Throttler)

| Throttler | TTL | Limite | Endpoints |
|---|---|---|---|
| `default` | 60s | 100 req | Toutes les routes (sauf override) |
| `auth` | 60s | 10 req | Routes d'auth (override ci-dessous) |
| `request-otp` | 60s | 5 req | `POST /v1/auth/request-otp` |
| `verify-otp` | 60s | 10 req | `POST /v1/auth/verify-otp` |
| `refresh` | 60s | 20 req | `POST /v1/auth/refresh` |

### 10.4 Helmet (HTTP headers)

Configuré dans `main.ts` via `app.use(helmet())`. Ajoute automatiquement :
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `X-DNS-Prefetch-Control: off`

### 10.5 Upload de fichiers

| Aspect | Configuration |
|---|---|
| **Taille max** | 10 MB |
| **Types autorisés** | JPEG, PNG, WebP, PDF |
| **Filtre** | Vérification du MIME type (pas seulement l'extension) |
| **Stockage** | Local (dev) ou S3 (prod) via `StorageProvider` |

### 10.6 Docker

| Aspect | Configuration |
|---|---|
| **Utilisateur** | Non-root (`telima`) dans le conteneur de production |
| **.env** | Exclu du build context via `.dockerignore` |
| **Secrets** | Passés via variables d'environnement, jamais dans l'image |

---

## 11. Points de blocage potentiels

| Problème | Symptôme | Solution |
|---|---|---|
| PostGIS non installé | `prisma migrate dev` échoue sur `CREATE EXTENSION postgis` | Utiliser l'image Docker `postgis/postgis:15-3.4-alpine` (déjà configurée) |
| Prisma client non généré | Erreurs TypeScript sur les types Prisma | `npx prisma generate` |
| `.env` manquant | `Configuration invalide (.env)` au démarrage | `cp .env.example .env` puis configurer |
| JWT secrets < 32 chars | `JWT_ACCESS_SECRET doit faire au moins 32 caracteres` | Générer des secrets plus longs |
| Redis non accessible | `ECONNREFUSED 127.0.0.1:6379` | `docker compose up -d redis` |
| Postgres non accessible | `ECONNREFUSED 127.0.0.1:5432` | `docker compose up -d postgres` |
| Migration drift | `Drift detected: Your database schema is not in sync` | `npx prisma migrate reset` (⚠️ data perdue) ou `npx prisma migrate deploy` |
| CORS bloqué en prod | `Cross-Origin Request Blocked` | Configurer `CORS_ORIGINS` avec les domaines exacts |
| Port 3000 déjà utilisé | `EADDRINUSE :::3000` | Changer `PORT` dans `.env` ou arrêter le processus |
| Provider SMS échoue en prod | `sendtext.sn : HTTP 401` / `erreur reseau` / `timeout` | Vérifier `SENDTEXT_API_KEY`/`SENDTEXT_API_SECRET`, le solde de crédits et la joignabilité de `api.sendtext.sn`. L'utilisateur reçoit HTTP 503 et peut retenter immédiatement (OTP supprimé, pas de pénalité) |
| Upload échoue en prod avec S3 | `S3StorageProvider n'est pas encore implemente` | Garder `STORAGE_PROVIDER=local` jusqu'à implémentation |
| Socket.io ne scale pas | Events perdus entre instances | Vérifier que le Redis adapter est configuré (Sprint 2) |
| Redis password non configuré | Connexion Redis refusée en prod | Configurer `REDIS_PASSWORD` et `--requirepass` dans docker-compose |
| Webhook Orange Money non reçu | Pas d'événement de paiement | Vérifier que l'URL est en HTTPS et accessible publiquement |
| FCM token invalide | Notification non reçue | Le worker `push-cleanup` nettoie les tokens invalides (Sprint 3) |

---

## 12. Checklist de déploiement

### 12.1 Préprod

- [ ] `.env` configuré avec les secrets préprod
- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` : 32+ caractères, différents
- [ ] `CORS_ORIGINS` : domaines exacts des fronts préprod
- [ ] `SWAGGER_ENABLED=true` (utile en préprod pour tester)
- [ ] `OTP_EXPOSE_IN_RESPONSE=false`
- [ ] `LOG_LEVEL=info`
- [ ] `DATABASE_URL` pointe vers la DB préprod
- [ ] `REDIS_HOST` pointe vers le Redis préprod
- [ ] Reverse proxy configuré avec TLS (Let's Encrypt)
- [ ] `docker compose up -d` démarre tous les services sans erreur
- [ ] `https://api.preprod.telima.ml/v1/health` retourne `200` avec `status: "ok"`
- [ ] Migrations appliquées : `npx prisma migrate deploy`
- [ ] Seed exécuté : `npx prisma db seed`
- [ ] Healthchecks Docker OK : `docker compose ps` (tous "healthy")

### 12.2 Production

- [ ] `.env` configuré avec les secrets prod (gestionnaire de secrets)
- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` : 32+ caractères aléatoires, différents
- [ ] `CORS_ORIGINS` : domaines exacts des 3 fronts (telima, telima-pro, telimaDashboard)
- [ ] `SWAGGER_ENABLED=false` (ou `true` si l'API doit être documentée publiquement)
- [ ] `OTP_EXPOSE_IN_RESPONSE=false` (ne jamais exposer en prod)
- [ ] `LOG_LEVEL=info` (ou `warn` pour réduire le volume)
- [ ] `SMS_PROVIDER=sendtext` + `SENDTEXT_API_KEY`/`SENDTEXT_API_SECRET` configurés (jamais `mock` en prod)
- [ ] `STORAGE_PROVIDER=s3` + credentials AWS configurés
- [ ] `PAYMENT_PROVIDER=orange_money` + credentials configurés (Sprint 4)
- [ ] `DISTANCE_PROVIDER=google` + clé API configurée (Sprint 2)
- [ ] `PUSH_PROVIDER=fcm` + compte de service Firebase configuré (Sprint 3)
- [ ] `DATABASE_URL` pointe vers une DB managée (RDS, Supabase, etc.)
- [ ] `REDIS_HOST` pointe vers un Redis managé (ElastiCache, Upstash, etc.)
- [ ] `REDIS_PASSWORD` configuré
- [ ] Reverse proxy configuré (Nginx/Caddy) avec TLS
- [ ] `docker compose up -d` démarre tous les services sans erreur
- [ ] `https://api.telima.ml/v1/health` retourne `200` avec `status: "ok"`
- [ ] Migrations appliquées : `npx prisma migrate deploy`
- [ ] Seed exécuté : `npx prisma db seed`
- [ ] Healthchecks Docker OK : `docker compose ps` (tous "healthy")
- [ ] Firewall : seuls les ports 80/443 exposés publiquement
- [ ] Backups PostgreSQL configurés (daily + PITR)
- [ ] S3 bucket versioning activé
- [ ] Monitoring : logs centralisés (CloudWatch, Datadog, ou Loki)
- [ ] Alerting : alerte si healthcheck fail ou erreur rate > seuil
- [ ] DNS : `api.telima.ml` pointe vers le serveur/ALB
- [ ] SSL : certificat valide (Let's Encrypt ou ACM)

---

## 13. Historique des versions de ce document

| Date | Version | Changements |
|---|---|---|
| 2026-07-07 | 1.0 | Création initiale — Sprint 1 complet + préparation Sprint 2 |
| 2026-07-07 | 2.0 | Ajout : préprod, CloudFront, sandbox AT, URLs Orange Money, Nginx/Caddy config, sauvegardes, sécurité détaillée, IAM CloudFront, APIs Google, Redis password, non-root Docker |
| 2026-07-07 | 3.0 | Sprint 2 implémenté : workers BullMQ (dispatch-timeout actif), clés Redis actualisées (préfixe telima:, présence 120s), configuration BullMQ détaillée (forRootAsync, removeOnComplete, removeOnFail) |
| 2026-07-07 | 3.1 | Revue post-Sprint 2 : GOOGLE_MAPS_CACHE_TTL dans variables optionnelles, variables d'observabilité (Sentry, Prometheus, OpenTelemetry), idempotence Idempotency-Key documentée |
