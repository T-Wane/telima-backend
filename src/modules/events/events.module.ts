import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { RoomsService } from './services/rooms.service';
import { PresenceService } from './services/presence.service';
import { BroadcastService } from './services/broadcast.service';
import { ConnectionHandler } from './handlers/connection.handler';
import { DisconnectionHandler } from './handlers/disconnection.handler';
import { ChatModule } from '../chat/chat.module';
import { GeolocationModule } from '../geolocation/geolocation.module';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    forwardRef(() => ChatModule),
    forwardRef(() => TripsModule),
    GeolocationModule,
  ],
  providers: [
    EventsGateway,
    WsJwtGuard,
    RoomsService,
    PresenceService,
    BroadcastService,
    ConnectionHandler,
    DisconnectionHandler,
  ],
  exports: [BroadcastService, PresenceService, RoomsService],
})
export class EventsModule {}
