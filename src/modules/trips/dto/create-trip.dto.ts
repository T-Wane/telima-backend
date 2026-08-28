import { IsString, IsEnum, IsNumber, IsOptional, IsObject, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';

export class GeoPointDto {
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

export class CreateTripDto {
  @ApiProperty({ description: 'Type de service', enum: ServiceType, example: 'ride' })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiProperty({ description: 'ID du type de véhicule' })
  @IsString()
  vehicleTypeId: string;

  @ApiProperty({ description: 'Point de départ' })
  @IsObject()
  pickup: GeoPointDto;

  @ApiProperty({ description: 'Adresse de départ' })
  @IsString()
  pickupAddress: string;

  @ApiProperty({ description: "Point d'arrivée" })
  @IsObject()
  dropoff: GeoPointDto;

  @ApiProperty({ description: "Adresse d'arrivée" })
  @IsString()
  dropoffAddress: string;

  // --- Détails livraison (serviceType = delivery | food) ---
  @ApiPropertyOptional({ description: 'Nom du destinataire (livraison/repas)' })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Téléphone du destinataire (livraison/repas)' })
  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @ApiPropertyOptional({ description: 'Description du colis (livraison/repas)' })
  @IsOptional()
  @IsString()
  parcelDescription?: string;

  @ApiPropertyOptional({ description: 'Poids du colis en kg' })
  @IsOptional()
  @IsNumber()
  parcelWeightKg?: number;

  @ApiPropertyOptional({ description: 'Dimensions du colis (LxWxH cm)' })
  @IsOptional()
  @IsString()
  parcelDimensions?: string;

  @ApiPropertyOptional({ description: 'Colis fragile', default: false })
  @IsOptional()
  @IsBoolean()
  isFragile?: boolean;

  // --- Détails course (serviceType = ride | intercity) ---
  @ApiPropertyOptional({ description: 'Nombre de passagers', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  passengerCount?: number;

  // --- Notes communes ---
  @ApiPropertyOptional({ description: 'Instructions particulières' })
  @IsOptional()
  @IsString()
  notes?: string;
}
