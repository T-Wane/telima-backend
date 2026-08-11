import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { OrangeMoneyProvider } from './providers/orange-money.provider';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CommissionsModule } from '../commissions/commissions.module';
import { EventsModule } from '../events/events.module';

// Seul fichier a modifier pour brancher Orange Money en production :
// definir PAYMENT_PROVIDER=orange_money dans .env (+ credentials API).
@Module({
  imports: [ConfigModule, CommissionsModule, EventsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockPaymentProvider,
    OrangeMoneyProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockPaymentProvider,
        orangeMoney: OrangeMoneyProvider,
      ) => {
        const provider = config.get<string>('PAYMENT_PROVIDER', 'mock');
        return provider === 'orange_money' ? orangeMoney : mock;
      },
      inject: [ConfigService, MockPaymentProvider, OrangeMoneyProvider],
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
