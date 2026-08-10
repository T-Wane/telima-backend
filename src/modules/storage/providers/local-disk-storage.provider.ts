import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StorageProvider, UploadedFileResult } from '../storage-provider.interface';

// Implementation active tant que les identifiants AWS S3 ne sont pas disponibles.
// Ecrit les fichiers sur disque local (./uploads par defaut) et sert une URL relative.
// A remplacer par S3StorageProvider en production (voir storage.module.ts).
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly logger = new Logger('LocalDiskStorageProvider');
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.basePath = this.config.get<string>('STORAGE_LOCAL_PATH', './uploads');
    this.baseUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
  }

  async upload(params: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    folder: string;
  }): Promise<UploadedFileResult> {
    const folderPath = join(this.basePath, params.folder);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    const extension = params.originalName.split('.').pop() ?? 'bin';
    const key = `${params.folder}/${uuidv4()}.${extension}`;
    const fullPath = join(this.basePath, key);

    writeFileSync(fullPath, params.buffer);
    this.logger.log(`[MOCK STORAGE] Fichier ecrit localement : ${fullPath}`);

    return { url: `${this.baseUrl}/uploads/${key}`, key };
  }

  async getSignedUrl(key: string): Promise<string> {
    // Pas d'expiration en local : le fichier est servi statiquement.
    return `${this.baseUrl}/uploads/${key}`;
  }
}
