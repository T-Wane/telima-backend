import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DriverStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage-provider.interface';
import { RegisterDriverDto } from './dto/register-driver.dto';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  async uploadDocument(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    documentType: string,
  ) {
    const allowedTypes = ['license', 'id_card', 'photo', 'registration_doc'];
    if (!allowedTypes.includes(documentType)) {
      throw new BadRequestException(`Type de document invalide : ${documentType}`);
    }

    return this.storageProvider.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: `drivers/${userId}/${documentType}`,
    });
  }

  async register(userId: string, dto: RegisterDriverDto) {
    const existingDriver = await this.prisma.driver.findUnique({ where: { userId } });
    if (existingDriver) {
      throw new ConflictException('Un profil chauffeur existe deja pour cet utilisateur');
    }

    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: { id: dto.vehicle.vehicleTypeId },
    });
    if (!vehicleType) {
      throw new BadRequestException('Type de vehicule introuvable');
    }

    const [driver] = await this.prisma.$transaction([
      this.prisma.driver.create({
        data: {
          userId,
          photoUrl: dto.photoUrl,
          licenseUrl: dto.licenseUrl,
          idCardUrl: dto.idCardUrl,
          status: DriverStatus.pending_validation,
          vehicle: {
            create: {
              vehicleTypeId: dto.vehicle.vehicleTypeId,
              brand: dto.vehicle.brand,
              model: dto.vehicle.model,
              year: dto.vehicle.year,
              plateNumber: dto.vehicle.plateNumber,
              energy: dto.vehicle.energy,
              registrationDocUrl: dto.vehicle.registrationDocUrl,
            },
          },
        },
        include: { vehicle: true },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { role: UserRole.driver } }),
    ]);

    return driver;
  }

  async findByUserId(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { vehicle: { include: { vehicleType: true } }, user: true },
    });
    if (!driver) {
      throw new NotFoundException('Profil chauffeur introuvable');
    }
    return driver;
  }

  async updateOnlineStatus(userId: string, isOnline: boolean) {
    const driver = await this.findByUserId(userId);
    if (driver.status !== DriverStatus.validated) {
      throw new BadRequestException('Seul un chauffeur valide peut passer en ligne');
    }
    // Blocage commission (Sprint 5) : un chauffeur dont la commission due depasse
    // le seuil ne peut pas passer en ligne tant qu'il n'a pas paye.
    const MAX_COMMISSION_DUE = 50000; // FCFA - seuil de blocage
    if (isOnline && Number(driver.commissionDue) > MAX_COMMISSION_DUE) {
      throw new BadRequestException(
        `Commission impayee trop elevee (${Number(driver.commissionDue)} FCFA). ` +
          `Veuillez payer vos commissions (max autorise : ${MAX_COMMISSION_DUE} FCFA) pour repasser en ligne.`,
      );
    }
    return this.prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline },
    });
  }

  async findById(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: { vehicle: { include: { vehicleType: true } }, user: true },
    });
    if (!driver) {
      throw new NotFoundException('Chauffeur introuvable');
    }
    return driver;
  }

  async validate(id: string) {
    await this.findById(id);
    this.logger.log(`Validation du chauffeur ${id}`);
    return this.prisma.driver.update({
      where: { id },
      data: { status: DriverStatus.validated, validatedAt: new Date() },
    });
  }

  async suspend(id: string, reason: string) {
    await this.findById(id);
    this.logger.warn(`Suspension du chauffeur ${id} : ${reason}`);
    return this.prisma.driver.update({
      where: { id },
      data: {
        status: DriverStatus.suspended,
        suspendedAt: new Date(),
        suspensionReason: reason,
        isOnline: false,
      },
    });
  }

  findAll(status?: DriverStatus) {
    return this.prisma.driver.findMany({
      where: status ? { status } : undefined,
      include: { vehicle: { include: { vehicleType: true } }, user: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
