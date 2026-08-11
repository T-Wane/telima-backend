import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEvents } from '../domain-events/domain-events.constants';
import { TripCompletedEvent } from '../domain-events/events/domain-events';

// Service de calcul et suivi des commissions plateforme (Sprint 5).
// A la completion d'une course (event trip.completed), la commission est calculee
// (finalPrice x commissionPercentage du VehicleType), stockee sur le trip, et
// cumulee dans driver.commissionDue. Le paiement par le chauffeur (module Payments)
// decremente commissionDue via markCommissionPaid.
@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(DomainEvents.TripCompleted)
  async handleTripCompleted(event: TripCompletedEvent): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: event.tripId },
      include: { vehicleType: true },
    });
    if (!trip || !trip.driverId || trip.finalPrice == null) {
      this.logger.warn(`TripCompleted ${event.tripId}: donnees incompletes, commission ignoree`);
      return;
    }

    const finalPrice = Number(trip.finalPrice);
    const percentage = Number(trip.vehicleType.commissionPercentage);
    const commissionAmount = Math.round(finalPrice * (percentage / 100));

    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: { commissionAmount },
      }),
      this.prisma.driver.update({
        where: { id: trip.driverId },
        data: {
          commissionDue: { increment: commissionAmount },
          // Le chauffeur encaisse le cash total ; son solde "gagne" est le prix
          // moins la commission due a la plateforme.
          balance: { increment: finalPrice - commissionAmount },
        },
      }),
    ]);

    this.logger.log(
      `Commission ${commissionAmount} FCFA (${percentage}%) sur trip ${trip.id} -> driver ${trip.driverId}`,
    );
  }

  // Decremente la commission due apres paiement confirme (appele par PaymentsService
  // sur confirmation webhook ou confirmation synchrone mock).
  async markCommissionPaid(driverId: string, amount: number): Promise<void> {
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { commissionDue: { decrement: amount } },
    });
    this.logger.log(`Commission payee : ${amount} FCFA par driver ${driverId}`);
  }

  // Solde financier du chauffeur (GET /drivers/me/finances).
  async getDriverFinances(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true, balance: true, commissionDue: true },
    });
    if (!driver) return null;

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [weekAgg, monthAgg] = await Promise.all([
      this.prisma.trip.aggregate({
        where: { driverId: driver.id, status: 'completed', completedAt: { gte: startOfWeek } },
        _sum: { finalPrice: true, commissionAmount: true },
        _count: true,
      }),
      this.prisma.trip.aggregate({
        where: { driverId: driver.id, status: 'completed', completedAt: { gte: startOfMonth } },
        _sum: { finalPrice: true, commissionAmount: true },
        _count: true,
      }),
    ]);

    return {
      balance: Number(driver.balance),
      commissionDue: Number(driver.commissionDue),
      week: {
        tripsCount: weekAgg._count,
        earnings: Number(weekAgg._sum.finalPrice ?? 0),
        commission: Number(weekAgg._sum.commissionAmount ?? 0),
      },
      month: {
        tripsCount: monthAgg._count,
        earnings: Number(monthAgg._sum.finalPrice ?? 0),
        commission: Number(monthAgg._sum.commissionAmount ?? 0),
      },
    };
  }

  // Historique des paiements de commission du chauffeur (GET /drivers/me/commissions).
  async listCommissionPayments(userId: string, page = 1, limit = 20) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!driver) return null;

    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      this.prisma.commissionPayment.findMany({
        where: { driverId: driver.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.commissionPayment.count({ where: { driverId: driver.id } }),
    ]);

    return {
      data: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
