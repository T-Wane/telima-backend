import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DISTANCE_PROVIDER } from './distance-provider.interface';
import { MockDistanceProvider } from './mock-distance.provider';
import { GoogleDistanceProvider } from './google-distance.provider';

// Seul fichier a modifier pour brancher le vrai fournisseur de distance plus tard.
@Module({
  imports: [ConfigModule],
  providers: [
    MockDistanceProvider,
    GoogleDistanceProvider,
    {
      provide: DISTANCE_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockDistanceProvider,
        google: GoogleDistanceProvider,
      ) => {
        const provider = config.get<string>('DISTANCE_PROVIDER', 'mock');
        return provider === 'google' ? google : mock;
      },
      inject: [ConfigService, MockDistanceProvider, GoogleDistanceProvider],
    },
  ],
  exports: [DISTANCE_PROVIDER],
})
export class DistanceProviderModule {}
