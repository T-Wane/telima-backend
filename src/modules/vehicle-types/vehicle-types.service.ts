import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto';
import { UpdateVehicleTypeDto } from './dto/update-vehicle-type.dto';

@Injectable()
export class VehicleTypesService {
  private readonly logger = new Logger(VehicleTypesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toNumber(v: any) {
    return v == null ? null : Number(v);
  }

  private serialize(vt: any) {
    return {
      ...vt,
      baseFare: this.toNumber(vt.baseFare),
      pricePerKm: this.toNumber(vt.pricePerKm),
      pricePerMin: this.toNumber(vt.pricePerMin),
      commissionPercentage: this.toNumber(vt.commissionPercentage),
    };
  }

  async findAll(includeInactive = false) {
    const list = await this.prisma.vehicleType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return list.map((vt) => this.serialize(vt));
  }

  async findOne(id: string) {
    const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id } });
    if (!vehicleType) {
      throw new NotFoundException('Type de vehicule introuvable');
    }
    return this.serialize(vehicleType);
  }

  async create(dto: CreateVehicleTypeDto) {
    this.logger.log(`Creation type de vehicule : ${dto.name} (${dto.serviceType})`);
    const vt = await this.prisma.vehicleType.create({ data: dto });
    return this.serialize(vt);
  }

  async update(id: string, dto: UpdateVehicleTypeDto) {
    await this.findOne(id);
    this.logger.log(`Modification type de vehicule : ${id}`);
    const vt = await this.prisma.vehicleType.update({ where: { id }, data: dto });
    return this.serialize(vt);
  }

  async deactivate(id: string) {
    await this.findOne(id);
    this.logger.log(`Desactivation type de vehicule : ${id}`);
    return this.prisma.vehicleType.update({ where: { id }, data: { isActive: false } });
  }
}
