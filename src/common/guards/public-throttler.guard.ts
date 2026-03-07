import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PublicThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(PublicThrottlerGuard.name);

  protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest();

    this.logger.warn(
      `Public auth rate limit exceeded for ${request.method} ${request.url}`,
    );

    throw new HttpException({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many attempts. Please wait a moment before trying again.',
      messageFr: 'Trop de tentatives. Veuillez patienter un moment avant de reessayer.',
    }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
