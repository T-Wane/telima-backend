import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ServiceDispatchConfig {
  dispatchRadiusMeters: number;
  maxDispatchAttempts: number;
  lockTtlSeconds: number;
  dispatchTimeoutMs: number;
}

export interface ServicePricingConfig {
  surgeEnabled: boolean;
  maxSurgeMultiplier: number;
}

const DEFAULT_CONFIG: ServiceDispatchConfig = {
  dispatchRadiusMeters: 5000,
  maxDispatchAttempts: 3,
  lockTtlSeconds: 30,
  dispatchTimeoutMs: 15000,
};

const DEFAULT_PRICING_CONFIG: ServicePricingConfig = {
  surgeEnabled: false,
  maxSurgeMultiplier: 2.0,
};

@Injectable()
export class ServiceConfigService {
  private readonly logger = new Logger(ServiceConfigService.name);
  private cache = new Map<string, { data: any; expiresAt: number }>();
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getDispatchConfig(serviceType: string): Promise<ServiceDispatchConfig> {
    const config = await this.getConfig(serviceType);
    if (!config) return DEFAULT_CONFIG;

    return {
      dispatchRadiusMeters: config.dispatchRadiusMeters ?? DEFAULT_CONFIG.dispatchRadiusMeters,
      maxDispatchAttempts: config.maxDispatchAttempts ?? DEFAULT_CONFIG.maxDispatchAttempts,
      lockTtlSeconds: config.lockTtlSeconds ?? DEFAULT_CONFIG.lockTtlSeconds,
      dispatchTimeoutMs: config.dispatchTimeoutMs ?? DEFAULT_CONFIG.dispatchTimeoutMs,
    };
  }

  async getPricingConfig(serviceType: string): Promise<ServicePricingConfig> {
    const config = await this.getConfig(serviceType);
    if (!config) return DEFAULT_PRICING_CONFIG;

    return {
      surgeEnabled: config.surgeEnabled ?? DEFAULT_PRICING_CONFIG.surgeEnabled,
      maxSurgeMultiplier: config.maxSurgeMultiplier
        ? Number(config.maxSurgeMultiplier)
        : DEFAULT_PRICING_CONFIG.maxSurgeMultiplier,
    };
  }

  async isServiceEnabled(serviceType: string): Promise<boolean> {
    const config = await this.getConfig(serviceType);
    return config?.isEnabled ?? false;
  }

  async getRequiredCapabilities(serviceType: string): Promise<string[]> {
    const config = await this.getConfig(serviceType, true);
    if (!config?.requirements) return [];

    return config.requirements
      .filter((r: any) => r.level === 'required')
      .map((r: any) => r.capability.name);
  }

  private async getConfig(serviceType: string, includeRequirements = false) {
    const cached = this.cache.get(`${serviceType}:${includeRequirements}`);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const config = await this.prisma.serviceConfig.findUnique({
      where: { serviceType },
      include: includeRequirements
        ? {
            requirements: {
              include: { capability: true },
            },
          }
        : undefined,
    });

    this.cache.set(`${serviceType}:${includeRequirements}`, {
      data: config,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    if (!config) {
      this.logger.warn(`No ServiceConfig found for "${serviceType}", using defaults`);
    }

    return config;
  }

  invalidateCache(): void {
    this.cache.clear();
    this.logger.log('ServiceConfig cache invalidated');
  }
}
