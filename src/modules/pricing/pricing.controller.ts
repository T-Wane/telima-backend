import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { PriceQuoteDto } from './dto/price-quote.dto';

@ApiTags('Pricing')
@ApiBearerAuth()
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('quote')
  @ApiOperation({ summary: 'Estimer le tarif sans créer la course' })
  @ApiResponse({ status: 200, description: 'Devis estimé (prix, commission, distance, durée)' })
  @ApiResponse({ status: 404, description: 'Type de véhicule introuvable ou inactif' })
  getQuote(@Body() dto: PriceQuoteDto) {
    return this.pricingService.calculatePrice({
      serviceType: dto.serviceType,
      vehicleTypeId: dto.vehicleTypeId,
      pickup: dto.pickup,
      dropoff: dto.dropoff,
      recipientName: dto.recipientName,
      recipientPhone: dto.recipientPhone,
      parcelDescription: dto.parcelDescription,
    });
  }
}
