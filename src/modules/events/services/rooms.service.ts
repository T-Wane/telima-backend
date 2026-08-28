import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  joinUserRoom(client: Socket, userId: string): void {
    const room = `user:${userId}`;
    client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
  }

  joinDriverRoom(client: Socket, driverId: string): void {
    const room = `driver:${driverId}`;
    client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
  }

  joinTripRoom(client: Socket, tripId: string): void {
    const room = `trip:${tripId}`;
    client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
  }

  joinAdminRoom(client: Socket): void {
    const room = 'admin:dashboard';
    client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
  }

  leaveAllRooms(client: Socket): void {
    const rooms = Array.from(client.rooms).filter((r) => r !== client.id);
    rooms.forEach((room) => client.leave(room));
    this.logger.debug(`Socket ${client.id} left rooms: ${rooms.join(', ')}`);
  }

  getUserRoom(userId: string): string {
    return `user:${userId}`;
  }

  getDriverRoom(driverId: string): string {
    return `driver:${driverId}`;
  }

  getTripRoom(tripId: string): string {
    return `trip:${tripId}`;
  }

  getAdminRoom(): string {
    return 'admin:dashboard';
  }
}
