import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import { PrismaService } from '../../../prisma/prisma.service';

const PRESENCE_KEY = 'telima:driver:presence';
const PRESENCE_TTL_SECONDS = 120;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  async setOnline(driverId: string): Promise<void> {
    await this.redis.zadd(PRESENCE_KEY, Date.now(), driverId);
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { isOnline: true },
    }).catch((err) => {
      this.logger.warn(`Failed to sync isOnline=true in DB for driver ${driverId}: ${err.message}`);
    });
    this.logger.debug(`Driver ${driverId} marked online (Redis + DB)`);
  }

  async setOffline(driverId: string): Promise<void> {
    await this.redis.zrem(PRESENCE_KEY, driverId);
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { isOnline: false },
    }).catch((err) => {
      this.logger.warn(`Failed to sync isOnline=false in DB for driver ${driverId}: ${err.message}`);
    });
    this.logger.debug(`Driver ${driverId} marked offline (Redis + DB)`);
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
