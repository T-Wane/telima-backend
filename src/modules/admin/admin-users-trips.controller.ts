import { Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TripStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsString, IsEnum, IsOptional, IsBoolean, MinLength } from 'class-validator';

class CreateUserDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}

class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}

// Endpoints admin de consultation des utilisateurs et des courses (Sprint 6).
@ApiTags('Admin — Users & Trips')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('admin')
export class AdminUsersTripsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  @ApiOperation({ summary: 'Lister les utilisateurs (filtre role, recherche, pagination)' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listUsers(
    @Query('role') role?: UserRole,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const skip = (p - 1) * l;

    const where = {
      ...(role && { role }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: {
          driver: {
            select: {
              id: true,
              status: true,
              isOnline: true,
              rating: true,
              commissionDue: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) },
    };
  }

  @Get('trips')
  @ApiOperation({ summary: 'Lister les courses (filtres statut/service, pagination)' })
  @ApiQuery({ name: 'status', required: false, enum: TripStatus })
  @ApiQuery({ name: 'serviceType', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listTrips(
    @Query('status') status?: TripStatus,
    @Query('serviceType') serviceType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const skip = (p - 1) * l;

    const where = {
      ...(status && { status }),
      ...(serviceType && { serviceType: serviceType as never }),
    };

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { firstName: true, lastName: true, phone: true } },
          driver: {
            include: { user: { select: { firstName: true, lastName: true, phone: true } } },
          },
          vehicleType: { select: { name: true } },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);

    return {
      data: trips.map((t) => ({
        id: t.id,
        status: t.status,
        serviceType: t.serviceType,
        pickupAddress: t.pickupAddress,
        dropoffAddress: t.dropoffAddress,
        estimatedPrice: Number(t.estimatedPrice ?? 0),
        finalPrice: t.finalPrice != null ? Number(t.finalPrice) : null,
        commissionAmount: t.commissionAmount != null ? Number(t.commissionAmount) : null,
        client: [t.client.firstName, t.client.lastName].filter(Boolean).join(' ') || t.client.phone,
        driver: t.driver
          ? [t.driver.user.firstName, t.driver.user.lastName].filter(Boolean).join(' ') ||
            t.driver.user.phone
          : null,
        vehicleType: t.vehicleType.name,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) },
    };
  }

  @Get('users/:id')
  @ApiOperation({ summary: "Détail d'un utilisateur (admin)" })
  async getUser(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        driver: {
          select: {
            id: true,
            status: true,
            isOnline: true,
            rating: true,
            commissionDue: true,
            balance: true,
            vehicle: { include: { vehicleType: true } },
          },
        },
      },
    });
    if (!user) return null;

    const trips = await this.prisma.trip.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true } } } },
        vehicleType: { select: { name: true } },
      },
    });

    const stats = await this.prisma.trip.aggregate({
      where: { clientId: id, status: 'completed' },
      _sum: { finalPrice: true },
      _count: true,
    });

    return {
      ...user,
      trips: trips.map((t) => ({
        id: t.id,
        status: t.status,
        serviceType: t.serviceType,
        finalPrice: t.finalPrice != null ? Number(t.finalPrice) : null,
        createdAt: t.createdAt,
        driver: t.driver
          ? [t.driver.user.firstName, t.driver.user.lastName].filter(Boolean).join(' ')
          : null,
        vehicleType: t.vehicleType.name,
      })),
      stats: {
        totalTrips: stats._count,
        totalSpent: Number(stats._sum.finalPrice ?? 0),
      },
    };
  }

  @Get('payments')
  @ApiOperation({ summary: 'Lister les paiements de commission (admin, pagination)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listPayments(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const skip = (p - 1) * l;

    const [payments, total] = await Promise.all([
      this.prisma.commissionPayment.findMany({
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: {
          driver: {
            include: { user: { select: { firstName: true, lastName: true, phone: true } } },
          },
        },
      }),
      this.prisma.commissionPayment.count(),
    ]);

    return {
      data: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        status: p.status,
        method: 'Orange Money',
        reference: p.transactionRef,
        createdAt: p.createdAt,
        driver:
          [p.driver.user.firstName, p.driver.user.lastName].filter(Boolean).join(' ') ||
          p.driver.user.phone,
        driverPhone: p.driver.user.phone,
      })),
      meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) },
    };
  }

  @Get('trips/:id')
  @ApiOperation({ summary: "Détail d'une course (admin)" })
  async getTrip(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.trip.findUnique({
      where: { id },
      include: {
        client: { select: { firstName: true, lastName: true, phone: true } },
        driver: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
        vehicleType: true,
        rideDetails: true,
        deliveryDetails: true,
        stops: true,
        ratings: true,
      },
    });
  }

  @Post('users')
  @ApiOperation({ summary: 'Créer un utilisateur (admin)' })
  async createUser(@Body() dto: CreateUserDto) {
    const data: any = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      email: dto.email || null,
      role: dto.role,
      isActive: dto.isActive ?? true,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const user = await this.prisma.user.create({ data });

    if (dto.role === UserRole.driver) {
      await this.prisma.driver.create({
        data: { userId: user.id },
      });
    }

    return user;
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Modifier un utilisateur (admin)' })
  async updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    const data: any = {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({ where: { id }, data });
  }
}
