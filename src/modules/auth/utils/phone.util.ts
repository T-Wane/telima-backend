// Normalise un numero de telephone malien vers le format E.164 (+223XXXXXXXX).
// Accepte soit un numero deja au format E.164, soit un numero local a 8 chiffres
// (l'ecran OTP de telima concatene lui-meme "+223 " devant le numero saisi).
const MALI_COUNTRY_CODE = '+223';

export function normalizePhone(rawPhone: string): string {
  const digitsOnly = rawPhone.replace(/[^\d+]/g, '');

  if (digitsOnly.startsWith('+223')) {
    return digitsOnly;
  }
  if (digitsOnly.startsWith('223')) {
    return `+${digitsOnly}`;
  }
  return `${MALI_COUNTRY_CODE}${digitsOnly}`;
}

export function isValidMaliPhone(rawPhone: string): boolean {
  const normalized = normalizePhone(rawPhone);
  return /^\+223\d{8}$/.test(normalized);
}
