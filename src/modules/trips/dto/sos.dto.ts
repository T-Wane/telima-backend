import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SosDto {
  @ApiPropertyOptional({ description: 'Latitude au moment de l\'alerte' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude au moment de l\'alerte' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ description: 'Message libre optionnel' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
