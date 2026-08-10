import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';

class GeoPointDto {
  @ApiProperty({ description: 'Latitude', example: 12.6392 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ description: 'Longitude', example: -8.0029 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class PriceQuoteDto {
  @ApiProperty({ description: 'Type de service', enum: ServiceType, example: 'ride' })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiProperty({ description: 'ID du type de véhicule' })
  @IsString()
  vehicleTypeId: string;

  @ApiProperty({ description: 'Point de départ' })
  @IsObject()
  pickup: GeoPointDto;

  @ApiProperty({ description: "Point d'arrivée" })
  @IsObject()
  dropoff: GeoPointDto;

  @ApiPropertyOptional({ description: 'Nom du destinataire (livraison)' })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Téléphone du destinataire (livraison)' })
  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @ApiPropertyOptional({ description: 'Description du colis (livraison)' })
  @IsOptional()
  @IsString()
  parcelDescription?: string;
}
