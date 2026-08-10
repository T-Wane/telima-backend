import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsIn([Environment.Development, Environment.Test, Environment.Production])
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET doit faire au moins 32 caracteres' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET doit faire au moins 32 caracteres' })
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string;

  @IsNumber()
  @IsOptional()
  OTP_LENGTH?: number;

  @IsNumber()
  @IsOptional()
  OTP_EXPIRES_MINUTES?: number;

  @IsNumber()
  @IsOptional()
  OTP_MAX_ATTEMPTS?: number;

  @IsNumber()
  @IsOptional()
  OTP_LOCK_MINUTES?: number;

  @IsNumber()
  @IsOptional()
  OTP_RESEND_COOLDOWN_SECONDS?: number;

  @IsBoolean()
  @IsOptional()
  OTP_EXPOSE_IN_RESPONSE?: boolean;

  @IsIn(['mock', 'sendtext'])
  @IsOptional()
  SMS_PROVIDER?: string;

  @IsString()
  @IsOptional()
  SENDTEXT_API_URL?: string;

  @IsString()
  @IsOptional()
  SENDTEXT_API_KEY?: string;

  @IsString()
  @IsOptional()
  SENDTEXT_API_SECRET?: string;

  @IsString()
  @IsOptional()
  SENDTEXT_SENDER_NAME?: string;

  @IsIn(['local', 's3'])
  @IsOptional()
  STORAGE_PROVIDER?: string;

  @IsIn(['mock', 'orange_money'])
  @IsOptional()
  PAYMENT_PROVIDER?: string;

  @IsIn(['mock', 'google'])
  @IsOptional()
  DISTANCE_PROVIDER?: string;

  @IsIn(['mock', 'fcm'])
  @IsOptional()
  PUSH_PROVIDER?: string;

  @IsString()
  @IsOptional()
  FCM_SERVICE_ACCOUNT_PATH?: string;

  @IsString()
  @IsOptional()
  APP_URL?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsString()
  @IsOptional()
  LOG_LEVEL?: string;

  @IsBoolean()
  @IsOptional()
  SWAGGER_ENABLED?: boolean;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Configuration invalide (.env) :\n${errors
        .map((err) => Object.values(err.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validatedConfig;
}
