import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Observable, from } from 'rxjs';
import { tap } from 'rxjs/operators';
import { REDIS_CLIENT } from '../../redis/redis.module';

export const IDEMPOTENCY_KEY = 'idempotency-key';
export const IDEMPOTENT_METADATA = 'idempotent';

export const Idempotent = () => (target: object, key?: string, descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Reflect.defineMetadata(IDEMPOTENT_METADATA, true, descriptor.value);
    return descriptor;
  }
  Reflect.defineMetadata(IDEMPOTENT_METADATA, true, target);
  return target;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private static readonly KEY_PREFIX = 'telima:idem:';
  private static readonly KEY_TTL = 300;

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isIdempotent) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers[IDEMPOTENCY_KEY] as string | undefined;

    if (!idempotencyKey) {
      return next.handle();
    }

    const redisKey = IdempotencyInterceptor.KEY_PREFIX + idempotencyKey;
    const lockKey = `${redisKey}:lock`;

    const acquired = await this.redis.set(lockKey, '1', 'EX', IdempotencyInterceptor.KEY_TTL, 'NX');

    if (acquired !== 'OK') {
      const cached = await this.redis.get(redisKey);
      if (cached) {
        this.logger.log(`Idempotent cache hit for key: ${idempotencyKey}`);
        return from(Promise.resolve(JSON.parse(cached)));
      }
      throw new ConflictException(
        'Requête en cours avec la même Idempotency-Key. Réessayez dans quelques secondes.',
      );
    }

    return next.handle().pipe(
      tap(async (response) => {
        await this.redis.set(
          redisKey,
          JSON.stringify(response),
          'EX',
          IdempotencyInterceptor.KEY_TTL,
        );
        await this.redis.del(lockKey);
      }),
    );
  }
}
