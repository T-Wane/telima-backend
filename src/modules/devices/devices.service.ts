import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

// Enregistrement des tokens d'appareil pour les notifications push (Sprint 3). Un token
// est unique globalement (upsert) : si un autre utilisateur avait le même token (reinstall,
// changement de compte sur le même appareil), il est réattribué au nouvel utilisateur.
@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform },
      update: { userId, platform: dto.platform },
    });
  }

  async unregister(token: string): Promise<{ success: boolean }> {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
    return { success: true };
  }
}
