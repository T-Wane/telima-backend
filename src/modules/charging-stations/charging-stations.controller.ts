import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ChargingStationsService } from './charging-stations.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateStationDto, UpdateStationDto } from './dto/station.dto';

@ApiTags('Charging Stations')
@ApiBearerAuth()
@Controller('battery-swap/stations')
export class ChargingStationsController {
  constructor(private readonly service: ChargingStationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les stations de swap/charge' })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  @ApiQuery({ name: 'radius', required: false, type: Number, description: 'Rayon en km' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Inclure les stations inactives (admin)',
  })
  @ApiResponse({ status: 200, description: 'Liste des stations' })
  findAll(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.findAll(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
      radius ? parseFloat(radius) : undefined,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: "Détails d'une station" })
  @ApiResponse({ status: 200, description: 'Détails de la station' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  // CRUD admin (Sprint 6 : dashboard, gestion du parc de stations).
  @Roles(UserRole.admin)
  @Post()
  @ApiOperation({ summary: 'Créer une station (admin)' })
  @ApiResponse({ status: 201, description: 'Station créée' })
  create(@Body() dto: CreateStationDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.admin)
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une station (admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStationDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.admin)
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une station (admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
