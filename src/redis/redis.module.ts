import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// Service Redis global partageable : evite de creer une nouvelle connexion par
// requete (bug precedent dans HealthController). Reutilise par le healthcheck,
// le Socket.io adapter (Sprint 2) et BullMQ (Sprint 2).
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('RedisModule');
        const host = config.get<string>('REDIS_HOST', 'localhost');
        const port = config.get<number>('REDIS_PORT', 6379);
        const username = config.get<string>('REDIS_USERNAME') || 'default';
        const password = config.get<string>('REDIS_PASSWORD') || undefined;

        const client = new Redis({
          host,
          port,
          username,
          password,
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });

        client.on('connect', () => {
          logger.log(`Redis connected: ${host}:${port}`);
        });

        client.on('error', (err) => {
          logger.error(`Redis connection error: ${err.message}`);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
