import { HttpException, HttpStatus } from '@nestjs/common';
import { AdminErrorDetail } from '../filters/admin-exception.filter';

/**
 * Base Admin Exception
 * All admin-specific exceptions extend this class
 */
export class AdminException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus,
    public readonly code: string,
    public readonly details?: AdminErrorDetail[]
  ) {
    super(
      {
        code,
        message,
        details,
      },
      status
    );
  }
}

/**
 * Admin Authorization Exception
 * Thrown when admin user lacks required permissions
 * 
 * Validates: Requirements 7.3, 8.5
 */
export class AdminAuthorizationException extends AdminException {
  constructor(action: string, resource: string, requiredPermissions?: string[]) {
    const message = `Insufficient permissions to ${action} ${resource}`;
    const details: AdminErrorDetail[] = requiredPermissions
      ? [
          {
            field: 'permissions',
            message: `Required permissions: ${requiredPermissions.join(', ')}`,
          },
        ]
      : [];

    super(message, HttpStatus.FORBIDDEN, 'ADMIN_INSUFFICIENT_PERMISSIONS', details);
  }
}

/**
 * Admin Validation Exception
 * Thrown when input validation fails
 * 
 * Validates: Requirements 8.2, 9.6
 */
export class AdminValidationException extends AdminException {
  constructor(errors: AdminErrorDetail[]) {
    super('Validation failed', HttpStatus.BAD_REQUEST, 'ADMIN_VALIDATION_ERROR', errors);
  }
}

/**
 * Admin Resource Not Found Exception
 * Thrown when requested resource doesn't exist
 * 
 * Validates: Requirements 8.1, 8.3
 */
export class AdminResourceNotFoundException extends AdminException {
  constructor(resource: string, id: string) {
    const message = `${resource} with ID ${id} not found`;
    const details: AdminErrorDetail[] = [
      {
        field: 'id',
        message: `${resource} not found`,
        value: id,
      },
    ];

    super(message, HttpStatus.NOT_FOUND, 'ADMIN_RESOURCE_NOT_FOUND', details);
  }
}

/**
 * Admin Conflict Exception
 * Thrown when operation conflicts with current state
 * 
 * Validates: Requirements 8.1, 8.3
 */
export class AdminConflictException extends AdminException {
  constructor(resource: string, reason: string, conflictingValue?: any) {
    const message = `${resource} conflict: ${reason}`;
    const details: AdminErrorDetail[] = conflictingValue
      ? [
          {
            message: reason,
            value: conflictingValue,
          },
        ]
      : [{ message: reason }];

    super(message, HttpStatus.CONFLICT, 'ADMIN_CONFLICT', details);
  }
}

/**
 * Admin Operation Failed Exception
 * Thrown when an operation fails for business logic reasons
 * 
 * Validates: Requirements 8.1, 8.3
 */
export class AdminOperationFailedException extends AdminException {
  constructor(operation: string, reason: string, details?: AdminErrorDetail[]) {
    const message = `Operation '${operation}' failed: ${reason}`;
    super(message, HttpStatus.BAD_REQUEST, 'ADMIN_OPERATION_FAILED', details);
  }
}

/**
 * Admin Rate Limit Exception
 * Thrown when rate limit is exceeded
 * 
 * Validates: Requirements 8.6
 */
export class AdminRateLimitException extends AdminException {
  constructor(limit: number, windowSeconds: number) {
    const message = `Rate limit exceeded: ${limit} requests per ${windowSeconds} seconds`;
    const details: AdminErrorDetail[] = [
      {
        field: 'rateLimit',
        message: `Maximum ${limit} requests allowed per ${windowSeconds} seconds`,
      },
    ];

    super(message, HttpStatus.TOO_MANY_REQUESTS, 'ADMIN_RATE_LIMIT_EXCEEDED', details);
  }
}

/**
 * Admin Bulk Operation Exception
 * Thrown when bulk operation encounters errors
 * 
 * Validates: Requirements 9.5
 */
export class AdminBulkOperationException extends AdminException {
  constructor(
    totalItems: number,
    successCount: number,
    failureCount: number,
    failures: Array<{ itemId: string; error: string }>
  ) {
    const message = `Bulk operation completed with ${failureCount} failures out of ${totalItems} items`;
    const details: AdminErrorDetail[] = failures.map(failure => ({
      field: failure.itemId,
      message: failure.error,
    }));

    super(message, HttpStatus.PARTIAL_CONTENT, 'ADMIN_BULK_OPERATION_PARTIAL_FAILURE', details);
  }
}

/**
 * Admin External Service Exception
 * Thrown when external service integration fails
 * 
 * Validates: Requirements 10.3, 10.4, 10.5, 10.6
 */
export class AdminExternalServiceException extends AdminException {
  constructor(serviceName: string, operation: string, reason: string) {
    const message = `External service '${serviceName}' failed during '${operation}': ${reason}`;
    const details: AdminErrorDetail[] = [
      {
        field: 'service',
        message: `${serviceName} integration error`,
        value: operation,
      },
    ];

    super(message, HttpStatus.SERVICE_UNAVAILABLE, 'ADMIN_EXTERNAL_SERVICE_ERROR', details);
  }
}

/**
 * Admin Database Exception
 * Thrown when database operation fails
 * 
 * Validates: Requirements 10.2
 */
export class AdminDatabaseException extends AdminException {
  constructor(operation: string, reason: string) {
    const message = `Database operation '${operation}' failed: ${reason}`;
    const details: AdminErrorDetail[] = [
      {
        field: 'database',
        message: reason,
      },
    ];

    super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'ADMIN_DATABASE_ERROR', details);
  }
}
