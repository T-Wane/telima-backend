import { Module } from '@nestjs/common';
import { LegalPagesController } from './legal-pages.controller';

@Module({
  controllers: [LegalPagesController],
})
export class LegalModule {}
