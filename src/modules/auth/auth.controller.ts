import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander un code OTP par SMS' })
  @ApiResponse({ status: 200, description: 'OTP envoye avec succes' })
  @ApiResponse({ status: 400, description: 'Cooldown ou erreur SMS' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.phone);
  }

  @Public()
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifier un code OTP et obtenir les tokens JWT' })
  @ApiResponse({ status: 200, description: 'Tokens JWT retournes' })
  @ApiResponse({ status: 401, description: 'OTP invalide ou expire' })
  @ApiResponse({ status: 403, description: 'Compte desactive ou trop de tentatives' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.phone, dto.code);
  }

  @Public()
  @Throttle({ auth: { ttl: 60000, limit: 20 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renouveler les tokens JWT via refresh token' })
  @ApiResponse({ status: 200, description: 'Nouveaux tokens JWT' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login admin (email + password) pour le dashboard' })
  @ApiResponse({ status: 200, description: 'Tokens JWT retournes' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto.email, dto.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoquer le refresh token' })
  @ApiResponse({ status: 200, description: 'Refresh token revoque' })
  logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.id, dto.refreshToken);
  }
}
