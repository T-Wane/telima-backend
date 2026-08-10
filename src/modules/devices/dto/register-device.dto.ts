import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';

export class RegisterDeviceDto {
  @ApiProperty({ description: "Token de l'appareil (FCM)" })
  @IsString()
  token: string;

  @ApiProperty({ description: "Plateforme de l'appareil", enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}
