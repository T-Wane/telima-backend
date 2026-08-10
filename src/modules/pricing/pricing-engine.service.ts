import { Injectable, Logger } from '@nestjs/common';
import { PricingRule } from './rules/pricing-rule.interface';
import { BaseFareRule } from './rules/base-fare.rule';
import {
  PricingContext,
  PricingResult,
  PricingBreakdown,
} from './interfaces/pricing-context.interface';

@Injectable()
export class PricingEngineService {
  private readonly logger = new Logger(PricingEngineService.name);
  private readonly rules: PricingRule[] = [];

  constructor(private readonly baseFareRule: BaseFareRule) {
    this.registerRule(baseFareRule);
  }

  registerRule(rule: PricingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
    this.logger.log(`Registered pricing rule: ${rule.name} (priority: ${rule.priority})`);
  }

  calculate(context: PricingContext): PricingResult {
    const initialBreakdown: PricingBreakdown = {
      baseFare: 0,
      distanceCost: 0,
      durationCost: 0,
      surgeMultiplier: 1,
      total: 0,
    };

    let breakdown = initialBreakdown;
    for (const rule of this.rules) {
      if (rule.isApplicable(context)) {
        breakdown = rule.apply(context, breakdown);
        this.logger.debug(`Applied rule ${rule.name}: total=${breakdown.total}`);
      }
    }

    const commissionAmount = Math.round(breakdown.total * (context.commissionPercentage / 100));

    return {
      estimatedPrice: breakdown.total,
      commissionAmount,
      distanceMeters: context.distanceMeters,
      durationSeconds: context.durationSeconds,
      breakdown,
    };
  }
}
