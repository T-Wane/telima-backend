import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SMS_PROVIDER } from './sms-provider.interface';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { SendtextSmsProvider } from './providers/sendtext-sms.provider';

// Seul fichier a modifier pour brancher un fournisseur SMS : le reste du
// module Auth injecte uniquement le token SMS_PROVIDER (interface SmsProvider).
// Fournisseur reel actif : sendtext.sn (ADR-012). Africa's Talking est abandonne.
@Module({
  imports: [ConfigModule],
  providers: [
    MockSmsProvider,
    SendtextSmsProvider,
    {
      provide: SMS_PROVIDER,
      useFactory: (config: ConfigService, mock: MockSmsProvider, sendtext: SendtextSmsProvider) => {
        const provider = config.get<string>('SMS_PROVIDER', 'mock');
        return provider === 'sendtext' ? sendtext : mock;
      },
      inject: [ConfigService, MockSmsProvider, SendtextSmsProvider],
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
