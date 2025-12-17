import {
  Injectable,
  NestMiddleware,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SecurityService } from '../services/security.service';

@Injectable()
export class WAFMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WAFMiddleware.name);

  // Simple but effective attack patterns
  private readonly ATTACK_PATTERNS = {
    // SQL Injection patterns
    SQL_INJECTION: [
      /(\bUNION\b.*\bSELECT\b)/i,
      /(\bSELECT\b.*\bFROM\b)/i,
      /(\bINSERT\b.*\bINTO\b)/i,
      /(\bDELETE\b.*\bFROM\b)/i,
      /(\bUPDATE\b.*\bSET\b)/i,
      /(\bDROP\b.*\bTABLE\b)/i,
      /(\';|\"|\'|--|\#)/,
      /(0x[0-9a-f]+)/i,
      /(\bOR\b.*=.*)/i,
      /(\bAND\b.*=.*)/i,
    ],

    // XSS patterns
    XSS: [
      /<script[^>]*>.*?<\/script>/i,
      /<iframe[^>]*>.*?<\/iframe>/i,
      /<object[^>]*>.*?<\/object>/i,
      /<embed[^>]*>/i,
      /<form[^>]*>/i,
      /javascript:/i,
      /on\w+\s*=\s*["'][^"']*["']/i,
      /<img[^>]*src\s*=\s*["']javascript:/i,
      /expression\s*\(/i,
      /vbscript:/i,
    ],

    // Path traversal
    PATH_TRAVERSAL: [
      /\.\.\//,
      /\.\.\\/,
      /\.\.%2f/i,
      /\.\.%5c/i,
      /%2e%2e%2f/i,
      /%2e%2e%5c/i,
      /\.\/%2e%2e\//i,
      /\.\\%2e%2e\\/i,
    ],

    // Command injection
    COMMAND_INJECTION: [
      /[;&|`]/,
      /\$\(/,
      /`.*`/,
      /\|\s*\w+/,
      /;\s*\w+/,
      /&&\s*\w+/,
      /\|\|\s*\w+/,
    ],

    // LDAP injection
    LDAP_INJECTION: [
      /\(\|\(/,
      /\)\(\|/,
      /\*\)\(/,
      /\(\&\(/,
      /\)\)\(/,
    ],

    // File inclusion
    FILE_INCLUSION: [
      /php:\/\//i,
      /file:\/\//i,
      /data:\/\//i,
      /expect:\/\//i,
      /zip:\/\//i,
    ],
  };

  constructor(private securityService: SecurityService) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      const clientIP = this.getClientIP(req);
      const userAgent = req.get('User-Agent') || '';
      const url = req.url;
      const method = req.method;

      // Check request size limits
      const contentLength = parseInt(req.get('Content-Length') || '0', 10);
      if (contentLength > 10 * 1024 * 1024) { // 10MB limit
        this.blockRequest(req, res, 'REQUEST_TOO_LARGE', 'Request exceeds size limit');
        return;
      }

      // Analyze URL for attacks
      const urlThreats = this.detectThreats(url, 'URL');
      if (urlThreats.length > 0) {
        this.blockRequest(req, res, 'MALICIOUS_URL', `URL contains: ${urlThreats.join(', ')}`);
        return;
      }

      // Analyze query parameters
      const queryString = JSON.stringify(req.query);
      const queryThreats = this.detectThreats(queryString, 'QUERY');
      if (queryThreats.length > 0) {
        this.blockRequest(req, res, 'MALICIOUS_QUERY', `Query contains: ${queryThreats.join(', ')}`);
        return;
      }

      // Analyze request body (if present)
      if (req.body) {
        const bodyString = JSON.stringify(req.body);
        const bodyThreats = this.detectThreats(bodyString, 'BODY');
        if (bodyThreats.length > 0) {
          this.blockRequest(req, res, 'MALICIOUS_PAYLOAD', `Body contains: ${bodyThreats.join(', ')}`);
          return;
        }
      }

      // Analyze headers for suspicious content
      const suspiciousHeaders = this.checkSuspiciousHeaders(req);
      if (suspiciousHeaders.length > 0) {
        this.blockRequest(req, res, 'MALICIOUS_HEADERS', `Headers contain: ${suspiciousHeaders.join(', ')}`);
        return;
      }

      // Log clean requests (for monitoring)
      if (method !== 'GET' || url.includes('/api/')) {
        this.logger.debug(`Clean request: ${method} ${url} from ${clientIP}`);
      }

      next();
    } catch (error) {
      this.logger.error('WAF middleware error:', error);
      // Don't block on error, just log
      next();
    }
  }

  private detectThreats(input: string, location: string): string[] {
    const threats: string[] = [];

    if (!input) return threats;

    // Check each category of attacks
    for (const [category, patterns] of Object.entries(this.ATTACK_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(input)) {
          threats.push(category.toLowerCase());
          break; // Only add each category once
        }
      }
    }

    return threats;
  }

  private checkSuspiciousHeaders(req: Request): string[] {
    const suspicious: string[] = [];
    
    // Check User-Agent for malicious patterns
    const userAgent = req.get('User-Agent') || '';
    if (this.detectThreats(userAgent, 'USER_AGENT').length > 0) {
      suspicious.push('malicious_user_agent');
    }

    // Check for suspicious X-Forwarded headers
    const xForwarded = req.get('X-Forwarded-For') || '';
    if (xForwarded.includes('<') || xForwarded.includes('>') || xForwarded.includes('script')) {
      suspicious.push('malicious_x_forwarded');
    }

    // Check Referer header
    const referer = req.get('Referer') || '';
    if (this.detectThreats(referer, 'REFERER').length > 0) {
      suspicious.push('malicious_referer');
    }

    return suspicious;
  }

  private blockRequest(req: Request, res: Response, reason: string, details: string): void {
    const clientIP = this.getClientIP(req);
    
    // Log the attack attempt
    this.securityService.logSecurityEvent(
      'WAF_ATTACK_BLOCKED',
      {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        url: req.url,
        method: req.method,
        reason,
        details,
        query: req.query,
        body: req.body,
        headers: {
          'User-Agent': req.get('User-Agent'),
          'Referer': req.get('Referer'),
          'X-Forwarded-For': req.get('X-Forwarded-For'),
        },
        timestamp: new Date().toISOString(),
      },
      'warn'
    );

    // Set security headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Block the request
    res.status(HttpStatus.FORBIDDEN).json({
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Request blocked by security policy',
      error: 'WAF_BLOCKED',
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  private getClientIP(req: Request): string {
    const forwarded = req.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIP = req.get('X-Real-IP');
    if (realIP) {
      return realIP;
    }

    return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
  }
}
