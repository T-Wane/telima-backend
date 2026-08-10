import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ServiceConfig...');

  const services = [
    {
      serviceType: 'ride',
      displayName: 'Course',
      description: 'Transport de passagers en ville',
      dispatchRadiusMeters: 5000,
      maxDispatchAttempts: 3,
      lockTtlSeconds: 30,
      dispatchTimeoutMs: 15000,
      surgeEnabled: false,
      maxSurgeMultiplier: 2.0,
    },
    {
      serviceType: 'delivery',
      displayName: 'Livraison',
      description: 'Livraison de colis et documents',
      dispatchRadiusMeters: 5000,
      maxDispatchAttempts: 3,
      lockTtlSeconds: 30,
      dispatchTimeoutMs: 15000,
      surgeEnabled: false,
      maxSurgeMultiplier: 2.0,
    },
    {
      serviceType: 'food',
      displayName: 'Repas',
      description: 'Livraison de repas depuis restaurants',
      dispatchRadiusMeters: 4000,
      maxDispatchAttempts: 3,
      lockTtlSeconds: 30,
      dispatchTimeoutMs: 12000,
      surgeEnabled: false,
      maxSurgeMultiplier: 2.0,
    },
    {
      serviceType: 'intercity',
      displayName: 'Interurbain',
      description: 'Transport interurbain de passagers',
      dispatchRadiusMeters: 10000,
      maxDispatchAttempts: 5,
      lockTtlSeconds: 60,
      dispatchTimeoutMs: 30000,
      surgeEnabled: false,
      maxSurgeMultiplier: 3.0,
    },
    {
      serviceType: 'assistance',
      displayName: 'Assistance',
      description: 'Assistance routière et dépannage',
      dispatchRadiusMeters: 8000,
      maxDispatchAttempts: 5,
      lockTtlSeconds: 45,
      dispatchTimeoutMs: 20000,
      surgeEnabled: false,
      maxSurgeMultiplier: 2.0,
    },
  ];

  for (const svc of services) {
    await prisma.serviceConfig.upsert({
      where: { serviceType: svc.serviceType },
      create: { ...svc, isEnabled: true },
      update: {},
    });
    console.log(`  ✓ ${svc.serviceType}: ${svc.displayName}`);
  }

  console.log('Seeding capabilities...');

  const capabilities = [
    { name: 'thermal_bag', description: 'Sac isotherme pour repas', category: 'equipment' },
    { name: 'cargo_box', description: 'Caisse de transport pour colis', category: 'equipment' },
    { name: 'first_aid_kit', description: 'Trousse de premiers secours', category: 'equipment' },
    { name: 'tow_rope', description: 'Câble de remorquage', category: 'equipment' },
    { name: 'jump_starter', description: 'Booster de batterie', category: 'equipment' },
    { name: '4_seats', description: '4 places passagers', category: 'vehicle_trait' },
    { name: '2_wheels', description: 'Moto (2 roues)', category: 'vehicle_trait' },
    { name: 'ac', description: 'Climatisation', category: 'vehicle_trait' },
    { name: 'first_aid_cert', description: 'Certification premiers secours', category: 'certification' },
  ];

  for (const cap of capabilities) {
    await prisma.capability.upsert({
      where: { name: cap.name },
      create: cap,
      update: {},
    });
    console.log(`  ✓ ${cap.name}: ${cap.description}`);
  }

  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
