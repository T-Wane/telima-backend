import { Module } from '@nestjs/common';
import { VehicleTypesService } from './vehicle-types.service';
import { VehicleTypesController } from './vehicle-types.controller';

@Module({
  controllers: [VehicleTypesController],
  providers: [VehicleTypesService],
  exports: [VehicleTypesService],
})
export class VehicleTypesModule {}
