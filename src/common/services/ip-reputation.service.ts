import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { CacheService } from './cache.service';
import { SecurityService } from './security.service';
import * as axios from 'axios';

export interface IPReputationResult {
  isBlocked: boolean;
  riskScore: number;
  source: string;
  reason?: string;
  country?: string;
  isp?: string;
  threats?: string[];
}

export interface ThreatIntelligenceResponse {
  malicious: boolean;
  riskScore: number;
  country?: string;
  isp?: string;
  threats?: string[];
  source: string;
}

@Injectable()
export class IPReputationService {
  private readonly logger = new Logger(IPReputationService.name);
  
  // High-risk countries (based on common attack sources)
  private readonly HIGH_RISK_COUNTRIES = [
    'CN', 'RU', 'KP', 'IR', 'PK', 'BD', 'VN', 'BY', 'UA', 'ID'
  ];

  // Known malicious IP ranges (CIDR format)
  private readonly BLOCKED_IP_RANGES = [
    '10.0.0.0/8',      // Private networks (if not expected)
    '172.16.0.0/12',   // Private networks (if not expected)
    '192.168.0.0/16',  // Private networks (if not expected)
    '127.0.0.0/8',     // Loopback (suspicious if external)
  ];

  // Whitelist for trusted IPs (CDN, monitoring services, etc.)
  private readonly WHITELIST_IPS = [
    '127.0.0.1',
    '::1',
    // Add your CDN IPs, monitoring services, etc.
  ];

  constructor(
    private cacheService: CacheService,
    private securityService: SecurityService,
  ) {}

