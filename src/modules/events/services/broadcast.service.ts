import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RoomsService } from './rooms.service';

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);
  private server: Server | null = null;

  constructor(private readonly rooms: RoomsService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(this.rooms.getUserRoom(userId)).emit(event, data);
  }

  emitToDriver(driverId: string, event: string, data: unknown): void {
    this.server?.to(this.rooms.getDriverRoom(driverId)).emit(event, data);
  }

  emitToTrip(tripId: string, event: string, data: unknown): void {
    this.server?.to(this.rooms.getTripRoom(tripId)).emit(event, data);
  }

  emitToAdmin(event: string, data: unknown): void {
    this.server?.to(this.rooms.getAdminRoom()).emit(event, data);
  }

  broadcastToDrivers(event: string, data: unknown): void {
    this.logger.warn('broadcastToDrivers called but not implemented (would broadcast to ALL sockets)');
  }
}
