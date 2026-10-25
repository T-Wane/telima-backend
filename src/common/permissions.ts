// Droits d'acces du dashboard. '*' = acces total (administrateur). Les autres comptes recoivent
// une liste de modules ; une route sans module declare reste reservee a l'acces total.
export const ALL_ACCESS = '*';

export const STAFF_PERMISSIONS = [
  'dashboard',
  'courses',
  'drivers',
  'clients',
  'finances',
  'stations',
  'settings',
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

// Valeurs acceptees a la creation / modification d'un compte du dashboard.
export const ASSIGNABLE_PERMISSIONS: string[] = [ALL_ACCESS, ...STAFF_PERMISSIONS];

export function hasFullAccess(permissions: string[] | undefined | null): boolean {
  return !!permissions && permissions.includes(ALL_ACCESS);
}

// Vrai si l'acces total est detenu, ou si au moins un des modules requis l'est.
// Sans module requis, seul l'acces total passe.
export function isAllowed(
  permissions: string[] | undefined | null,
  required: readonly string[] | undefined,
): boolean {
  if (hasFullAccess(permissions)) return true;
  if (!permissions || !required || required.length === 0) return false;
  return required.some((r) => permissions.includes(r));
}
