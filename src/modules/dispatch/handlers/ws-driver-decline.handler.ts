import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DispatchService } from '../dispatch.service';
import { DomainEvents } from '../../domain-events/domain-events.constants';
import type { WsDriverDeclineRequestedEvent } from '../../domain-events/events/domain-events';

// Relais WS trip:decline (Sprint 3, cf. events.gateway.ts). Le refus explicite libère
// immédiatement le verrou de dispatch et déclenche un nouveau cycle sans attendre le
// timeout automatique (BullMQ), pour une expérience chauffeur plus réactive.
@Injectable()
export class WsDriverDeclineHandler {
  private readonly logger = new Logger(WsDriverDeclineHandler.name);

  constructor(private readonly dispatchService: DispatchService) {}

  @OnEvent(DomainEvents.WsDriverDeclineRequested)
  async handleWsDriverDeclineRequested(event: WsDriverDeclineRequestedEvent): Promise<void> {
    this.logger.log(`WS trip:decline: driver ${event.driverId} declined trip ${event.tripId}`);
    await this.dispatchService.handleDriverDeclineAndRetry(event.tripId, event.driverId);
  }
}
