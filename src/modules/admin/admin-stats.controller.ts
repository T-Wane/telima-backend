import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TripStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';

// Endpoints admin pour le dashboard (Sprint 6) : statistiques globales,
// financieres, et rapport de commissions. Acces restreint au role admin.
@ApiTags('Admin — Stats & Finances')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('admin')
export class AdminStatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques globales (utilisateurs, chauffeurs, courses, revenus)' })
  async getStats() {
    const [
      totalUsers,
      totalDrivers,
      validatedDrivers,
      onlineDrivers,
      totalTrips,
      completedTrips,
      revenueAgg,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.driver.count(),
      this.prisma.driver.count({ where: { status: 'validated' } }),
      this.prisma.driver.count({ where: { isOnline: true } }),
      this.prisma.trip.count(),
      this.prisma.trip.count({ where: { status: TripStatus.completed } }),
      this.prisma.trip.aggregate({
        where: { status: TripStatus.completed },
        _sum: { finalPrice: true, commissionAmount: true },
      }),
    ]);

    return {
      users: { total: totalUsers },
      drivers: { total: totalDrivers, validated: validatedDrivers, online: onlineDrivers },
      trips: { total: totalTrips, completed: completedTrips },
      revenue: {
        total: Number(revenueAgg._sum.finalPrice ?? 0),
        commission: Number(revenueAgg._sum.commissionAmount ?? 0),
      },
    };
  }

  @Get('finances')
  @ApiOperation({ summary: 'Statistiques financieres (revenus, commissions, paiements)' })
  async getFinances() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      revenue,
      monthRevenue,
      commissionPaid,
      commissionPending,
      paymentsCount,
      paymentsSucceeded,
      paymentsPending,
      paymentsFailed,
      paymentsExpired,
      paymentsSucceededAmount,
      paymentsPendingAmount,
    ] = await Promise.all([
      this.prisma.trip.aggregate({
        where: { status: TripStatus.completed },
        _sum: { finalPrice: true, commissionAmount: true },
      }),
      this.prisma.trip.aggregate({
        where: { status: TripStatus.completed, completedAt: { gte: startOfMonth } },
        _sum: { finalPrice: true, commissionAmount: true },
      }),
      this.prisma.commissionPayment.aggregate({
        where: { status: 'succeeded' },
        _sum: { amount: true },
      }),
      this.prisma.driver.aggregate({ _sum: { commissionDue: true } }),
      this.prisma.commissionPayment.count(),
      this.prisma.commissionPayment.count({ where: { status: 'succeeded' } }),
      this.prisma.commissionPayment.count({ where: { status: 'pending' } }),
      this.prisma.commissionPayment.count({ where: { status: 'failed' } }),
      this.prisma.commissionPayment.count({ where: { status: 'expired' } }),
      this.prisma.commissionPayment.aggregate({
        where: { status: 'succeeded' },
        _sum: { amount: true },
      }),
      this.prisma.commissionPayment.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      }),
    ]);

    return {
      revenue: {
        total: Number(revenue._sum.finalPrice ?? 0),
        thisMonth: Number(monthRevenue._sum.finalPrice ?? 0),
        commissionTotal: Number(revenue._sum.commissionAmount ?? 0),
        commissionThisMonth: Number(monthRevenue._sum.commissionAmount ?? 0),
      },
      commissions: {
        collected: Number(commissionPaid._sum.amount ?? 0),
        outstanding: Number(commissionPending._sum.commissionDue ?? 0),
      },
      payments: {
        count: paymentsCount,
        succeeded: paymentsSucceeded,
        pending: paymentsPending,
        failed: paymentsFailed,
        expired: paymentsExpired,
        succeededAmount: Number(paymentsSucceededAmount._sum.amount ?? 0),
        pendingAmount: Number(paymentsPendingAmount._sum.amount ?? 0),
      },
    };
  }

  @Get('reports/commissions')
  @ApiOperation({ summary: 'Rapport des commissions par chauffeur' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getCommissionsReport(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const skip = (p - 1) * l;

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        skip,
        take: l,
        orderBy: { commissionDue: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, phone: true } } },
      }),
      this.prisma.driver.count(),
    ]);

    return {
      data: drivers.map((d) => ({
        driverId: d.id,
        name: [d.user.firstName, d.user.lastName].filter(Boolean).join(' ') || d.user.phone,
        phone: d.user.phone,
        balance: Number(d.balance),
        commissionDue: Number(d.commissionDue),
        status: d.status,
      })),
      meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) },
    };
  }
}
