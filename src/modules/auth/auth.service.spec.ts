import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms-provider.interface';

describe('AuthService', () => {
  let service: AuthService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let jwtService: Partial<JwtService>;
  let smsProvider: Partial<SmsProvider>;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    const otpCodeData: Record<string, unknown> = {};
    const userData: Record<string, unknown> = {};
    const refreshTokenData: Record<string, unknown> = {};

    prisma = {
      otpCode: {
        findFirst: jest.fn(async ({ where }: { where: { phone: string } }) => {
          return otpCodeData[where.phone] ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = 'otp-' + Date.now() + '-' + Math.random();
          const record = { id, ...data, attempts: 0, createdAt: new Date() };
          otpCodeData[data.phone as string] = record;
          return record;
        }),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          for (const key of Object.keys(otpCodeData)) {
            if ((otpCodeData[key] as { id: string }).id === where.id) {
              delete otpCodeData[key];
            }
          }
          return {};
        }),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            for (const key of Object.keys(otpCodeData)) {
              const record = otpCodeData[key] as { id: string };
              if (record.id === where.id) {
                Object.assign(record, data);
                return { ...record };
              }
            }
            return { id: where.id, ...data };
          },
        ),
      },
      user: {
        findUnique: jest.fn(async ({ where }: { where: { phone?: string; id?: string } }) => {
          if (where.phone) return userData[where.phone] ?? null;
          if (where.id) {
            return (
              Object.values(userData).find((u) => (u as { id: string }).id === where.id) ?? null
            );
          }
          return null;
        }),
        findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
          const user = Object.values(userData).find((u) => (u as { id: string }).id === where.id);
          if (!user) throw new Error('User not found');
          return user;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = 'user-' + Date.now();
          const user = { id, role: 'client', isActive: true, ...data };
          userData[data.phone as string] = user;
          return user;
        }),
      },
      refreshToken: {
        findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
          return refreshTokenData[where.tokenHash] ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = 'rt-' + Date.now();
          refreshTokenData[data.tokenHash as string] = { id, ...data };
          return refreshTokenData[data.tokenHash as string];
        }),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            return { id: where.id, ...data };
          },
        ),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-123', phone: '+22312345678', role: 'client' }),
    };

    smsProvider = {
      sendOtp: jest.fn().mockResolvedValue({}),
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          OTP_LENGTH: 4,
          OTP_EXPIRES_MINUTES: 5,
          OTP_RESEND_COOLDOWN_SECONDS: 60,
          OTP_MAX_ATTEMPTS: 3,
          OTP_LOCK_MINUTES: 30,
          JWT_ACCESS_SECRET: 'test-access-secret-min-32-chars-long!!',
          JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars-long!',
          JWT_ACCESS_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '30d',
          NODE_ENV: 'test',
          OTP_EXPOSE_IN_RESPONSE: true,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: SMS_PROVIDER, useValue: smsProvider },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('requestOtp', () => {
    it('should create an OTP and send it via SMS', async () => {
      const result = await service.requestOtp('+22312345678');

      expect(result.phone).toBe('+22312345678');
      expect(result.expiresInSeconds).toBe(300);
      expect(result.devOtpCode).toBeDefined();
      expect(result.devOtpCode).toMatch(/^\d{4}$/);
      expect(smsProvider.sendOtp).toHaveBeenCalledWith('+22312345678', expect.any(String));
    });

    it('should throw BadRequestException if cooldown not elapsed', async () => {
      await service.requestOtp('+22312345678');

      await expect(service.requestOtp('+22312345678')).rejects.toThrow(BadRequestException);
    });

    it('should persist the provider messageId on the OTP record', async () => {
      (smsProvider.sendOtp as jest.Mock).mockResolvedValueOnce({ messageId: 'msg-123' });

      await service.requestOtp('+22366667777');

      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: { smsMessageId: 'msg-123' },
      });
    });

    it('should throw 503 and delete the OTP record if the SMS provider fails', async () => {
      (smsProvider.sendOtp as jest.Mock).mockRejectedValueOnce(new Error('provider down'));

      await expect(service.requestOtp('+22355556666')).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.otpCode.delete).toHaveBeenCalled();

      // L'enregistrement etant supprime, une nouvelle demande immediate ne declenche
      // ni cooldown ni penalite de quota.
      (smsProvider.sendOtp as jest.Mock).mockResolvedValueOnce({});
      const retry = await service.requestOtp('+22355556666');
      expect(retry.devOtpCode).toBeDefined();
    });

    it('should not expose devOtpCode in production', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          OTP_LENGTH: 4,
          OTP_EXPIRES_MINUTES: 5,
          OTP_RESEND_COOLDOWN_SECONDS: 60,
          OTP_MAX_ATTEMPTS: 3,
          OTP_LOCK_MINUTES: 30,
          JWT_ACCESS_SECRET: 'test-access-secret-min-32-chars-long!!',
          JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars-long!',
          JWT_ACCESS_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '30d',
          NODE_ENV: 'production',
          OTP_EXPOSE_IN_RESPONSE: true,
        };
        return config[key] ?? defaultValue;
      });

      const result = await service.requestOtp('+22398765432');
      expect(result.devOtpCode).toBeUndefined();
    });
  });

  describe('verifyOtp', () => {
    it('should create a new user and return tokens for valid OTP', async () => {
      // First request an OTP
      const otpResult = await service.requestOtp('+22311112222');
      const code = otpResult.devOtpCode as string;

      const result = await service.verifyOtp('+22311112222', code);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.isNewUser).toBe(true);
      expect(result.user.phone).toBe('+22311112222');
      expect(result.user.role).toBe('client');
    });

    it('should throw UnauthorizedException for invalid OTP', async () => {
      await service.requestOtp('+22322223333');

      await expect(service.verifyOtp('+22322223333', '0000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if no OTP pending', async () => {
      await expect(service.verifyOtp('+22399998888', '1234')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should lock after max attempts', async () => {
      await service.requestOtp('+22333334444');

      // 3 failed attempts (OTP_MAX_ATTEMPTS = 3)
      for (let i = 0; i < 3; i++) {
        try {
          await service.verifyOtp('+22333334444', '0000');
        } catch {
          // expected
        }
      }

      // Next attempt should be locked
      await expect(service.verifyOtp('+22333334444', '0000')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('should issue new tokens and revoke old one', async () => {
      // Setup: create user and a refresh token record
      const user = {
        id: 'user-refresh-1',
        phone: '+22344445555',
        role: 'client',
        isActive: true,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(user);
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);

      const tokenHash = 'hash-123';
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'rt-1',
        tokenHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const result = await service.refresh('valid-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValueOnce(new Error('invalid'));

      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token', async () => {
      const result = await service.logout('user-123', 'some-refresh-token');
      expect(result.success).toBe(true);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });
});
