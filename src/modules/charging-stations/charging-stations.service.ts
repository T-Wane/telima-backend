import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChargingStationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(lat?: number, lng?: number, radiusKm?: number) {
    if (lat != null && lng != null && radiusKm != null) {
      // Simple bounding box filter for nearby stations
      const latDelta = radiusKm / 111.0;
      const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
      return this.prisma.swapStation.findMany({
        where: {
          isActive: true,
          lat: { gte: lat - latDelta, lte: lat + latDelta },
          lng: { gte: lng - lngDelta, lte: lng + lngDelta },
        },
        orderBy: { createdAt: 'asc' },
      });
    }
    return this.prisma.swapStation.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const station = await this.prisma.swapStation.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException('Station introuvable');
    }
    return station;
  }
}
