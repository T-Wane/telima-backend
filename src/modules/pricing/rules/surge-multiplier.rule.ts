import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PricingContext, PricingBreakdown } from '../interfaces/pricing-context.interface';

// Applique le multiplicateur de surge calcule par DynamicPricingService
// (zones actives + regles dynamiques, Sprint 5). Le multiplicateur est injecte
// dans le contexte par PricingService avant l'execution du pipeline ; cette regle
// se contente de l'appliquer au total et de le tracer dans le breakdown.
@Injectable()
export class SurgeMultiplierRule implements PricingRule {
  readonly name = 'SurgeMultiplier';
  // Apres BaseFare (priority 10) pour multiplier le total calcule.
  readonly priority = 20;

  isApplicable(context: PricingContext): boolean {
    return (context.surgeMultiplier ?? 1) !== 1;
  }

  apply(context: PricingContext, currentBreakdown: PricingBreakdown): PricingBreakdown {
    const surge = context.surgeMultiplier ?? 1;
    return {
      ...currentBreakdown,
      surgeMultiplier: surge,
      total: Math.round(currentBreakdown.total * surge),
    };
  }
}
