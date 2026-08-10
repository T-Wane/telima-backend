import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaymentReceivedDto {
  @ApiProperty({ description: 'Montant en especes recu par le chauffeur (FCFA)', example: 1500 })
  @IsNumber()
  @Min(0)
  amount: number;
}
