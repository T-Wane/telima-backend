import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';

export class CreatePricingRuleDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  serviceType?: ServiceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiProperty({
    description:
      'Condition JSON: {"type":"zone","zoneId":"..."} ou {"type":"time_range","from":"18:00","to":"22:00"}',
  })
  @IsObject()
  condition: Record<string, unknown>;

  @ApiProperty({ description: 'Multiplicateur (ex: 1.20 = +20%)' })
  @IsNumber()
  @Min(0.1)
  modifier: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePricingRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  serviceType?: ServiceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  modifier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
