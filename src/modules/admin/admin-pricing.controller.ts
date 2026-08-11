import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DynamicPricingService } from '../pricing/dynamic-pricing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { CreatePricingRuleDto, UpdatePricingRuleDto } from './dto/pricing-rule.dto';

// CRUD admin des zones de service et regles de tarification dynamique (Sprint 5).
// Les mutations invalident le cache du DynamicPricingService pour prise en compte immediate.
@ApiTags('Admin — Zones & Pricing')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('admin')
export class AdminPricingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dynamicPricing: DynamicPricingService,
  ) {}

  // ---- Zones ----

  @Get('zones')
  @ApiOperation({ summary: 'Lister les zones de service' })
  listZones() {
    return this.prisma.serviceZone.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @Post('zones')
  @ApiOperation({ summary: 'Créer une zone de service' })
  @ApiResponse({ status: 201, description: 'Zone créée' })
  async createZone(@Body() dto: CreateZoneDto) {
    const zone = await this.prisma.serviceZone.create({ data: dto });
    this.dynamicPricing.invalidateCache();
    return zone;
  }

  @Patch('zones/:id')
  @ApiOperation({ summary: 'Modifier une zone de service' })
  async updateZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto) {
    const zone = await this.prisma.serviceZone.update({ where: { id }, data: dto });
    this.dynamicPricing.invalidateCache();
    return zone;
  }

  @Delete('zones/:id')
  @ApiOperation({ summary: 'Supprimer une zone de service' })
  async deleteZone(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.serviceZone.delete({ where: { id } });
    this.dynamicPricing.invalidateCache();
    return { deleted: true };
  }

  // ---- Regles de tarification ----

  @Get('pricing-rules')
  @ApiOperation({ summary: 'Lister les règles de tarification' })
  listPricingRules() {
    return this.prisma.pricingRule.findMany({
      orderBy: { priority: 'asc' },
      include: { zone: { select: { id: true, name: true } } },
    });
  }

  @Post('pricing-rules')
  @ApiOperation({ summary: 'Créer une règle de tarification' })
  @ApiResponse({ status: 201, description: 'Règle créée' })
  async createPricingRule(@Body() dto: CreatePricingRuleDto) {
    const rule = await this.prisma.pricingRule.create({
      data: {
        name: dto.name,
        serviceType: dto.serviceType,
        vehicleTypeId: dto.vehicleTypeId,
        zoneId: dto.zoneId,
        condition: dto.condition as Prisma.InputJsonValue,
        modifier: dto.modifier,
        priority: dto.priority,
        isActive: dto.isActive,
      },
    });
    this.dynamicPricing.invalidateCache();
    return rule;
  }

  @Patch('pricing-rules/:id')
  @ApiOperation({ summary: 'Modifier une règle de tarification' })
  async updatePricingRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricingRuleDto,
  ) {
    const rule = await this.prisma.pricingRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.serviceType !== undefined && { serviceType: dto.serviceType }),
        ...(dto.vehicleTypeId !== undefined && { vehicleTypeId: dto.vehicleTypeId }),
        ...(dto.zoneId !== undefined && { zoneId: dto.zoneId }),
        ...(dto.condition !== undefined && { condition: dto.condition as Prisma.InputJsonValue }),
        ...(dto.modifier !== undefined && { modifier: dto.modifier }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    this.dynamicPricing.invalidateCache();
    return rule;
  }

  @Delete('pricing-rules/:id')
  @ApiOperation({ summary: 'Supprimer une règle de tarification' })
  async deletePricingRule(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.pricingRule.delete({ where: { id } });
    this.dynamicPricing.invalidateCache();
    return { deleted: true };
  }
}
