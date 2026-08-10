# Telima Backend

Backend NestJS pour la plateforme VTC & Livraison Telima (Mali).

## Stack

- **NestJS 10** + TypeScript
- **Prisma 5** + PostgreSQL avec extension PostGIS
- **Redis** (cache + adapter Socket.io)
- **JWT** (access + refresh avec rotation)
- **OTP 4 chiffres** (mock SMS en dev, Africa's Talking en prod)

## Prerequis

- Node.js 20+
- Docker & Docker Compose

## Installation

```bash
npm install
cp .env.example .env
```

## Demarrage local avec Docker

```bash
docker compose up -d
```

Cela demarre :
- **Postgres + PostGIS** sur le port 5432
- **Redis** sur le port 6379
- **API NestJS** sur le port 3000

## Demarrage en dev (sans Docker pour l'API)

```bash
docker compose up -d postgres redis
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Demarrage en mode watch |
| `npm run build` | Compilation TypeScript |
| `npm run lint` | ESLint avec fix automatique |
| `npm run prisma:generate` | Generation du client Prisma |
| `npm run prisma:migrate` | Migration dev (cree + applique) |
| `npm run prisma:seed` | Seed (vehicle types + admin) |
| `npm run prisma:studio` | Prisma Studio (GUI DB) |
| `npm test` | Tests unitaires (Jest) |

## Structure des modules

```
src/
  app.module.ts          # Module racine
  main.ts                # Bootstrap (CORS, validation, static assets)
  config/
    env.validation.ts    # Validation des variables d'environnement
  prisma/
    prisma.module.ts     # Module global Prisma
    prisma.service.ts    # Service Prisma (connect/disconnect)
  common/
    decorators/          # @Public, @Roles, @CurrentUser
    guards/              # RolesGuard
    filters/             # HttpExceptionFilter (reponse JSON normalisee)
    interceptors/        # ResponseInterceptor ({ success, data })
  modules/
    auth/                # OTP, JWT, guards, strategy
    users/               # Profil utilisateur (GET/PATCH /users/me)
    drivers/             # Registration, upload, validation, suspension
    vehicle-types/       # CRUD types de vehicules (admin)
    sms/                 # Interface + Mock + Africa's Talking (stub)
    storage/             # Interface + LocalDisk + S3 (stub)
    health/              # Healthcheck DB + Redis
```

## Authentification

1. **POST /v1/auth/request-otp** — Envoie un code OTP 4 chiffres (mock en dev)
2. **POST /v1/auth/verify-otp** — Verifie le code, cree l'utilisateur si nouveau, renvoie access + refresh tokens
3. **POST /v1/auth/refresh** — Rotation du refresh token
4. **POST /v1/auth/logout** — Revocation du refresh token

Toutes les routes sont protegees par defaut (JwtAuthGuard global). Utiliser `@Public()` pour les routes publiques.

## Variables d'environnement

Voir `.env.example` pour la liste complete. Les variables critiques :
- `DATABASE_URL` — Connexion Postgres
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — Secrets JWT (min 32 caracteres)
- `SMS_PROVIDER` — `mock` (defaut) ou `africas_talking`
- `STORAGE_PROVIDER` — `local` (defaut) ou `s3`
- `OTP_EXPOSE_IN_RESPONSE` — `true` en dev uniquement (expose le code OTP dans la reponse)
