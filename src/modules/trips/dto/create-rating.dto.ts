import { IsInt, IsOptional, IsArray, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRatingDto {
  @ApiProperty({ description: 'Note de 1 à 5', minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    description: 'Tags qualitatifs',
    example: ['Courtois', 'Ponctuel'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
