import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { VehicleTypesModule } from './modules/vehicle-types/vehicle-types.module';
import { HealthModule } from './modules/health/health.module';
import { DomainEventsModule } from './modules/domain-events/domain-events.module';
import { GeolocationModule } from './modules/geolocation/geolocation.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { EventsModule } from './modules/events/events.module';
import { QueueModule } from './modules/queue/queue.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { TripsModule } from './modules/trips/trips.module';
import { ServiceConfigModule } from './modules/service-config/service-config.module';
import { ChatModule } from './modules/chat/chat.module';
import { DevicesModule } from './modules/devices/devices.module';
import { PushProviderModule } from './modules/providers/push/push-provider.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChargingStationsModule } from './modules/charging-stations/charging-stations.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AdminModule } from './modules/admin/admin.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
      validate,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL', 'info'),
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          autoLogging: true,
        },
      }),
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 100 },
      { name: 'auth', ttl: 60000, limit: 10 },
    ]),
    PrismaModule,
    RedisModule,
    ServiceConfigModule,
    DomainEventsModule,
    GeolocationModule,
    PricingModule,
    EventsModule,
    QueueModule,
    DispatchModule,
    TripsModule,
    ChatModule,
    DevicesModule,
    PushProviderModule,
    NotificationsModule,
    ChargingStationsModule,
    TrackingModule,
    PaymentsModule,
    AdminModule,
    AuthModule,
    UsersModule,
    DriversModule,
    VehicleTypesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
