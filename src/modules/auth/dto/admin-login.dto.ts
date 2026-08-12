import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({ description: 'Email du compte admin' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Mot de passe' })
  @IsString()
  @MinLength(8)
  password: string;
}
