import { SetMetadata } from '@nestjs/common';

// Marque une route comme publique (aucun JWT requis). Utilise par JwtAuthGuard (global).
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
