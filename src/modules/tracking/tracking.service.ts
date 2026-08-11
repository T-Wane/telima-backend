import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeolocationService } from '../geolocation/geolocation.service';
import { BroadcastService } from '../events/services/broadcast.service';
import { PresenceService } from '../events/services/presence.service';
import { WsEvents } from '../events/events.constants';
import { UpdatePositionDto } from './dto/update-position.dto';

// Module Tracking (Sprint 3) : fallback REST de WS driver:position pour la remontee
// GPS chauffeur. Persiste la position en PostGIS (indispensable au dispatch) et
// rediffuse au client dans la room du trip si une course est en cours.
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geolocation: GeolocationService,
    private readonly broadcast: BroadcastService,
    private readonly presence: PresenceService,
  ) {}

  async updatePosition(userId: string, dto: UpdatePositionDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Profil chauffeur introuvable');
    }

    await this.presence.heartbeat(driver.id);
    await this.geolocation.updateDriverLocation(driver.id, dto.lat, dto.lng);

    if (dto.tripId) {
      this.broadcast.emitToTrip(dto.tripId, WsEvents.DriverLocationUpdate, {
        driverId: driver.id,
        lat: dto.lat,
        lng: dto.lng,
        heading: dto.heading,
        speed: dto.speed,
      });
    }

    return { acknowledged: true };
  }
}
