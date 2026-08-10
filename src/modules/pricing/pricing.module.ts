import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { PricingEngineService } from './pricing-engine.service';
import { BaseFareRule } from './rules/base-fare.rule';
import { DistanceProviderModule } from '../providers/distance/distance-provider.module';

@Module({
  imports: [DistanceProviderModule],
  controllers: [PricingController],
  providers: [PricingService, PricingEngineService, BaseFareRule],
  exports: [PricingService],
})
export class PricingModule {}
