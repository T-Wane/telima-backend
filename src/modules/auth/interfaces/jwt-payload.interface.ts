import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  id: string;
  phone: string;
  role: UserRole;
}
