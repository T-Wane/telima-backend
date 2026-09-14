import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({ example: '+22312345678', description: 'Numero de telephone au format E.164' })
  @IsString()
  @Matches(/^\+223\d{8}$/, {
    message: 'Numero invalide (format attendu : +223 suivi de 8 chiffres)',
  })
  phone: string;

  // Quelle appli mobile appelle (client=telima, driver=telimapro) : permet de
  // router vers la bonne cle/app JulakAI quand OTP_PROVIDER=julakai (chaque appli
  // a son propre quota). Optionnel pour compat avec les anciens builds -> 'client'.
  @ApiPropertyOptional({ enum: ['client', 'driver'], default: 'client' })
  @IsOptional()
  @IsIn(['client', 'driver'])
  app?: 'client' | 'driver';
}
