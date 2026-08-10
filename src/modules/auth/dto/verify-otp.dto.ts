import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '+22312345678' })
  @IsString()
  @Matches(/^\+223\d{8}$/, { message: 'Numero invalide (format attendu : +223XXXXXXXX)' })
  phone: string;

  @ApiProperty({ example: '1234', description: 'Code OTP a 4 chiffres' })
  @IsString()
  @Length(4, 4, { message: 'Le code OTP doit contenir exactement 4 chiffres' })
  @Matches(/^\d{4}$/, { message: 'Le code OTP ne doit contenir que des chiffres' })
  code: string;
}
