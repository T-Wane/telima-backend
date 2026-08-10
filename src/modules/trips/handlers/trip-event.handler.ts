import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TripsService } from '../trips.service';
import { DomainEvents } from '../../domain-events/domain-events.constants';
import { TripStatus } from '@prisma/client';
import type {
  DispatchFailedEvent,
  DriverAssignedEvent,
  WsDriverAcceptRequestedEvent,
} from '../../domain-events/events/domain-events';

@Injectable()
export class TripEventHandler {
  private readonly logger = new Logger(TripEventHandler.name);

  constructor(private readonly tripsService: TripsService) {}

  @OnEvent(DomainEvents.DispatchFailed)
  async handleDispatchFailed(event: DispatchFailedEvent): Promise<void> {
    this.logger.warn(`Dispatch failed for trip ${event.tripId}: ${event.reason}`);
    await this.tripsService.handleDispatchFailed(event);
  }

  @OnEvent(DomainEvents.DriverAssigned)
  async handleDriverAssigned(event: DriverAssignedEvent): Promise<void> {
    this.logger.log(`Driver assigned to trip ${event.tripId}`);
    await this.tripsService.handleDriverAssigned(event);
  }

  // Relais WS trip:accept (Sprint 3). Réutilise exactement la même logique que
  // PATCH /trips/:id/status { status: "accepted" } (permissions, transition, dispatch lock).
  @OnEvent(DomainEvents.WsDriverAcceptRequested)
  async handleWsDriverAcceptRequested(event: WsDriverAcceptRequestedEvent): Promise<void> {
    try {
      await this.tripsService.updateStatus(event.tripId, event.userId, 'driver', {
        status: TripStatus.accepted,
      });
    } catch (err) {
      this.logger.warn(
        `WS trip:accept failed for trip ${event.tripId}, driver ${event.driverId}: ${(err as Error).message}`,
      );
    }
  }
}
