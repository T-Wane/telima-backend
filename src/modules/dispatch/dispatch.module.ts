import { Module, forwardRef } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { TripCreatedHandler } from './handlers/trip-created.handler';
import { WsDriverDeclineHandler } from './handlers/ws-driver-decline.handler';
import { GeolocationModule } from '../geolocation/geolocation.module';
import { EventsModule } from '../events/events.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [GeolocationModule, EventsModule, forwardRef(() => QueueModule)],
  providers: [DispatchService, TripCreatedHandler, WsDriverDeclineHandler],
  exports: [DispatchService],
})
export class DispatchModule {}
