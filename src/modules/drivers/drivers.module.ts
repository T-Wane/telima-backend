import { Module } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { StorageModule } from '../storage/storage.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [StorageModule, CommissionsModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
