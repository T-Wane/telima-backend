import { PrismaClient, ServiceType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // --- Vehicle types (VTC & Livraison) ---
  const vehicleTypes = [
    {
      name: 'Moto',
      serviceType: ServiceType.ride,
      capacity: 1,
      baseFare: 200,
      pricePerKm: 150,
      pricePerMin: 25,
      commissionPercentage: 15,
    },
    {
      name: 'Tricycle',
      serviceType: ServiceType.ride,
      capacity: 2,
      baseFare: 300,
      pricePerKm: 200,
      pricePerMin: 30,
      commissionPercentage: 15,
    },
    {
      name: 'Berline',
      serviceType: ServiceType.ride,
      capacity: 4,
      baseFare: 500,
      pricePerKm: 350,
      pricePerMin: 50,
      commissionPercentage: 20,
    },
    {
      name: 'Moto Livraison',
      serviceType: ServiceType.delivery,
      capacity: 10,
      baseFare: 250,
      pricePerKm: 175,
      pricePerMin: 30,
      commissionPercentage: 15,
    },
    {
      name: 'Tricycle Livraison',
      serviceType: ServiceType.delivery,
      capacity: 50,
      baseFare: 400,
      pricePerKm: 250,
      pricePerMin: 40,
      commissionPercentage: 15,
    },
  ];

  for (const vt of vehicleTypes) {
    await prisma.vehicleType.upsert({
      where: { name_serviceType: { name: vt.name, serviceType: vt.serviceType } },
      update: {},
      create: vt,
    });
  }

  // --- Admin user (login dashboard email/password) ---
  const adminPhone = '+22300000000';
  const adminPasswordHash = await bcrypt.hash('AdminTelima2026!', 10);
  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      phone: adminPhone,
      role: UserRole.admin,
      firstName: 'Admin',
      lastName: 'Telima',
      email: 'admin@telima.ml',
      passwordHash: adminPasswordHash,
    },
  });

  console.log('Seed termine : vehicle types + admin user crees');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
