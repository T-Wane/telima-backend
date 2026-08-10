import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testPhone: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({}),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    testPhone = '+223' + Math.floor(10000000 + Math.random() * 89999999).toString();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.otpCode.deleteMany({ where: { phone: testPhone } });
      const user = await prisma.user.findUnique({ where: { phone: testPhone } });
      if (user) {
        await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
    await app.close();
  });

  describe('POST /v1/auth/request-otp', () => {
    it('should send OTP and return phone with dev code', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/request-otp')
        .send({ phone: testPhone })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe(testPhone);
      expect(res.body.data.expiresInSeconds).toBe(300);
    });

    it('should reject invalid phone format', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/request-otp')
        .send({ phone: '123' })
        .expect(400);
    });

    it('should enforce resend cooldown', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/request-otp')
        .send({ phone: testPhone })
        .expect(400);
    });
  });

  describe('POST /v1/auth/verify-otp', () => {
    it('should reject invalid OTP', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/verify-otp')
        .send({ phone: testPhone, code: '0000' })
        .expect(401);
    });

    it('should reject non-existent phone', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/verify-otp')
        .send({ phone: '+22399999999', code: '1234' })
        .expect(401);
    });
  });

  describe('GET /v1/users/me (protected)', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/v1/users/me').expect(401);
    });
  });

  describe('GET /v1/health', () => {
    it('should return health status', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBeDefined();
      expect(res.body.data.checks).toBeDefined();
    });
  });
});
