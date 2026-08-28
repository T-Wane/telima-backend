import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DispatchService } from '../dispatch.service';
import { DomainEvents } from '../../domain-events/domain-events.constants';
import type { TripCreatedEvent } from '../../domain-events/events/domain-events';

@Injectable()
export class TripCreatedHandler {
  private readonly logger = new Logger(TripCreatedHandler.name);

  constructor(private readonly dispatchService: DispatchService) {}

  @OnEvent(DomainEvents.TripCreated)
  async handleTripCreated(event: TripCreatedEvent): Promise<void> {
    this.logger.log(`Received TripCreated event for trip ${event.tripId}`);
    await this.dispatchService.attemptDispatch(
      event.tripId,
      { lat: event.pickupLat, lng: event.pickupLng },
      event.serviceType,
      event.vehicleTypeId,
    );
  }
}
