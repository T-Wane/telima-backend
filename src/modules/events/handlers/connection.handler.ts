import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { RoomsService } from '../services/rooms.service';
import { PresenceService } from '../services/presence.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ConnectionHandler {
  private readonly logger = new Logger(ConnectionHandler.name);

  constructor(
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const user = (client as any).user;
    if (!user) {
      this.logger.warn(`Socket ${client.id} rejected: no user payload`);
      client.disconnect();
      return;
    }

    this.logger.log(`Socket ${client.id} connected: user=${user.sub}, role=${user.role}`);

    this.rooms.joinUserRoom(client, user.sub);

    if (user.role === 'driver') {
      const driver = await this.prisma.driver.findFirst({
        where: { userId: user.sub },
        select: { id: true },
      });
      if (driver) {
        (client as any).driverId = driver.id;
        this.rooms.joinDriverRoom(client, driver.id);
        await this.presence.setOnline(driver.id);
      }
    }
  }
}
