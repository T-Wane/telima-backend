import { PricingContext, PricingBreakdown } from '../interfaces/pricing-context.interface';

export interface PricingRule {
  readonly name: string;
  readonly priority: number;
  isApplicable(context: PricingContext): boolean;
  apply(context: PricingContext, currentBreakdown: PricingBreakdown): PricingBreakdown;
}
