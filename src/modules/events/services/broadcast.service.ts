import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { RoomsService } from './rooms.service';

@Injectable()
export class BroadcastService {
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

  broadcastToDrivers(event: string, data: unknown): void {
    this.server?.emit(event, data);
  }
}
