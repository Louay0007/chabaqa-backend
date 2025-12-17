import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponseDto, ErrorDetail } from '../dto/error-response.dto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';
    let details: ErrorDetail[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        
        // Handle validation errors
        if (exception instanceof BadRequestException && Array.isArray(responseObj.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Validation failed';
          details = responseObj.message.map((msg: string) => ({
            message: msg,
          }));
        } else {
          message = responseObj.message || exception.message;
          code = this.getErrorCode(status);
        }
      } else {
        message = exception.message;
        code = this.getErrorCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      code = 'INTERNAL_SERVER_ERROR';
    }

    // Log error (use proper logger in production)
    console.error(
      `[${new Date().toISOString()}] ${request.method} ${request.url} - ${status}: ${message}`,
      exception instanceof Error ? exception.stack : exception,
    );

    // Create standardized error response
    const errorResponse = new ErrorResponseDto(code, message, details.length > 0 ? details : undefined);

    response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number): string {
    const errorCodes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };

    return errorCodes[status] || 'UNKNOWN_ERROR';
  }
} 