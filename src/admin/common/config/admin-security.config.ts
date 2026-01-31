/**
 * Admin Security Configuration
 * Centralized security settings for the admin module
 * 
 * Validates: Requirements 7.3, 7.4, 8.5, 8.6
 */

/**
 * Rate Limit Configuration
 */
export const AdminRateLimitConfig = {
  /**
   * Default rate limit for standard admin operations
   */
  DEFAULT: {
    ttl: 60, // seconds
    limit: 100, // requests
  },

  /**
   * Strict rate limit for sensitive operations
   */
  STRICT: {
    ttl: 60,
    limit: 20,
  },

  /**
   * Rate limit for bulk operations
   */
  BULK_OPERATIONS: {
    ttl: 60,
    limit: 5,
  },

  /**
   * Rate limit for export operations
   */
  EXPORT: {
    ttl: 300, // 5 minutes
    limit: 10,
  },

  /**
   * Rate limit for authentication operations
   */
  AUTH: {
    ttl: 900, // 15 minutes
    limit: 5,
  },

  /**
   * Rate limit for analytics queries
   */
  ANALYTICS: {
    ttl: 60,
    limit: 50,
  },
};

/**
 * Session Configuration
 */
export const AdminSessionConfig = {
  /**
   * Session timeout in milliseconds
   */
  TIMEOUT: 3600000, // 1 hour

  /**
   * Refresh token expiration in milliseconds
   */
  REFRESH_TOKEN_EXPIRATION: 604800000, // 7 days

  /**
   * Maximum concurrent sessions per admin user
   */
  MAX_CONCURRENT_SESSIONS: 3,

  /**
   * Enable session tracking
   */
  TRACK_SESSIONS: true,
};

/**
 * Password Policy Configuration
 */
export const AdminPasswordPolicy = {
  /**
   * Minimum password length
   */
  MIN_LENGTH: 12,

  /**
   * Require uppercase letters
   */
  REQUIRE_UPPERCASE: true,

  /**
   * Require lowercase letters
   */
  REQUIRE_LOWERCASE: true,

  /**
   * Require numbers
   */
  REQUIRE_NUMBERS: true,

  /**
   * Require special characters
   */
  REQUIRE_SPECIAL_CHARS: true,

  /**
   * Password expiration in days
   */
  EXPIRATION_DAYS: 90,

  /**
   * Prevent password reuse (number of previous passwords to check)
   */
  PREVENT_REUSE_COUNT: 5,
};

/**
 * Two-Factor Authentication Configuration
 */
export const Admin2FAConfig = {
  /**
   * Enable 2FA for all admin users
   */
  REQUIRED: true,

  /**
   * 2FA code expiration in seconds
   */
  CODE_EXPIRATION: 300, // 5 minutes

  /**
   * Maximum 2FA attempts before lockout
   */
  MAX_ATTEMPTS: 3,

  /**
   * Lockout duration in seconds after max attempts
   */
  LOCKOUT_DURATION: 900, // 15 minutes
};

/**
 * IP Whitelist Configuration
 */
export const AdminIPWhitelistConfig = {
  /**
   * Enable IP whitelisting
   */
  ENABLED: false,

  /**
   * Allowed IP addresses or CIDR ranges
   */
  ALLOWED_IPS: [
    // Add allowed IPs here
    // '192.168.1.0/24',
    // '10.0.0.1',
  ],

  /**
   * Enable IP whitelist bypass for super admins
   */
  BYPASS_FOR_SUPER_ADMIN: true,
};

/**
 * Audit Log Configuration
 */
export const AdminAuditConfig = {
  /**
   * Enable audit logging
   */
  ENABLED: true,

  /**
   * Log all read operations
   */
  LOG_READ_OPERATIONS: true,

  /**
   * Log all write operations
   */
  LOG_WRITE_OPERATIONS: true,

  /**
   * Log failed authentication attempts
   */
  LOG_AUTH_FAILURES: true,

  /**
   * Audit log retention in days
   */
  RETENTION_DAYS: 365,

  /**
   * Enable real-time audit alerts
   */
  ENABLE_ALERTS: true,
};

/**
 * Security Monitoring Configuration
 */
export const AdminSecurityMonitoringConfig = {
  /**
   * Enable security monitoring
   */
  ENABLED: true,

  /**
   * Suspicious activity detection thresholds
   */
  THRESHOLDS: {
    /**
     * Maximum failed login attempts before alert
     */
    MAX_FAILED_LOGINS: 5,

    /**
     * Maximum API calls per minute before alert
     */
    MAX_API_CALLS_PER_MINUTE: 200,

    /**
     * Maximum bulk operations per hour before alert
     */
    MAX_BULK_OPS_PER_HOUR: 20,

    /**
     * Maximum data export operations per day before alert
     */
    MAX_EXPORTS_PER_DAY: 50,
  },

  /**
   * Alert notification channels
   */
  ALERT_CHANNELS: {
    EMAIL: true,
    WEBHOOK: false,
    SMS: false,
  },

  /**
   * Alert recipients (admin user IDs or emails)
   */
  ALERT_RECIPIENTS: [
    // Add security admin emails here
  ],
};

/**
 * CORS Configuration for Admin API
 */
export const AdminCORSConfig = {
  /**
   * Allowed origins
   */
  ALLOWED_ORIGINS: [
    process.env.ADMIN_FRONTEND_URL || 'http://localhost:3000',
  ],

  /**
   * Allowed methods
   */
  ALLOWED_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],

  /**
   * Allowed headers
   */
  ALLOWED_HEADERS: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Admin-Request-ID',
  ],

  /**
   * Enable credentials
   */
  CREDENTIALS: true,

  /**
   * Max age for preflight requests
   */
  MAX_AGE: 3600,
};

/**
 * Request Validation Configuration
 */
export const AdminRequestValidationConfig = {
  /**
   * Enable strict validation
   */
  STRICT_VALIDATION: true,

  /**
   * Whitelist unknown properties
   */
  WHITELIST: true,

  /**
   * Forbid non-whitelisted properties
   */
  FORBID_NON_WHITELISTED: true,

  /**
   * Transform payloads to DTO instances
   */
  TRANSFORM: true,

  /**
   * Enable detailed validation errors
   */
  DETAILED_ERRORS: true,
};

/**
 * Get all security configurations
 */
export const getAdminSecurityConfig = () => ({
  rateLimit: AdminRateLimitConfig,
  session: AdminSessionConfig,
  passwordPolicy: AdminPasswordPolicy,
  twoFactorAuth: Admin2FAConfig,
  ipWhitelist: AdminIPWhitelistConfig,
  audit: AdminAuditConfig,
  securityMonitoring: AdminSecurityMonitoringConfig,
  cors: AdminCORSConfig,
  requestValidation: AdminRequestValidationConfig,
});
