import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { GeolocationService } from '../geolocation/geolocation.service';
import { RoomsService } from './services/rooms.service';
import { PresenceService } from './services/presence.service';
import { BroadcastService } from './services/broadcast.service';
import { ConnectionHandler } from './handlers/connection.handler';
import { DisconnectionHandler } from './handlers/disconnection.handler';
import { WsEvents } from './events.constants';
import { DomainEvents } from '../domain-events/domain-events.constants';
import { ChatService } from '../chat/chat.service';
import { TripsService } from '../trips/trips.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SenderRole } from '@prisma/client';

// Pas d'option namespace : le gateway sert le namespace racine, ce qui garantit que
// afterInit recoit bien le Server socket.io (et non un Namespace, qui n'a pas de
// methode adapter()). Les fronts se connectent deja sur la racine.
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
@UseGuards(WsJwtGuard)
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly config: ConfigService,
    private readonly geolocation: GeolocationService,
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
    private readonly broadcast: BroadcastService,
    private readonly connectionHandler: ConnectionHandler,
    private readonly disconnectionHandler: DisconnectionHandler,
    private readonly eventEmitter: EventEmitter2,
    private readonly chatService: ChatService,
    private readonly tripsService: TripsService,
    private readonly prisma: PrismaService,
  ) {}

  async afterInit(server: Server) {
    // @socket.io/redis-adapter v8 exige des clients node-redis (package `redis`),
    // incompatibles avec ioredis (API subscribe differente). On cree donc un couple
    // pub/sub dedie, separe du client ioredis partage (BullMQ, presence, locks).
    const redisOptions = {
      socket: {
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
      },
      username: this.config.get<string>('REDIS_USERNAME') || 'default',
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
    };
    const pubClient = createClient(redisOptions);
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    server.adapter(createAdapter(pubClient, subClient));
    this.broadcast.setServer(server);
    this.logger.log('WebSocket Gateway initialized with Redis adapter');
  }

  async handleConnection(client: Socket) {
    await this.connectionHandler.handleConnection(client);
  }

  async handleDisconnect(client: Socket) {
    await this.disconnectionHandler.handleDisconnect(client);
  }

  @SubscribeMessage(WsEvents.DriverJoinRoom)
  async handleDriverJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    this.rooms.joinDriverRoom(client, data.driverId);
    await this.presence.setOnline(data.driverId);
    return { event: WsEvents.DriverOnline, data: { driverId: data.driverId } };
  }

  @SubscribeMessage(WsEvents.DriverOnline)
  async handleDriverOnline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    this.rooms.joinDriverRoom(client, data.driverId);
    await this.presence.setOnline(data.driverId);
    return { event: WsEvents.DriverOnline, data: { driverId: data.driverId } };
  }

  @SubscribeMessage(WsEvents.DriverOffline)
  async handleDriverOffline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    await this.presence.setOffline(data.driverId);
    return { event: WsEvents.DriverOffline, data: { driverId: data.driverId } };
  }

  @SubscribeMessage(WsEvents.DriverRejoinRoom)
  async handleDriverRejoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    this.disconnectionHandler.cancelGracePeriod(data.driverId);
    this.rooms.joinDriverRoom(client, data.driverId);
    await this.presence.setOnline(data.driverId);
    this.logger.log(`Driver ${data.driverId} rejoined rooms after reconnection`);
    return { event: WsEvents.DriverOnline, data: { driverId: data.driverId } };
  }

  // Le chauffeur émet sa position (driver:position). Le serveur rediffuse au client suivant
  // la course en cours (driver:location_update), dans la room du trip uniquement — jamais
  // à tous les chauffeurs (bug corrigé Sprint 3, cf. API_CONTRACT.md §3 contrat WebSocket).
  @SubscribeMessage(WsEvents.DriverPosition)
  async handleDriverPosition(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { driverId: string; tripId?: string; lat: number; lng: number; heading?: number },
  ) {
    await this.presence.heartbeat(data.driverId);
    // Persistance PostGIS : sans current_location en base, findNearbyDrivers ne
    // retourne jamais ce chauffeur et le dispatch ne peut pas fonctionner.
    await this.geolocation.updateDriverLocation(data.driverId, data.lat, data.lng);
    if (data.tripId) {
      this.broadcast.emitToTrip(data.tripId, WsEvents.DriverLocationUpdate, {
        driverId: data.driverId,
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
      });
    }
    return { acknowledged: true };
  }

  @SubscribeMessage('driver:heartbeat')
  async handleDriverHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    await this.presence.heartbeat(data.driverId);
    return { acknowledged: true };
  }

  @SubscribeMessage('trip:join')
  handleTripJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    this.rooms.joinTripRoom(client, data.tripId);
    return { event: 'trip:joined', data: { tripId: data.tripId } };
  }

  // Relais purs : le Gateway ne connaît aucune règle métier (transitions de statut,
  // permissions, verrous de dispatch). Il se limite à identifier le chauffeur émetteur
  // et à émettre un Domain Event interne, écouté par TripsModule (accept) et DispatchModule
  // (decline). Évite toute dépendance circulaire EventsModule <-> TripsModule/DispatchModule.
  @SubscribeMessage(WsEvents.TripAccept)
  handleTripAccept(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    const user = (client as any).user;
    const driverId = (client as any).driverId;
    if (!driverId || !user) {
      return { acknowledged: false, error: 'Chauffeur non identifié' };
    }
    this.eventEmitter.emit(DomainEvents.WsDriverAcceptRequested, {
      tripId: data.tripId,
      driverId,
      userId: user.sub,
    });
    return { acknowledged: true };
  }

  @SubscribeMessage(WsEvents.TripDecline)
  handleTripDecline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string; reason?: string },
  ) {
    const driverId = (client as any).driverId;
    if (!driverId) {
      return { acknowledged: false, error: 'Chauffeur non identifié' };
    }
    this.eventEmitter.emit(DomainEvents.WsDriverDeclineRequested, {
      tripId: data.tripId,
      driverId,
      reason: data.reason,
    });
    return { acknowledged: true };
  }

  // Confirmation de reception du colis par le client (delivery:client_confirmed).
  // Le client emet { tripId } ; le serveur verifie qu'il est bien le client de la course
  // puis rediffuse dans la room du trip pour que le chauffeur soit notifie.
  @SubscribeMessage(WsEvents.DeliveryClientConfirmed)
  async handleDeliveryClientConfirmed(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string },
  ) {
    const user = (client as any).user;
    if (!user) {
      return { acknowledged: false, error: 'Non authentifié' };
    }
    try {
      await this.tripsService.confirmDelivery(data.tripId, user.sub);
      return { acknowledged: true };
    } catch (err) {
      this.logger.warn(`Delivery confirmation failed for trip ${data.tripId}: ${(err as Error).message}`);
      return { acknowledged: false, error: (err as Error).message };
    }
  }

  // Signalement de probleme de livraison par le client (delivery:issue_reported).
  @SubscribeMessage(WsEvents.DeliveryIssueReported)
  async handleDeliveryIssueReported(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deliveryId: string; reason: string },
  ) {
    const user = (client as any).user;
    if (!user) {
      return { acknowledged: false, error: 'Non authentifié' };
    }
    try {
      await this.tripsService.reportDeliveryIssue(data.deliveryId, user.sub, data.reason);
      return { acknowledged: true };
    } catch (err) {
      this.logger.warn(`Delivery issue report failed for trip ${data.deliveryId}: ${(err as Error).message}`);
      return { acknowledged: false, error: (err as Error).message };
    }
  }

  // Chat (Sprint 3) : persistance + rediffusion dans la room du trip (message:received).
  @SubscribeMessage(WsEvents.MessageSend)
  async handleMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string; content?: string; audioUrl?: string },
  ) {
    const user = (client as any).user;
    if (!user) {
      return { acknowledged: false, error: 'Non authentifié' };
    }
    const senderRole = user.role === 'driver' ? SenderRole.driver : SenderRole.client;
    try {
      await this.chatService.createMessage(
        data.tripId,
        user.sub,
        senderRole,
        data.content,
        data.audioUrl,
      );
      return { acknowledged: true };
    } catch (err) {
      return { acknowledged: false, error: (err as Error).message };
    }
  }
}
