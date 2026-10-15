import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';

export class CreateVehicleTypeDto {
  @ApiProperty({ example: 'Moto' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ServiceType, example: ServiceType.ride })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiProperty({ example: 200 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseFare: number;

  @ApiProperty({ example: 150 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerKm: number;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerMin: number;

  @ApiProperty({ example: 15 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionPercentage: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
