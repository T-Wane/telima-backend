import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module';

const PRESENCE_KEY = 'telima:driver:presence';
const PRESENCE_TTL_SECONDS = 120;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async setOnline(driverId: string): Promise<void> {
    await this.redis.zadd(PRESENCE_KEY, Date.now(), driverId);
    this.logger.debug(`Driver ${driverId} marked online`);
  }

  async setOffline(driverId: string): Promise<void> {
    await this.redis.zrem(PRESENCE_KEY, driverId);
    this.logger.debug(`Driver ${driverId} marked offline`);
  }

  async isOnline(driverId: string): Promise<boolean> {
    const score = await this.redis.zscore(PRESENCE_KEY, driverId);
    if (!score) return false;
    const ageSeconds = (Date.now() - Number(score)) / 1000;
    return ageSeconds < PRESENCE_TTL_SECONDS;
  }

  async getOnlineDriverIds(): Promise<string[]> {
    const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000;
    await this.redis.zremrangebyscore(PRESENCE_KEY, '-inf', cutoff);
    return this.redis.zrange(PRESENCE_KEY, 0, -1);
  }

  async heartbeat(driverId: string): Promise<void> {
    await this.redis.zadd(PRESENCE_KEY, Date.now(), driverId);
  }
}
