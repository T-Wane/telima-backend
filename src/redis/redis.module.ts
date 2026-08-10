import { Global, Module } from '@nestjs/common';
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
        return new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
