import {
  Injectable,
  NestMiddleware,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as mongoSanitize from 'express-mongo-sanitize';
import { SecurityService } from '../services/security.service';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);

  constructor(private securityService: SecurityService) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Apply security headers with Helmet
      this.applySecurityHeaders(req, res);

      // Sanitize input to prevent NoSQL injection
      this.sanitizeInput(req);

      // Log suspicious activities
      this.logSuspiciousActivity(req);

      // Validate request
      this.validateRequest(req);

      next();
    } catch (error) {
      this.logger.error('Security middleware error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Security validation failed',
          error: 'SECURITY_ERROR',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private applySecurityHeaders(req: Request, res: Response) {
    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://api.stripe.com https://js.stripe.com wss://",
        "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
      ].join('; ')
    );

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Remove server information
    res.removeHeader('X-Powered-By');
    res.setHeader('Server', 'Shabaka-Server');

    // HSTS (HTTP Strict Transport Security) - only in production
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
  }

  private sanitizeInput(req: Request) {
    // Sanitize query parameters, body, and params
    ['query', 'body', 'params'].forEach((prop) => {
      if (req[prop] && typeof req[prop] === 'object') {
        this.sanitizeObject(req[prop]);
      }
    });

    // Sanitize headers
    if (req.headers) {
      this.sanitizeObject(req.headers);
    }
  }

  private sanitizeObject(obj: any) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = this.securityService.sanitizeInput(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  private logSuspiciousActivity(req: Request) {
    const ip = this.getClientIP(req);
    const userAgent = req.get('User-Agent') || '';
    const suspiciousPatterns = [
      /\.\./, // Directory traversal
      /<script/i, // XSS attempts
      /javascript:/i, // JavaScript injection
      /on\w+\s*=/i, // Event handlers
      /eval\(/i, // Code injection
      /union\s+select/i, // SQL injection
      /\$\w+\$/i, // MongoDB operators
    ];

    const url = req.url;
    const isSuspicious = suspiciousPatterns.some(pattern =>
      pattern.test(url) || pattern.test(JSON.stringify(req.query)) || pattern.test(JSON.stringify(req.body))
    );

    if (isSuspicious) {
      this.securityService.logSecurityEvent(
        'SUSPICIOUS_ACTIVITY_DETECTED',
        {
          ip,
          userAgent,
          url,
          method: req.method,
          query: req.query,
          body: req.body,
          headers: {
            'X-Forwarded-For': req.get('X-Forwarded-For'),
            'X-Real-IP': req.get('X-Real-IP'),
            'User-Agent': userAgent,
          },
        },
        'warn'
      );
    }

    // Log API key usage (if applicable)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      this.logger.debug(`API request from IP: ${ip}, URL: ${url}`);
    }
  }

  private validateRequest(req: Request) {
    const ip = this.getClientIP(req);

    // Validate IP format
    if (ip !== 'unknown' && !this.securityService.isValidIP(ip)) {
      this.securityService.logSecurityEvent(
        'INVALID_IP_FORMAT',
        { ip, url: req.url },
        'warn'
      );
    }

    // Check for trusted proxy
    if (!this.securityService.isTrustedProxy(ip)) {
      // Additional validation for untrusted sources
      const userAgent = req.get('User-Agent') || '';
      if (!userAgent || userAgent.length < 10) {
        this.securityService.logSecurityEvent(
          'EMPTY_USER_AGENT',
          { ip, url: req.url },
          'warn'
        );
      }
    }
  }

  private getClientIP(req: Request): string {
    // Check X-Forwarded-For header (behind proxy)
    const forwarded = req.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // Check X-Real-IP header
    const realIP = req.get('X-Real-IP');
    if (realIP) {
      return realIP;
    }

    // Fallback to connection remote address
    return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  }
}
