import { IsNumber, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayCommissionDto {
  @ApiProperty({ description: 'Montant à payer (FCFA)' })
  @IsNumber()
  @Min(100, { message: 'Montant minimum 100 FCFA' })
  amount: number;

  @ApiProperty({ description: 'Numéro Orange Money du chauffeur (format international)' })
  @IsString()
  @MinLength(8)
  phoneNumber: string;
}
