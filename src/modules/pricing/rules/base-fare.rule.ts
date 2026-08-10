import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PricingContext, PricingBreakdown } from '../interfaces/pricing-context.interface';

@Injectable()
export class BaseFareRule implements PricingRule {
  readonly name = 'BaseFare';
  readonly priority = 10;

  isApplicable(): boolean {
    return true;
  }

  apply(context: PricingContext, currentBreakdown: PricingBreakdown): PricingBreakdown {
    const distanceKm = context.distanceMeters / 1000;
    const durationMin = context.durationSeconds / 60;

    const distanceCost = distanceKm * Number(context.pricePerKm);
    const durationCost = durationMin * Number(context.pricePerMin);
    const total = Number(context.baseFare) + distanceCost + durationCost;

    return {
      baseFare: Number(context.baseFare),
      distanceCost,
      durationCost,
      surgeMultiplier: currentBreakdown.surgeMultiplier,
      total: Math.round(total),
    };
  }
}
