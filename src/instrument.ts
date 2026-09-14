// Doit etre importe en tout premier dans main.ts (avant AppModule et tout le
// reste) : Sentry.init() a besoin de s'executer avant que Nest charge les modules
// pour pouvoir les instrumenter automatiquement (requete HTTP, Prisma, etc.).
//
// Sans SENTRY_DSN configure (defaut en dev/tant que non fourni), le SDK reste
// inactif : aucune donnee n'est envoyee, aucun overhead reseau. Activer en
// production consiste juste a renseigner SENTRY_DSN dans .env, rien d'autre a
// changer dans le code.
import * as dotenv from 'dotenv';
dotenv.config();

import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  profilesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  integrations: [nodeProfilingIntegration()],
});
