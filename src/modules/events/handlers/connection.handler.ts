import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { RoomsService } from '../services/rooms.service';
import { PresenceService } from '../services/presence.service';
import { DisconnectionHandler } from './disconnection.handler';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ConnectionHandler {
  private readonly logger = new Logger(ConnectionHandler.name);

  constructor(
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
    private readonly disconnectionHandler: DisconnectionHandler,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    // Le guard WsJwtGuard ne s'exécute que sur @SubscribeMessage, pas sur handleConnection.
    // On vérifie donc le token ici directement pour authentifier la connexion.
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn(`Socket ${client.id} rejected: no token`);
      client.disconnect();
      return;
    }

    let user: any;
    try {
      user = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      (client as any).user = user;
    } catch {
      this.logger.warn(`Socket ${client.id} rejected: invalid token`);
      client.disconnect();
      return;
    }

    this.logger.log(`Socket ${client.id} connected: user=${user.sub}, role=${user.role}`);

    this.rooms.joinUserRoom(client, user.sub);

    if (user.role === 'admin') {
      this.rooms.joinAdminRoom(client);
    }

    if (user.role === 'driver') {
      const driver = await this.prisma.driver.findFirst({
        where: { userId: user.sub },
        select: { id: true },
      });
      if (driver) {
        (client as any).driverId = driver.id;
        this.disconnectionHandler.cancelGracePeriod(driver.id);
        this.rooms.joinDriverRoom(client, driver.id);
        await this.presence.setOnline(driver.id);
      }
    }
  }
}
