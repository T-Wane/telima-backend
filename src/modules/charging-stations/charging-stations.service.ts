import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStationDto, UpdateStationDto } from './dto/station.dto';

@Injectable()
export class ChargingStationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(lat?: number, lng?: number, radiusKm?: number, includeInactive = false) {
    const where = includeInactive ? undefined : { isActive: true };
    if (lat != null && lng != null && radiusKm != null) {
      // Simple bounding box filter for nearby stations
      const latDelta = radiusKm / 111.0;
      const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
      return this.prisma.swapStation.findMany({
        where: {
          ...where,
          lat: { gte: lat - latDelta, lte: lat + latDelta },
          lng: { gte: lng - lngDelta, lte: lng + latDelta },
        },
        orderBy: { createdAt: 'asc' },
      });
    }
    return this.prisma.swapStation.findMany({
      where,
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

  // CRUD admin (Sprint 6 : dashboard).
  async create(dto: CreateStationDto) {
    return this.prisma.swapStation.create({ data: dto });
  }

  async update(id: string, dto: UpdateStationDto) {
    const station = await this.prisma.swapStation.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException('Station introuvable');
    }
    return this.prisma.swapStation.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const station = await this.prisma.swapStation.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException('Station introuvable');
    }
    await this.prisma.swapStation.delete({ where: { id } });
    return { deleted: true };
  }
}
