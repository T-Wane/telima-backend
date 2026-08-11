import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { GeolocationModule } from '../geolocation/geolocation.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [GeolocationModule, EventsModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
