import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateZoneDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  city: string;

  @ApiProperty({ description: 'Latitude du centre de la zone' })
  @IsNumber()
  centerLat: number;

  @ApiProperty({ description: 'Longitude du centre de la zone' })
  @IsNumber()
  centerLng: number;

  @ApiProperty({ description: 'Rayon de la zone en km' })
  @IsNumber()
  @Min(0.1)
  radiusKm: number;

  @ApiPropertyOptional({ description: 'Multiplicateur de surge (défaut 1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  surgeMultiplier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateZoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  centerLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  centerLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  radiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  surgeMultiplier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
