import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { PricingEngineService } from './pricing-engine.service';
import { DynamicPricingService } from './dynamic-pricing.service';
import { BaseFareRule } from './rules/base-fare.rule';
import { SurgeMultiplierRule } from './rules/surge-multiplier.rule';
import { DistanceProviderModule } from '../providers/distance/distance-provider.module';

@Module({
  imports: [DistanceProviderModule],
  controllers: [PricingController],
  providers: [
    PricingService,
    PricingEngineService,
    DynamicPricingService,
    BaseFareRule,
    SurgeMultiplierRule,
  ],
  exports: [PricingService, DynamicPricingService],
})
export class PricingModule {}
