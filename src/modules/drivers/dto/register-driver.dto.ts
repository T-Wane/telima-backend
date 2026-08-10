import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class VehicleInputDto {
  @ApiProperty({ description: 'ID du type de vehicule' })
  @IsString()
  vehicleTypeId: string;

  @ApiProperty({ example: 'Yamaha' })
  @IsString()
  brand: string;

  @ApiProperty({ example: 'XTZ 125' })
  @IsString()
  model: string;

  @ApiProperty({ example: 2020 })
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  year: number;

  @ApiProperty({ example: 'AB-123-CD' })
  @IsString()
  plateNumber: string;

  @ApiProperty({ example: 'essence' })
  @IsString()
  energy: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationDocUrl?: string;
}

export class RegisterDriverDto {
  @ApiPropertyOptional({ description: 'URL de la photo de profil (apres upload)' })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiProperty({ description: 'URL du permis (apres upload)' })
  @IsString()
  licenseUrl: string;

  @ApiProperty({ description: "URL de la carte d'identite (apres upload)" })
  @IsString()
  idCardUrl: string;

  @ApiProperty({ type: VehicleInputDto, description: 'Informations du vehicule' })
  @ValidateNested()
  @Type(() => VehicleInputDto)
  vehicle: VehicleInputDto;
}
