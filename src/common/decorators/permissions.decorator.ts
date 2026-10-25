import { SetMetadata } from '@nestjs/common';
import { StaffPermission } from '../permissions';

export const PERMISSIONS_KEY = 'staff_permissions';
export const ANY_STAFF_KEY = 'any_staff';

// Autorise les comptes du dashboard qui ont au moins un des modules listes (ou l'acces total).
export const RequirePermission = (...permissions: StaffPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// Autorise tout compte du dashboard actif, sans exiger de module (ex. : lire son propre profil).
export const AnyStaff = () => SetMetadata(ANY_STAFF_KEY, true);
