// Interface decouplee de toute implementation concrete de stockage de fichiers, sur le
// meme modele que SmsProvider (pattern Interface+Mock reutilise, cf. memoire de decisions).
// Utilisee pour l'upload des documents chauffeur (permis, carte d'identite, carte grise,
// photo de profil) et des fichiers audio du module Chat.
export interface UploadedFileResult {
  url: string;
  key: string;
}

export interface StorageProvider {
  upload(params: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    folder: string;
  }): Promise<UploadedFileResult>;

  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
