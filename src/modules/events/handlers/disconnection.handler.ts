import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { RoomsService } from '../services/rooms.service';
import { PresenceService } from '../services/presence.service';

@Injectable()
export class DisconnectionHandler {
  private readonly logger = new Logger(DisconnectionHandler.name);

  constructor(
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
  ) {}

  async handleDisconnect(client: Socket): Promise<void> {
    const user = (client as any).user;
    const driverId = (client as any).driverId;

    this.rooms.leaveAllRooms(client);

    if (driverId) {
      await this.presence.setOffline(driverId);
      this.logger.log(`Socket ${client.id} disconnected: driver=${driverId}`);
    } else if (user) {
      this.logger.log(`Socket ${client.id} disconnected: user=${user.sub}`);
    } else {
      this.logger.log(`Socket ${client.id} disconnected (unauthenticated)`);
    }
  }
}
