import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendDriverDto {
  @ApiProperty({ example: 'Documents frauduleux', description: 'Raison de la suspension' })
  @IsString()
  @MinLength(3)
  reason: string;
}
