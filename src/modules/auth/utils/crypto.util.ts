import { createHash, randomInt } from 'crypto';

// Hash deterministe (SHA-256) utilise pour les refresh tokens : permet de retrouver
// l'enregistrement en base par une recherche directe sur le hash (contrairement a bcrypt,
// qui est volontairement non-deterministe et donc inadapte a une recherche par egalite).
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Genere un code OTP numerique de la longueur souhaitee (4 par defaut, cf. decision Sprint1).
export function generateOtpCode(length: number): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(randomInt(min, max + 1));
}
