import { Module } from '@nestjs/common';
import { CommissionsService } from './commissions.service';

@Module({
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
