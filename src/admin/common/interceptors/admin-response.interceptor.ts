import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard Admin API Response Format
 */
export class AdminApiResponse<T> {
  @ApiProperty({ example: true, description: 'Indicates if the request was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response data' })
  data?: T;

  @ApiProperty({ example: 'Operation completed successfully', description: 'Response message', required: false })
  message?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Response timestamp' })
  timestamp: string;

  constructor(success: boolean, data?: T, message?: string) {
    this.success = success;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Admin Response Interceptor
 * Standardizes all admin API responses to follow consistent format
 * 
 * Validates: Requirements 8.1, 8.3
 */
@Injectable()
export class AdminResponseInterceptor<T> implements NestInterceptor<T, AdminApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<AdminApiResponse<T>> {
    return next.handle().pipe(
      map(data => {
        // If response already has success field, it's already formatted
        if (data && typeof data === 'object' && 'success' in data) {
          // Ensure timestamp is present
          if (!('timestamp' in data)) {
            return {
              ...data,
              timestamp: new Date().toISOString()
            };
          }
          return data;
        }

        // Otherwise, wrap in standard format
        return new AdminApiResponse(true, data);
      })
    );
  }
}
