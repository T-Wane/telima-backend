import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PUSH_PROVIDER } from './push-provider.interface';
import { MockPushProvider } from './mock-push.provider';
import { FcmPushProvider } from './fcm-push.provider';

// Seul fichier a modifier pour brancher le vrai fournisseur de push plus tard.
@Module({
  imports: [ConfigModule],
  providers: [
    MockPushProvider,
    FcmPushProvider,
    {
      provide: PUSH_PROVIDER,
      useFactory: (config: ConfigService, mock: MockPushProvider, fcm: FcmPushProvider) => {
        const provider = config.get<string>('PUSH_PROVIDER', 'mock');
        return provider === 'fcm' ? fcm : mock;
      },
      inject: [ConfigService, MockPushProvider, FcmPushProvider],
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushProviderModule {}
