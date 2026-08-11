import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeclineTripDto {
  @ApiPropertyOptional({ description: 'Raison du refus' })
  @IsOptional()
  @IsString()
  reason?: string;
}
