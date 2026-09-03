import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { QueueNames } from './queue.constants';
import { DispatchTimeoutProcessor } from './processors/dispatch/dispatch-timeout.processor';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          username: config.get<string>('REDIS_USERNAME') || 'default',
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
        prefix: 'bull:telima:',
      }),
    }),
    BullModule.registerQueue({ name: QueueNames.DispatchTimeout }),
    forwardRef(() => DispatchModule),
  ],
  providers: [QueueService, DispatchTimeoutProcessor],
  exports: [QueueService],
})
export class QueueModule {}
