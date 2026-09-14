import { Module, forwardRef } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';
import { DispatchRecoveryService } from './dispatch-recovery.service';
import { TripCreatedHandler } from './handlers/trip-created.handler';
import { WsDriverDeclineHandler } from './handlers/ws-driver-decline.handler';
import { GeolocationModule } from '../geolocation/geolocation.module';
import { EventsModule } from '../events/events.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [GeolocationModule, forwardRef(() => EventsModule), forwardRef(() => QueueModule)],
  controllers: [DispatchController],
  providers: [DispatchService, DispatchRecoveryService, TripCreatedHandler, WsDriverDeclineHandler],
  exports: [DispatchService],
})
export class DispatchModule {}
