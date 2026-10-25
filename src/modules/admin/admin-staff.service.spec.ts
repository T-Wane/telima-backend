import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminStaffService } from './admin-staff.service';

function build() {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    refreshToken: { deleteMany: jest.fn(), updateMany: jest.fn() },
    deviceToken: { deleteMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { prisma, service: new AdminStaffService(prisma as never) };
}

const full = { id: 'a1', isActive: true, permissions: ['*'] };
const accountant = { id: 'c1', isActive: true, permissions: ['finances'] };

describe('AdminStaffService', () => {
  describe('create', () => {
    const dto = {
      firstName: 'Awa', lastName: 'Diarra', email: 'awa@telima.ml', phone: '+22370000001',
      password: 'motdepasse1', permissions: ['finances'],
    };

    it('cree un compte dashboard avec ses droits et sans renvoyer le mot de passe', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'n1', email: dto.email, permissions: ['finances'] });

      await service.create(dto);

      const arg = prisma.user.create.mock.calls[0][0];
      expect(arg.data.role).toBe('admin');
      expect(arg.data.permissions).toEqual(['finances']);
      expect(arg.data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(arg.data.passwordHash).not.toContain(dto.password);
      expect(arg.select.passwordHash).toBeUndefined();
    });

    it('refuse un email deja utilise', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue({ id: 'x' });
      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it("empeche un administrateur de se retirer l'acces total", async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(full);
      await expect(service.update('a1', 'a1', { permissions: ['finances'] })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('empeche de desactiver le dernier administrateur', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(full);
      prisma.user.count.mockResolvedValue(0);
      await expect(service.update('autre', 'a1', { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('revoque les sessions quand un compte est desactive', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(accountant);
      prisma.user.update.mockResolvedValue({ id: 'c1' });
      await service.update('a1', 'c1', { isActive: false });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('change les droits d un comptable', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(accountant);
      prisma.user.update.mockResolvedValue({ id: 'c1' });
      await service.update('a1', 'c1', { permissions: ['finances', 'courses'] });
      expect(prisma.user.update.mock.calls[0][0].data.permissions).toEqual(['finances', 'courses']);
    });
  });

  describe('remove', () => {
    it('refuse la suppression de son propre compte', async () => {
      const { service } = build();
      await expect(service.remove('a1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse de supprimer le dernier administrateur actif', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(full);
      prisma.user.count.mockResolvedValue(0);
      await expect(service.remove('autre', 'a1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('supprime un comptable et ses sessions', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(accountant);
      await expect(service.remove('a1', 'c1')).resolves.toEqual({ deleted: true });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('ne supprime jamais un client ou un chauffeur', async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.remove('a1', 'client-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("propose de desactiver quand le compte est lie a des donnees", async () => {
      const { prisma, service } = build();
      prisma.user.findFirst.mockResolvedValue(accountant);
      prisma.$transaction.mockRejectedValue(new Error('FK'));
      await expect(service.remove('a1', 'c1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
