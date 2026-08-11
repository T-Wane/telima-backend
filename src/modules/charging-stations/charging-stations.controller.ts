import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChargingStationsService } from './charging-stations.service';

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
  @ApiResponse({ status: 200, description: 'Liste des stations actives' })
  findAll(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
  ) {
    return this.service.findAll(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
      radius ? parseFloat(radius) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: "Détails d'une station" })
  @ApiResponse({ status: 200, description: 'Détails de la station' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
}
