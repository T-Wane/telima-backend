import { Module } from '@nestjs/common';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminUsersTripsController } from './admin-users-trips.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PricingModule],
  controllers: [
    AdminPricingController,
    AdminStatsController,
    AdminUsersTripsController,
    AdminSettingsController,
  ],
})
export class AdminModule {}
