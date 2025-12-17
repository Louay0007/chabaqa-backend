import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SuccessResponseDto } from '../dto/success-response.dto';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponseDto<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessResponseDto<T>> {
    return next.handle().pipe(
      map(data => {
        // If data is already wrapped in our response format, return as is
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Wrap the response in our standard format
        return new SuccessResponseDto(data);
      }),
    );
  }
}
