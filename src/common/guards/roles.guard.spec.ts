import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ANY_STAFF_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

function build(opts: {
  roles?: UserRole[];
  required?: string[];
  anyStaff?: boolean;
  user?: { id: string; role: UserRole };
  staff?: { isActive: boolean; permissions: string[] } | null;
}) {
  const metadata: Record<string, unknown> = {
    [ROLES_KEY]: opts.roles,
    [PERMISSIONS_KEY]: opts.required,
    [ANY_STAFF_KEY]: opts.anyStaff,
  };
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const findUnique = jest.fn().mockResolvedValue(opts.staff ?? null);
  const prisma = { user: { findUnique } } as never;
  const request = { user: opts.user };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector, prisma), context, request, findUnique };
}

const admin = { id: 'u1', role: UserRole.admin };

describe('RolesGuard', () => {
  it('laisse passer une route sans role requis', async () => {
    const { guard, context, findUnique } = build({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuse un client sur une route admin', async () => {
    const { guard, context } = build({ roles: [UserRole.admin], user: { id: 'c', role: UserRole.client } });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("donne tout a un compte a acces total, meme sur une route sans module", async () => {
    const { guard, context } = build({ roles: [UserRole.admin], user: admin, staff: { isActive: true, permissions: ['*'] } });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('laisse un comptable voir les finances', async () => {
    const { guard, context } = build({
      roles: [UserRole.admin], required: ['finances'], user: admin,
      staff: { isActive: true, permissions: ['finances'] },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuse un comptable sur les courses', async () => {
    const { guard, context } = build({
      roles: [UserRole.admin], required: ['courses'], user: admin,
      staff: { isActive: true, permissions: ['finances'] },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reserve une route sans module declare a l acces total', async () => {
    const { guard, context } = build({
      roles: [UserRole.admin], user: admin,
      staff: { isActive: true, permissions: ['finances', 'courses'] },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un compte desactive meme avec un jeton valide', async () => {
    const { guard, context } = build({
      roles: [UserRole.admin], required: ['finances'], user: admin,
      staff: { isActive: false, permissions: ['*'] },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un compte supprime', async () => {
    const { guard, context } = build({ roles: [UserRole.admin], required: ['finances'], user: admin, staff: null });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('autorise tout compte actif sur une route AnyStaff', async () => {
    const { guard, context, request } = build({
      roles: [UserRole.admin], anyStaff: true, user: admin,
      staff: { isActive: true, permissions: ['finances'] },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request.user as { permissions?: string[] }).permissions).toEqual(['finances']);
  });

  it('refuse un compte sans aucun droit', async () => {
    const { guard, context } = build({
      roles: [UserRole.admin], required: ['finances'], user: admin,
      staff: { isActive: true, permissions: [] },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
