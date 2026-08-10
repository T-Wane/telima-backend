import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto';
import { UpdateVehicleTypeDto } from './dto/update-vehicle-type.dto';

@Injectable()
export class VehicleTypesService {
  private readonly logger = new Logger(VehicleTypesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.vehicleType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id } });
    if (!vehicleType) {
      throw new NotFoundException('Type de vehicule introuvable');
    }
    return vehicleType;
  }

  create(dto: CreateVehicleTypeDto) {
    this.logger.log(`Creation type de vehicule : ${dto.name} (${dto.serviceType})`);
    return this.prisma.vehicleType.create({ data: dto });
  }

  async update(id: string, dto: UpdateVehicleTypeDto) {
    await this.findOne(id);
    this.logger.log(`Modification type de vehicule : ${id}`);
    return this.prisma.vehicleType.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    this.logger.log(`Desactivation type de vehicule : ${id}`);
    return this.prisma.vehicleType.update({ where: { id }, data: { isActive: false } });
  }
}
