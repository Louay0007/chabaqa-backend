import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  TooManyRequestsException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyService } from '../../api-key/api-key.service';

/**
 * Guards routes that require a valid API key.
 *
 * Consumers must include:
 *   X-API-Key: chabaqa_<key>
 *
 * On success, the validated key document is attached to `req.apiKey`
 * and the community ID to `req.communityId` for downstream use.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawKey = request.headers['x-api-key'] as string | undefined;

    if (!rawKey) {
      throw new UnauthorizedException(
        'API key is required. Provide it via the X-API-Key request header.',
      );
    }

    const validKey = await this.apiKeyService.validateApiKey(rawKey);

    if (!validKey) {
      // validateApiKey returns null both for invalid keys and rate-limited ones.
      // A more precise check can be added if needed; this keeps the guard simple.
      throw new UnauthorizedException('Invalid, expired, or rate-limited API key.');
    }

    // Attach to request for downstream use
    (request as any).apiKey = validKey;
    (request as any).communityId = validKey.communityId;

    return true;
  }
}
