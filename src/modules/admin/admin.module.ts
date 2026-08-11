import { Module } from '@nestjs/common';
import { AdminPricingController } from './admin-pricing.controller';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PricingModule],
  controllers: [AdminPricingController],
})
export class AdminModule {}
