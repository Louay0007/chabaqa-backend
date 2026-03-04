import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly securityEventCounters = new Map<string, number>();
  private readonly securityLevelCounters: Record<'info' | 'warn' | 'error', number> = {
    info: 0,
    warn: 0,
    error: 0,
  };
  private securityAttackEventsTotal = 0;

  private readonly attackEventPatterns: RegExp[] = [
    /ATTACK/i,
    /BLOCKED/i,
    /^BOT_/i,
    /^MALICIOUS_/i,
    /^IP_TEMPORARILY_BLOCKED$/i,
    /^SUSPICIOUS_ACTIVITY_DETECTED$/i,
  ];

  constructor(private configService: ConfigService) {
    this.logger.log('Security service initialized');
  }

  /**
   * Hash a password with bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = this.configService.get('BCRYPT_SALT_ROUNDS', 12);
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }



  /**
   * Generate secure random string
   */
  generateSecureToken(length: number = 32): string {
    return require('crypto').randomBytes(length).toString('hex');
  }

  /**
   * Sanitize input string to prevent NoSQL injection
   */
  sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') return input;

    // Remove potential MongoDB operators
    return input.replace(/[\$]+/g, '');
  }

  /**
   * Validate IP address format
   */
  isValidIP(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    if (ipv4Regex.test(ip)) {
      return ip.split('.').every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
    }

    return ipv6Regex.test(ip);
  }

  /**
   * Check if request is from trusted proxy
   */
  isTrustedProxy(ip: string): boolean {
    const trustedProxies = this.configService.get('TRUSTED_PROXIES', '').split(',');
    return trustedProxies.includes(ip);
  }

  /**
   * Log security event
   */
  logSecurityEvent(event: string, details: any, level: 'info' | 'warn' | 'error' = 'info') {
    this.incrementSecurityMetrics(event, level);

    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      level,
    };

    switch (level) {
      case 'error':
        this.logger.error(`SECURITY EVENT: ${event}`, details);
        break;
      case 'warn':
        this.logger.warn(`SECURITY EVENT: ${event}`, details);
        break;
      default:
        this.logger.log(`SECURITY EVENT: ${event}`, details);
    }

    // TODO: Send to security monitoring system
    this.sendToSecurityMonitor(logEntry);
  }

  private async sendToSecurityMonitor(logEntry: any) {
    // Implementation for external security monitoring
    // Could send to SIEM, Splunk, or custom security dashboard
  }

  getSecurityMetrics() {
    const byEvent = Array.from(this.securityEventCounters.entries()).map(([key, count]) => {
      const [event, level] = key.split('|');
      return { event, level: level as 'info' | 'warn' | 'error', count };
    });

    return {
      total: byEvent.reduce((sum, item) => sum + item.count, 0),
      attackTotal: this.securityAttackEventsTotal,
      byLevel: { ...this.securityLevelCounters },
      byEvent,
    };
  }

  private incrementSecurityMetrics(event: string, level: 'info' | 'warn' | 'error') {
    const key = `${event}|${level}`;
    const current = this.securityEventCounters.get(key) ?? 0;
    this.securityEventCounters.set(key, current + 1);

    this.securityLevelCounters[level] += 1;

    if (this.isAttackEvent(event)) {
      this.securityAttackEventsTotal += 1;
    }
  }

  private isAttackEvent(event: string): boolean {
    return this.attackEventPatterns.some((pattern) => pattern.test(event));
  }

  /**
   * Encrypt sensitive data
   */
  encryptData(data: string): string {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = this.configService.get('ENCRYPTION_KEY') || this.generateSecureToken(32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt sensitive data
   */
  decryptData(encryptedData: string): string {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = this.configService.get('ENCRYPTION_KEY');

    if (!key) {
      throw new Error('Encryption key not configured');
    }

    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = crypto.createDecipher(algorithm, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(): string {
    return this.generateSecureToken(32);
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(token: string, sessionToken: string): boolean {
    if (!token || !sessionToken) return false;

    // Use timing-safe comparison
    const crypto = require('crypto');
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(sessionToken, 'hex')
    );
  }
}
