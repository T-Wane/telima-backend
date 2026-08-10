import { Module, Global } from '@nestjs/common';
import { ServiceConfigService } from './service-config.service';

@Global()
@Module({
  providers: [ServiceConfigService],
  exports: [ServiceConfigService],
})
export class ServiceConfigModule {}