  /**
   * Check IP reputation using multiple threat intelligence sources
   */
  async checkIPReputation(ip: string, userAgent?: string): Promise<IPReputationResult> {
    try {
      // Skip localhost and private IPs in development
      if (this.isPrivateIP(ip) && process.env.NODE_ENV !== 'production') {
        return {
          isBlocked: false,
          riskScore: 0,
          source: 'private_ip_development',
        };
      }

      // Check whitelist first
      if (this.WHITELIST_IPS.includes(ip)) {
        return {
          isBlocked: false,
          riskScore: 0,
          source: 'whitelist',
        };
      }

      // Check cache first
      const cacheKey = `ip_reputation:${ip}`;
      const cached = await this.cacheService.get<IPReputationResult>(cacheKey);
      if (cached) {
        this.logger.debug(`IP reputation cache hit for ${ip}`);
        return cached;
      }

      // Perform comprehensive IP reputation check
      const result = await this.performReputationCheck(ip, userAgent);

      // Cache the result (TTL: 1 hour for clean IPs, 24 hours for malicious)
      const ttl = result.isBlocked ? 24 * 60 * 60 : 60 * 60;
      await this.cacheService.set(cacheKey, result, ttl);

      // Log security events
      if (result.isBlocked) {
        this.securityService.logSecurityEvent(
          'MALICIOUS_IP_BLOCKED',
          {
            ip,
            userAgent,
            riskScore: result.riskScore,
            source: result.source,
            reason: result.reason,
            country: result.country,
            threats: result.threats,
          },
          'warn'
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Error checking IP reputation for ${ip}:`, error);
      
      // Fail-safe: allow request but log the error
      return {
        isBlocked: false,
        riskScore: 0,
        source: 'error_fallback',
        reason: 'Reputation check failed',
      };
    }
  }

  /**
   * Perform comprehensive reputation check using multiple sources
   */
  private async performReputationCheck(ip: string, userAgent?: string): Promise<IPReputationResult> {
    let maxRiskScore = 0;
    let blockingSources: string[] = [];
    let allThreats: string[] = [];
    let country: string | undefined;
    let isp: string | undefined;

    // 1. Check against known malicious IP ranges
    if (this.isInBlockedRange(ip)) {
      return {
        isBlocked: true,
        riskScore: 100,
        source: 'blocked_ip_range',
        reason: 'IP in known malicious range',
      };
    }

    // 2. Check multiple threat intelligence sources
    const checks = await Promise.allSettled([
      this.checkAbuseIPDB(ip),
      this.checkVirusTotal(ip),
      this.checkIPQualityScore(ip),
      this.checkGreyNoise(ip),
    ]);

    for (const [index, check] of checks.entries()) {
      if (check.status === 'fulfilled' && check.value) {
        const result = check.value;
        if (result.malicious) {
          blockingSources.push(result.source);
        }
        maxRiskScore = Math.max(maxRiskScore, result.riskScore);
        if (result.threats) {
          allThreats.push(...result.threats);
        }
        if (result.country) country = result.country;
        if (result.isp) isp = result.isp;
      }
    }

    // 3. Geographic risk assessment
    if (country && this.HIGH_RISK_COUNTRIES.includes(country)) {
      maxRiskScore += 20;
      allThreats.push('high_risk_country');
    }

    // 4. User agent analysis (basic bot detection)
    if (userAgent && this.isSuspiciousUserAgent(userAgent)) {
      maxRiskScore += 15;
      allThreats.push('suspicious_user_agent');
    }

    // Decision logic: Block if risk score > 70 or multiple sources flag it
    const isBlocked = maxRiskScore > 70 || blockingSources.length >= 2;

    return {
      isBlocked,
      riskScore: Math.min(maxRiskScore, 100),
      source: blockingSources.join(',') || 'reputation_analysis',
      reason: isBlocked ? `Risk score: ${maxRiskScore}, Sources: ${blockingSources.join(',')}` : undefined,
      country,
      isp,
      threats: allThreats.length > 0 ? [...new Set(allThreats)] : undefined,
    };
  }

  /**
   * Check AbuseIPDB (Free tier: 1000 requests/day)
   */
  private async checkAbuseIPDB(ip: string): Promise<ThreatIntelligenceResponse | null> {
    try {
      const apiKey = process.env.ABUSEIPDB_API_KEY;
      if (!apiKey) {
        this.logger.debug('AbuseIPDB API key not configured');
        return null;
      }

      const response = await axios.default.get(
        `https://api.abuseipdb.com/api/v2/check`,
        {
          params: { ipAddress: ip, maxAgeInDays: 90, verbose: '' },
          headers: {
            'Key': apiKey,
            'Accept': 'application/json',
          },
          timeout: 5000,
        }
      );

      const data = response.data.data;
      return {
        malicious: data.abuseConfidencePercentage > 50,
        riskScore: data.abuseConfidencePercentage,
        country: data.countryCode,
        isp: data.isp,
        threats: data.usageType ? [data.usageType] : [],
        source: 'abuseipdb',
      };
    } catch (error) {
      this.logger.debug(`AbuseIPDB check failed for ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * Check VirusTotal (Free tier: 500 requests/day)
   */
  private async checkVirusTotal(ip: string): Promise<ThreatIntelligenceResponse | null> {
    try {
      const apiKey = process.env.VIRUSTOTAL_API_KEY;
      if (!apiKey) {
        this.logger.debug('VirusTotal API key not configured');
        return null;
      }

      const response = await axios.default.get(
        `https://www.virustotal.com/api/v3/ip_addresses/${ip}`,
        {
          headers: { 'x-apikey': apiKey },
          timeout: 5000,
        }
      );

      const data = response.data.data.attributes;
      const maliciousVotes = data.last_analysis_stats.malicious || 0;
      const totalVotes = Object.values(data.last_analysis_stats).reduce((a: number, b: number) => a + b, 0) as number;
      
      const riskScore = totalVotes > 0 ? (maliciousVotes / totalVotes) * 100 : 0;

      return {
        malicious: maliciousVotes > 0,
        riskScore,
        country: data.country,
        threats: data.tags || [],
        source: 'virustotal',
      };
    } catch (error) {
      this.logger.debug(`VirusTotal check failed for ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * Check IPQualityScore (Free tier: 5000 requests/month)
   */
  private async checkIPQualityScore(ip: string): Promise<ThreatIntelligenceResponse | null> {
    try {
      const apiKey = process.env.IPQUALITYSCORE_API_KEY;
      if (!apiKey) {
        this.logger.debug('IPQualityScore API key not configured');
        return null;
      }

      const response = await axios.default.get(
        `https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}`,
        {
          params: { strictness: 1 },
          timeout: 5000,
        }
      );

      const data = response.data;
      const riskScore = data.fraud_score || 0;

      return {
        malicious: data.fraud_score > 75 || data.vpn || data.tor || data.proxy,
        riskScore,
        country: data.country_code,
        isp: data.ISP,
        threats: [
          ...(data.vpn ? ['vpn'] : []),
          ...(data.tor ? ['tor'] : []),
          ...(data.proxy ? ['proxy'] : []),
          ...(data.bot_status ? ['bot'] : []),
        ],
        source: 'ipqualityscore',
      };
    } catch (error) {
      this.logger.debug(`IPQualityScore check failed for ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * Check GreyNoise (Free tier: 1000 requests/month)
   */
  private async checkGreyNoise(ip: string): Promise<ThreatIntelligenceResponse | null> {
    try {
      const apiKey = process.env.GREYNOISE_API_KEY;
      if (!apiKey) {
        this.logger.debug('GreyNoise API key not configured');
        return null;
      }

      const response = await axios.default.get(
        `https://api.greynoise.io/v3/community/${ip}`,
        {
          headers: { 'key': apiKey },
          timeout: 5000,
        }
      );

      const data = response.data;
      
      return {
        malicious: data.classification === 'malicious',
        riskScore: data.classification === 'malicious' ? 90 : data.noise ? 30 : 0,
        threats: data.name ? [data.name] : [],
        source: 'greynoise',
      };
    } catch (error) {
      this.logger.debug(`GreyNoise check failed for ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * Check if IP is in blocked ranges
   */
  private isInBlockedRange(ip: string): boolean {
    // Simplified implementation - in production, use proper CIDR matching library
    return this.BLOCKED_IP_RANGES.some(range => {
      if (range.includes('/')) {
        // This is a simplified check - use 'ip-range-check' library for production
        const [network] = range.split('/');
        return ip.startsWith(network.split('.').slice(0, -1).join('.'));
      }
      return ip === range;
    });
  }

  /**
   * Check if IP is private/local
   */
  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^127\./, // Loopback
      /^10\./, // Class A private
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
      /^192\.168\./, // Class C private
      /^::1$/, // IPv6 loopback
      /^fc00:/, // IPv6 unique local
    ];

    return privateRanges.some(range => range.test(ip));
  }

  /**
   * Analyze user agent for suspicious patterns
   */
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /^$/,                    // Empty user agent
      /curl/i,                 // Command line tools
      /wget/i,                 // Command line tools
      /python/i,               // Python requests
      /bot/i,                  // Generic bots
      /crawler/i,              // Crawlers
      /scanner/i,              // Security scanners
      /sqlmap/i,               // SQL injection tool
      /nikto/i,                // Security scanner
      /nmap/i,                 // Network scanner
      /masscan/i,              // Port scanner
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Add IP to temporary block list (for dynamic blocking)
   */
  async blockIPTemporarily(ip: string, reason: string, durationMinutes: number = 60): Promise<void> {
    const cacheKey = `ip_blocked:${ip}`;
    const blockInfo = {
      ip,
      reason,
      blockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
    };

    await this.cacheService.set(cacheKey, blockInfo, durationMinutes * 60);
    
    this.logger.warn(`IP ${ip} temporarily blocked for ${durationMinutes} minutes. Reason: ${reason}`);
    
    this.securityService.logSecurityEvent(
      'IP_TEMPORARILY_BLOCKED',
      { ip, reason, durationMinutes },
      'warn'
    );
  }

  /**
   * Check if IP is temporarily blocked
   */
  async isIPTemporarilyBlocked(ip: string): Promise<boolean> {
    const cacheKey = `ip_blocked:${ip}`;
    const blockInfo = await this.cacheService.get(cacheKey);
    return !!blockInfo;
  }
}
