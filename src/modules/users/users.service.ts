import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriverStatus, TripStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  TripStatus.pending,
  TripStatus.accepted,
  TripStatus.driver_arriving,
  TripStatus.in_progress,
];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  // Suppression de compte a la demande de l'utilisateur (exigee par Google Play et
  // l'App Store). On anonymise plutot que de supprimer les lignes : les courses et
  // paiements sont conserves jusqu'a 3 ans pour les obligations legales (cf. page
  // /legal/account-deletion), mais toute donnee personnelle est effacee et le
  // numero de telephone est libere (le meme numero pourra se reinscrire).
  async deleteAccount(id: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { driver: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (user.role === UserRole.admin) {
      throw new ForbiddenException(
        'Un compte administrateur ne peut pas etre supprime depuis l\'application',
      );
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        status: { in: ACTIVE_TRIP_STATUSES },
        OR: [{ clientId: id }, ...(user.driver ? [{ driverId: user.driver.id }] : [])],
      },
      select: { id: true },
    });
    if (activeTrip) {
      throw new ConflictException(
        'Une course est en cours : terminez-la ou annulez-la avant de supprimer votre compte.',
      );
    }
    if (user.driver && Number(user.driver.commissionDue) > 0) {
      throw new ConflictException(
        'Vous avez des commissions impayees : regularisez-les avant de supprimer votre compte, ou contactez le support.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
      this.prisma.deviceToken.deleteMany({ where: { userId: id } }),
      this.prisma.otpCode.deleteMany({ where: { phone: user.phone } }),
      this.prisma.chatMessage.updateMany({
        where: { senderId: id },
        data: { content: null, audioUrl: null },
      }),
      ...(user.driver
        ? [
            this.prisma.driver.update({
              where: { id: user.driver.id },
              data: {
                isOnline: false,
                status: DriverStatus.suspended,
                suspendedAt: new Date(),
                suspensionReason: 'Compte supprime par le chauffeur',
                photoUrl: null,
                licenseUrl: null,
                idCardUrl: null,
              },
            }),
          ]
        : []),
      this.prisma.user.update({
        where: { id },
        data: {
          phone: `deleted:${id}`,
          firstName: 'Utilisateur',
          lastName: 'supprime',
          email: null,
          passwordHash: null,
          isActive: false,
        },
      }),
    ]);

    return { success: true };
  }
}
