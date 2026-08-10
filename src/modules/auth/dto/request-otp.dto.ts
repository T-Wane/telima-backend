import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({ example: '+22312345678', description: 'Numero de telephone au format E.164' })
  @IsString()
  @Matches(/^\+223\d{8}$/, {
    message: 'Numero invalide (format attendu : +223 suivi de 8 chiffres)',
  })
  phone: string;
}
