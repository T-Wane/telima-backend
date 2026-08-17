import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms-provider.interface';
import { normalizePhone } from './utils/phone.util';
import { generateOtpCode, hashToken } from './utils/crypto.util';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserRole } from '@prisma/client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    const otpLength = this.config.get<number>('OTP_LENGTH', 4);
    const expiresMinutes = this.config.get<number>('OTP_EXPIRES_MINUTES', 5);
    const resendCooldownSeconds = this.config.get<number>('OTP_RESEND_COOLDOWN_SECONDS', 60);

    const lastOtp = await this.prisma.otpCode.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });

    if (lastOtp) {
      const secondsSinceLastRequest = (Date.now() - lastOtp.createdAt.getTime()) / 1000;
      if (secondsSinceLastRequest < resendCooldownSeconds) {
        throw new BadRequestException(
          `Veuillez patienter ${Math.ceil(resendCooldownSeconds - secondsSinceLastRequest)}s avant de redemander un code`,
        );
      }
    }

    const code = generateOtpCode(otpLength);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    const existingUser = await this.prisma.user.findUnique({ where: { phone } });

    const otpRecord = await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash,
        expiresAt,
        userId: existingUser?.id,
      },
    });

    try {
      const smsResult = await this.smsProvider.sendOtp(phone, code);
      if (smsResult.messageId) {
        await this.prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { smsMessageId: smsResult.messageId },
        });
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      // Si l'envoi SMS echoue cote fournisseur, on supprime l'enregistrement OTP pour
      // ne pas penaliser l'utilisateur (ni cooldown, ni compteur de tentatives) et on
      // signale une indisponibilite temporaire (503), pas une erreur client.
      await this.prisma.otpCode.delete({ where: { id: otpRecord.id } });
      throw new ServiceUnavailableException(
        'Service SMS temporairement indisponible, veuillez reessayer',
      );
    }

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const exposeInResponse = this.config.get<boolean>('OTP_EXPOSE_IN_RESPONSE', false);

    return {
      phone,
      expiresInSeconds: expiresMinutes * 60,
      // Uniquement en dev/test, jamais en preprod/prod (decision Sprint1 §8).
      ...(exposeInResponse && !isProd ? { devOtpCode: code } : {}),
    };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS', 3);
    const lockMinutes = this.config.get<number>('OTP_LOCK_MINUTES', 30);

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new UnauthorizedException('Aucun code OTP en attente pour ce numero');
    }

    if (otpRecord.lockedUntil && otpRecord.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Trop de tentatives, reessayez apres ${otpRecord.lockedUntil.toISOString()}`,
      );
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Code OTP expire');
    }

    const isCodeValid = await bcrypt.compare(code, otpRecord.codeHash);

    if (!isCodeValid) {
      const attempts = otpRecord.attempts + 1;
      const shouldLock = attempts >= maxAttempts;

      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: {
          attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + lockMinutes * 60 * 1000)
            : otpRecord.lockedUntil,
        },
      });

      if (shouldLock) {
        throw new ForbiddenException(`Trop de tentatives, blocage de ${lockMinutes} minutes`);
      }
      throw new UnauthorizedException('Code OTP invalide');
    }

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    let user = await this.prisma.user.findUnique({ where: { phone } });
    let isNewUser = false;

    if (!user) {
      user = await this.prisma.user.create({ data: { phone } });
      isNewUser = true;
    } else if (!user.firstName || !user.lastName) {
      isNewUser = true;
    }

    if (!user.isActive) {
      throw new ForbiddenException('Ce compte a ete desactive');
    }

    const tokens = await this.issueTokenPair(user.id, user.phone, user.role);

    return {
      ...tokens,
      isNewUser,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  // Login admin pour le dashboard : email + password bcrypt (pas d'OTP, decision actee).
  // Reserve au role admin ; un compte client/chauffeur ne peut pas se connecter ici.
  async adminLogin(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, role: UserRole.admin },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Ce compte a ete desactive');
    }
    const tokens = await this.issueTokenPair(user.id, user.phone, user.role);
    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expire');
    }

    const tokenHash = hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalide, revoque ou expire');
    }

    // Rotation : on revoque l'ancien token des qu'il est utilise.
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    return this.issueTokenPair(user.id, user.phone, user.role, storedToken.id);
  }

  async logout(userId: string, refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  private async issueTokenPair(
    userId: string,
    phone: string,
    role: JwtPayload['role'],
    replacedTokenId?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, phone, role };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: this.parseExpiryToDate(refreshExpiresIn),
        ...(replacedTokenId ? { replacedBy: replacedTokenId } : {}),
      },
    });

    if (replacedTokenId) {
      await this.prisma.refreshToken.update({
        where: { id: replacedTokenId },
        data: { replacedBy: refreshTokenRecord.id },
      });
    }

    return { accessToken, refreshToken };
  }

  private parseExpiryToDate(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      // Repli raisonnable si le format n'est pas reconnu.
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    const value = Number(match[1]);
    const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]] ?? 86400000;
    return new Date(Date.now() + value * unitMs);
  }
}
