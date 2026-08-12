import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin — Settings')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Récupérer les paramètres généraux de la plateforme' })
  async getSettings() {
    let settings = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    if (!settings) {
      settings = await this.prisma.platformSettings.create({
        data: { id: 'default' },
      });
    }
    return settings;
  }

  @Patch()
  @ApiOperation({ summary: 'Mettre à jour les paramètres généraux de la plateforme' })
  async updateSettings(
    @Body()
    body: {
      platformName?: string;
      contactEmail?: string;
      supportPhone?: string;
      currency?: string;
      freeCancellationMin?: number;
      driverSearchRadiusKm?: number;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (body.platformName !== undefined) data.platformName = body.platformName;
    if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail;
    if (body.supportPhone !== undefined) data.supportPhone = body.supportPhone;
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.freeCancellationMin !== undefined) data.freeCancellationMin = body.freeCancellationMin;
    if (body.driverSearchRadiusKm !== undefined)
      data.driverSearchRadiusKm = body.driverSearchRadiusKm;

    // Upsert: create the singleton row if it doesn't exist yet
    return this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    });
  }
}
