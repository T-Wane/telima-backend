import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { RoomsService } from '../services/rooms.service';
import { PresenceService } from '../services/presence.service';

const GRACE_PERIOD_MS = 60_000;

@Injectable()
export class DisconnectionHandler {
  private readonly logger = new Logger(DisconnectionHandler.name);
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
  ) {}

  async handleDisconnect(client: Socket): Promise<void> {
    const user = (client as any).user;
    const driverId = (client as any).driverId;

    this.rooms.leaveAllRooms(client);

    if (driverId) {
      this.scheduleGracePeriod(driverId);
      this.logger.log(`Socket ${client.id} disconnected: driver=${driverId}, grace period ${GRACE_PERIOD_MS / 1000}s`);
    } else if (user) {
      this.logger.log(`Socket ${client.id} disconnected: user=${user.sub}`);
    } else {
      this.logger.log(`Socket ${client.id} disconnected (unauthenticated)`);
    }
  }

  cancelGracePeriod(driverId: string): void {
    const timer = this.graceTimers.get(driverId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(driverId);
      this.logger.debug(`Grace period cancelled for driver ${driverId} (reconnected)`);
    }
  }

  private scheduleGracePeriod(driverId: string): void {
    this.cancelGracePeriod(driverId);
    const timer = setTimeout(async () => {
      this.graceTimers.delete(driverId);
      try {
        await this.presence.setOffline(driverId);
        this.logger.log(`Grace period expired for driver ${driverId}, marked offline`);
      } catch (err) {
        this.logger.error(`Failed to set driver ${driverId} offline after grace period: ${(err as Error).message}`);
      }
    }, GRACE_PERIOD_MS);
    timer.unref();
    this.graceTimers.set(driverId, timer);
  }
}
