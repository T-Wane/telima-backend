import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import { LocalDiskStorageProvider } from './providers/local-disk-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalDiskStorageProvider,
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (
        config: ConfigService,
        local: LocalDiskStorageProvider,
        s3: S3StorageProvider,
      ) => {
        const provider = config.get<string>('STORAGE_PROVIDER', 'local');
        return provider === 's3' ? s3 : local;
      },
      inject: [ConfigService, LocalDiskStorageProvider, S3StorageProvider],
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
