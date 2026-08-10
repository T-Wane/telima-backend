import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOnlineStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isOnline: boolean;
}
