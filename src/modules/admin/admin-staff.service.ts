import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_ACCESS, hasFullAccess } from '../../common/permissions';
import { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto';

// Jamais de passwordHash dans les reponses.
export const STAFF_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  isActive: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      where: { role: UserRole.admin },
      select: STAFF_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async me(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: STAFF_SELECT });
    if (!user) throw new NotFoundException('Compte introuvable');
    return user;
  }

  async create(dto: CreateStaffDto) {
    await this.assertEmailFree(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      return await this.prisma.user.create({
        data: {
          role: UserRole.admin,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email.trim(),
          phone: dto.phone,
          passwordHash,
          permissions: dto.permissions,
          isActive: true,
        },
        select: STAFF_SELECT,
      });
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  async update(actorId: string, id: string, dto: UpdateStaffDto) {
    const target = await this.findStaff(id);

    if (dto.email !== undefined) {
      await this.assertEmailFree(dto.email, id);
    }

    // Garde-fous : on ne peut ni se retirer l'acces total, ni se desactiver soi-meme,
    // ni priver la plateforme de son dernier administrateur actif.
    const losesFullAccess = dto.permissions !== undefined && !hasFullAccess(dto.permissions);
    const deactivates = dto.isActive === false;
    if (hasFullAccess(target.permissions) && target.isActive && (losesFullAccess || deactivates)) {
      if (id === actorId) {
        throw new BadRequestException('Vous ne pouvez pas retirer vos propres droits ni desactiver votre compte');
      }
      await this.assertAnotherFullAdmin(id);
    }

    const data: Prisma.UserUpdateInput = {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.email !== undefined && { email: dto.email.trim() }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.permissions !== undefined && { permissions: dto.permissions }),
    };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    try {
      const updated = await this.prisma.user.update({ where: { id }, data, select: STAFF_SELECT });
      // Un compte desactive ou dont le mot de passe change perd ses sessions ouvertes.
      if (dto.isActive === false || dto.password) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  async remove(actorId: string, id: string) {
    if (id === actorId) {
      throw new BadRequestException('Vous ne pouvez pas supprimer votre propre compte');
    }
    const target = await this.findStaff(id);
    if (hasFullAccess(target.permissions) && target.isActive) {
      await this.assertAnotherFullAdmin(id);
    }
    try {
      await this.prisma.$transaction([
        this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
        this.prisma.deviceToken.deleteMany({ where: { userId: id } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
    } catch {
      throw new ConflictException(
        'Ce compte est lie a des donnees et ne peut pas etre supprime. Desactivez-le a la place.',
      );
    }
    return { deleted: true };
  }

  // Seuls les comptes du dashboard se gerent ici : jamais un client ou un chauffeur.
  private async findStaff(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: UserRole.admin },
      select: { id: true, isActive: true, permissions: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable');
    return user;
  }

  private async assertAnotherFullAdmin(excludedId: string) {
    const others = await this.prisma.user.count({
      where: { role: UserRole.admin, isActive: true, permissions: { has: ALL_ACCESS }, NOT: { id: excludedId } },
    });
    if (others === 0) {
      throw new BadRequestException('Il doit rester au moins un administrateur actif avec acces total');
    }
  }

  // La connexion cherche le compte par email : deux comptes avec le meme email se confondraient.
  private async assertEmailFree(email: string, exceptId?: string) {
    const clash = await this.prisma.user.findFirst({
      where: {
        role: UserRole.admin,
        email: { equals: email.trim(), mode: 'insensitive' },
        ...(exceptId && { NOT: { id: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Un compte utilise deja cette adresse email');
  }

  private rethrowUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Ce numero de telephone est deja utilise');
    }
    throw e;
  }
}
