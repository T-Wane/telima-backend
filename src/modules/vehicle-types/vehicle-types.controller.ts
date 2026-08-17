import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { VehicleTypesService } from './vehicle-types.service';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto';
import { UpdateVehicleTypeDto } from './dto/update-vehicle-type.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Vehicle Types')
@ApiBearerAuth()
@Controller('vehicle-types')
export class VehicleTypesController {
  constructor(private readonly vehicleTypesService: VehicleTypesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lister les types de vehicules actifs' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.vehicleTypesService.findAll(includeInactive === 'true');
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Recuperer un type de vehicule par ID' })
  findOne(@Param('id') id: string) {
    return this.vehicleTypesService.findOne(id);
  }

  @Roles(UserRole.admin)
  @Post()
  @ApiOperation({ summary: 'Creer un type de vehicule (admin)' })
  @ApiResponse({ status: 201, description: 'Type de vehicule cree' })
  create(@Body() dto: CreateVehicleTypeDto) {
    return this.vehicleTypesService.create(dto);
  }

  @Roles(UserRole.admin)
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un type de vehicule (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateVehicleTypeDto) {
    return this.vehicleTypesService.update(id, dto);
  }

  @Roles(UserRole.admin)
  @Delete(':id')
  @ApiOperation({ summary: 'Desactiver un type de vehicule (admin)' })
  deactivate(@Param('id') id: string) {
    return this.vehicleTypesService.deactivate(id);
  }
}
