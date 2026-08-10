import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';

export class UpdateTripStatusDto {
  @ApiProperty({ description: 'Nouveau statut de la course', enum: TripStatus })
  @IsEnum(TripStatus)
  status: TripStatus;

  @ApiPropertyOptional({ description: "Raison de l'annulation (si applicable)" })
  @IsOptional()
  @IsString()
  cancelReason?: string;
}
