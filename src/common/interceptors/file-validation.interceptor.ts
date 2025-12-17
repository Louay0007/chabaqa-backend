import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FileValidationService } from '../services/file-validation.service';

@Injectable()
export class FileValidationInterceptor implements NestInterceptor {
  protected readonly logger = new Logger(FileValidationInterceptor.name);

  constructor(
    protected fileValidationService: FileValidationService,
    protected allowedTypes?: string[],
    protected maxSize?: number,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    
 
    if (request.file || request.files) {
      const files = request.files || [request.file];
      for (const file of files) {
        if (file) {
          const validation = await this.fileValidationService.validateFile(
            file,
            this.allowedTypes,
            this.maxSize
          );

          if (!validation.isValid) {
            this.logger.warn(`File validation failed: ${validation.reason} for file: ${file.originalname}`);
            throw new BadRequestException({
              message: 'File validation failed',
              error: 'INVALID_FILE',
              reason: validation.reason,
              filename: file.originalname,
            });
          }

          // Replace original filename with sanitized version
          if (validation.sanitizedFilename) {
            file.filename = validation.sanitizedFilename;
          }
        }
      }
    }

    return next.handle();
  }
}

// Usage example:
// @UseInterceptors(FileValidationInterceptor)
// or inject with custom parameters in your controller
