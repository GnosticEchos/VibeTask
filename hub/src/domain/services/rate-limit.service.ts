/**
 * Rate Limiting Service
 * 
 * Provides CRUD operations for rate limit configurations with in-memory caching.
 * Supports dynamic configuration updates without server restart.
 */

import { prisma } from '../../infrastructure/auth/index.js';
import { CONFIG_CACHE_TTL_MS, defaultRateLimits } from '../../config/rate-limit.js';
import type { RateLimitConfig } from '../../infrastructure/auth/prisma.js';

// In-memory cache for rate limit configurations
interface CachedConfig {
  configs: RateLimitConfig[];
  timestamp: number;
}

let configCache: CachedConfig | null = null;

export class RateLimitService {
  /**
   * Fetch all rate limit configurations from database with caching
   */
  static async getAllConfigs(): Promise<RateLimitConfig[]> {
    const now = Date.now();
    
    // Return cached configs if still valid
    if (configCache && (now - configCache.timestamp) < CONFIG_CACHE_TTL_MS) {
      return configCache.configs;
    }
    
    // Fetch from database
    const configs = await prisma.rateLimitConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    // Update cache
    configCache = {
      configs,
      timestamp: now,
    };
    
    return configs;
  }

  /**
   * Get a single rate limit configuration by ID
   */
  static async getConfigById(id: number): Promise<RateLimitConfig | null> {
    return prisma.rateLimitConfig.findUnique({
      where: { id },
    });
  }

  /**
   * Get rate limit configuration for a specific endpoint path
   * Returns the most specific matching pattern
   */
  static async getConfigForEndpoint(path: string): Promise<RateLimitConfig | null> {
    const configs = await this.getAllConfigs();
    
    // Filter enabled configs and find matching patterns
    const matchingConfigs = configs
      .filter(config => config.enabled)
      .filter(config => this.matchesPattern(path, config.endpointPattern));
    
    // Return the most specific match (longest pattern)
    if (matchingConfigs.length === 0) {
      return null;
    }
    
    return matchingConfigs.reduce((mostSpecific, config) => {
      return config.endpointPattern.length > mostSpecific.endpointPattern.length
        ? config
        : mostSpecific;
    });
  }

  /**
   * Create a new rate limit configuration
   */
  static async createConfig(data: {
    name: string;
    endpointPattern: string;
    windowMs: number;
    maxRequests: number;
    enabled?: boolean;
    description?: string;
  }): Promise<RateLimitConfig> {
    const config = await prisma.rateLimitConfig.create({
      data: {
        ...data,
        enabled: data.enabled ?? true,
      },
    });
    
    // Invalidate cache
    this.invalidateCache();
    
    return config;
  }

  /**
   * Update an existing rate limit configuration
   */
  static async updateConfig(
    id: number,
    data: Partial<{
      name: string;
      endpointPattern: string;
      windowMs: number;
      maxRequests: number;
      enabled: boolean;
      description: string;
    }>
  ): Promise<RateLimitConfig> {
    const config = await prisma.rateLimitConfig.update({
      where: { id },
      data,
    });
    
    // Invalidate cache
    this.invalidateCache();
    
    return config;
  }

  /**
   * Delete a rate limit configuration
   */
  static async deleteConfig(id: number): Promise<RateLimitConfig> {
    const config = await prisma.rateLimitConfig.delete({
      where: { id },
    });
    
    // Invalidate cache
    this.invalidateCache();
    
    return config;
  }

  /**
   * Toggle enabled status for a rate limit configuration
   */
  static async toggleConfig(id: number): Promise<RateLimitConfig> {
    const existing = await this.getConfigById(id);
    if (!existing) {
      throw new Error('Rate limit configuration not found');
    }
    
    const config = await prisma.rateLimitConfig.update({
      where: { id },
      data: { enabled: !existing.enabled },
    });
    
    // Invalidate cache
    this.invalidateCache();
    
    return config;
  }

  /**
   * Ensure each built-in default exists (matched by exact `endpointPattern`).
   * Existing rows are left unchanged so admins keep custom windows, limits, and enabled flags.
   */
  static async initializeDefaults(): Promise<void> {
    const patterns = defaultRateLimits.map((d) => d.endpointPattern);
    const existing = await prisma.rateLimitConfig.findMany({
      where: { endpointPattern: { in: patterns } },
      select: { endpointPattern: true },
    });
    const present = new Set(existing.map((r) => r.endpointPattern));

    let created = 0;
    for (const def of defaultRateLimits) {
      if (present.has(def.endpointPattern)) continue;
      await prisma.rateLimitConfig.create({ data: def });
      present.add(def.endpointPattern);
      created++;
    }

    if (created > 0) {
      console.log(
        `Rate limit defaults: inserted ${created} missing rule(s) (${defaultRateLimits.length} built-in patterns)`,
      );
      this.invalidateCache();
    }
  }

  /**
   * Invalidate the configuration cache
   */
  static invalidateCache(): void {
    configCache = null;
  }

  /**
   * Check if a path matches a pattern (supports wildcards)
   * Example: Pattern /api/auth/* matches path /api/auth/login
   */
  private static matchesPattern(path: string, pattern: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '\\?');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }
}
