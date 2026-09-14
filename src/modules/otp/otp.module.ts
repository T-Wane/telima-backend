import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JulakaiOtpService } from './julakai-otp.service';

@Module({
  imports: [ConfigModule],
  providers: [JulakaiOtpService],
  exports: [JulakaiOtpService],
})
export class OtpModule {}
