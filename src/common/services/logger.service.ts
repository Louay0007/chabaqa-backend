import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

/**
 * Production-optimized Logger Service
 * - Minimal logs in production
 * - Detailed logs in development
 * - All errors are always logged
 */
@Injectable()
export class Logger implements NestLoggerService {
    private isDevelopment: boolean;

    constructor() {
        this.isDevelopment = process.env.NODE_ENV !== 'production';
    }

    /**
     * Log regular messages (only in development)
     */
    log(message: string, context?: string) {
        if (this.isDevelopment) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] ${context ? `[${context}] ` : ''}${message}`);
        }
    }

    /**
     * Log errors (always logged in all environments)
     */
    error(message: string, trace?: string, context?: string) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ${context ? `[${context}] ` : ''}ERROR: ${message}`);
        if (trace) {
            console.error(trace);
        }
    }

    /**
     * Log warnings (always logged in all environments)
     */
    warn(message: string, context?: string) {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] ${context ? `[${context}] ` : ''}WARN: ${message}`);
    }

    /**
     * Debug logs (only in development)
     */
    debug(message: string, context?: string) {
        if (this.isDevelopment) {
            const timestamp = new Date().toISOString();
            console.debug(`[${timestamp}] ${context ? `[${context}] ` : ''}DEBUG: ${message}`);
        }
    }

    /**
     * Verbose logs (only in development)
     */
    verbose(message: string, context?: string) {
        if (this.isDevelopment) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] ${context ? `[${context}] ` : ''}VERBOSE: ${message}`);
        }
    }

    /**
     * Log HTTP requests (simplified in production)
     */
    http(method: string, url: string, statusCode?: number, origin?: string) {
        if (this.isDevelopment) {
            const timestamp = new Date().toISOString();
            console.log(`📥 [${timestamp}] ${method} ${url}${statusCode ? ` - ${statusCode}` : ''}${origin ? ` - Origin: ${origin}` : ''}`);
        }
    }

    /**
     * Log critical startup information (always logged)
     */
    critical(message: string) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 🚀 ${message}`);
    }
}
