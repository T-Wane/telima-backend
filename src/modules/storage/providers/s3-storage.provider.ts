import { Injectable, NotImplementedException } from '@nestjs/common';
import { StorageProvider, UploadedFileResult } from '../storage-provider.interface';

// STUB - A IMPLEMENTER UNE FOIS LES IDENTIFIANTS AWS S3 DISPONIBLES.
// Ne pas activer (voir STORAGE_PROVIDER dans .env) tant que AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET ne sont pas renseignes.
//
// Implementation attendue (cf. doc technique §10.1 / §11.1) :
//   - Upload via @aws-sdk/client-s3 PutObjectCommand vers AWS_S3_BUCKET.
//   - URLs signees via @aws-sdk/s3-request-presigner, expiration 1h par defaut.
@Injectable()
export class S3StorageProvider implements StorageProvider {
  async upload(): Promise<UploadedFileResult> {
    throw new NotImplementedException(
      "S3StorageProvider n'est pas encore implemente. " +
        'Renseignez les identifiants AWS puis implementez ce provider avant de le selectionner via STORAGE_PROVIDER=s3.',
    );
  }

  async getSignedUrl(): Promise<string> {
    throw new NotImplementedException("S3StorageProvider n'est pas encore implemente.");
  }
}
