import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MockPaymentProvider } from './mock-payment.provider';
import { OrangeMoneyPaymentProvider } from './orange-money.provider';

// Seul fichier a modifier pour brancher le vrai fournisseur de paiement plus tard.
@Module({
  imports: [ConfigModule],
  providers: [
    MockPaymentProvider,
    OrangeMoneyPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockPaymentProvider,
        orangeMoney: OrangeMoneyPaymentProvider,
      ) => {
        const provider = config.get<string>('PAYMENT_PROVIDER', 'mock');
        return provider === 'orange_money' ? orangeMoney : mock;
      },
      inject: [ConfigService, MockPaymentProvider, OrangeMoneyPaymentProvider],
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentProviderModule {}
