import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Admin Error Detail
 */
export class AdminErrorDetail {
  @ApiProperty({ example: 'email', description: 'Field that caused the error', required: false })
  field?: string;

  @ApiProperty({ example: 'Invalid email format', description: 'Error message' })
  message: string;

  @ApiProperty({ example: 'user@example.com', description: 'Invalid value', required: false })
  value?: any;
}

/**
 * Admin Error Data
 */
export class AdminErrorData {
  @ApiProperty({ example: 'VALIDATION_ERROR', description: 'Error code' })
  code: string;

  @ApiProperty({ example: 'Validation failed', description: 'Error message' })
  message: string;

  @ApiProperty({ type: [AdminErrorDetail], description: 'Detailed error information', required: false })
  details?: AdminErrorDetail[];

  @ApiProperty({ example: '/api/admin/users', description: 'Request path', required: false })
  path?: string;

  @ApiProperty({ example: 'POST', description: 'HTTP method', required: false })
  method?: string;
}

/**
 * Admin Error Response
 */
export class AdminErrorResponse {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ type: AdminErrorData })
  error: AdminErrorData;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;

  constructor(code: string, message: string, details?: AdminErrorDetail[], path?: string, method?: string) {
    this.success = false;
    this.error = {
      code,
      message,
      details,
      path,
      method,
    };
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Admin Exception Filter
 * Provides comprehensive error handling for admin module with standardized responses
 * 
 * Validates: Requirements 8.1, 8.2, 8.3
 */
@Catch()
export class AdminExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AdminExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';
    let details: AdminErrorDetail[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        
        // Handle validation errors from class-validator
        if (exception instanceof BadRequestException && Array.isArray(responseObj.message)) {
          code = 'ADMIN_VALIDATION_ERROR';
          message = 'Validation failed';
          details = this.parseValidationErrors(responseObj.message);
        } 
        // Handle custom error responses
        else if (responseObj.code) {
          code = responseObj.code;
          message = responseObj.message || exception.message;
          details = responseObj.details || [];
        }
        // Handle standard HTTP exceptions
        else {
          message = responseObj.message || exception.message;
          code = this.getErrorCode(exception);
        }
      } else {
        message = exception.message;
        code = this.getErrorCode(exception);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      code = 'INTERNAL_SERVER_ERROR';
      
      // Log stack trace for internal errors
      this.logger.error(
        `Internal error: ${message}`,
        exception.stack,
        `${request.method} ${request.url}`
      );
    }

    // Log error with context
    this.logger.error(
      `[${new Date().toISOString()}] ${request.method} ${request.url} - ${status}: ${message}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    // Create standardized error response
    const errorResponse = new AdminErrorResponse(
      code,
      message,
      details.length > 0 ? details : undefined,
      request.url,
      request.method
    );

    response.status(status).json(errorResponse);
  }

  /**
   * Parse validation errors from class-validator
   */
  private parseValidationErrors(messages: any[]): AdminErrorDetail[] {
    return messages.map(msg => {
      if (typeof msg === 'string') {
        // Parse string format: "field must be valid"
        const parts = msg.split(' ');
        const field = parts[0];
        return {
          field,
          message: msg,
        };
      } else if (typeof msg === 'object' && msg.property) {
        // Parse object format from class-validator
        const constraints = msg.constraints || {};
        const constraintMessages = Object.values(constraints);
        return {
          field: msg.property,
          message: constraintMessages[0] as string || 'Validation failed',
          value: msg.value,
        };
      }
      return {
        message: String(msg),
      };
    });
  }

  /**
   * Get error code based on exception type
   */
  private getErrorCode(exception: HttpException): string {
    if (exception instanceof BadRequestException) {
      return 'ADMIN_BAD_REQUEST';
    } else if (exception instanceof UnauthorizedException) {
      return 'ADMIN_UNAUTHORIZED';
    } else if (exception instanceof ForbiddenException) {
      return 'ADMIN_FORBIDDEN';
    } else if (exception instanceof NotFoundException) {
      return 'ADMIN_NOT_FOUND';
    } else if (exception instanceof ConflictException) {
      return 'ADMIN_CONFLICT';
    }

    const status = exception.getStatus();
    const errorCodes: Record<number, string> = {
      400: 'ADMIN_BAD_REQUEST',
      401: 'ADMIN_UNAUTHORIZED',
      403: 'ADMIN_FORBIDDEN',
      404: 'ADMIN_NOT_FOUND',
      409: 'ADMIN_CONFLICT',
      422: 'ADMIN_UNPROCESSABLE_ENTITY',
      429: 'ADMIN_TOO_MANY_REQUESTS',
      500: 'ADMIN_INTERNAL_SERVER_ERROR',
    };

    return errorCodes[status] || 'ADMIN_UNKNOWN_ERROR';
  }
}
