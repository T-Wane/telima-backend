import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ANY_STAFF_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { isAllowed } from '../permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!requiredRoles.includes(user?.role)) {
      throw new ForbiddenException('Acces refuse : role insuffisant');
    }

    // Seuls les comptes du dashboard (role admin) ont des droits par module.
    if (user.role !== UserRole.admin) {
      return true;
    }

    // Droits relus en base a chaque requete : une desactivation ou un changement de droits
    // s'applique immediatement, sans attendre l'expiration du jeton.
    const staff = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isActive: true, permissions: true },
    });
    if (!staff || !staff.isActive) {
      throw new ForbiddenException('Compte desactive ou introuvable');
    }
    user.permissions = staff.permissions;

    if (this.reflector.getAllAndOverride<boolean>(ANY_STAFF_KEY, targets)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (isAllowed(staff.permissions, required)) {
      return true;
    }

    throw new ForbiddenException('Acces refuse : droits insuffisants');
  }
}
