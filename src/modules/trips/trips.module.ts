import { Module, forwardRef } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripRepository } from './trip.repository';
import { TripEventHandler } from './handlers/trip-event.handler';
import { PricingModule } from '../pricing/pricing.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { EventsModule } from '../events/events.module';
import { GeolocationModule } from '../geolocation/geolocation.module';

@Module({
  imports: [PricingModule, DispatchModule, forwardRef(() => EventsModule), GeolocationModule],
  controllers: [TripsController],
  providers: [TripsService, TripRepository, TripEventHandler],
  exports: [TripsService],
})
export class TripsModule {}
