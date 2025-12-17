import { Module, Global } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SecurityService } from '../services/security.service';
import { IPReputationService } from '../services/ip-reputation.service';
import { BotDetectionService } from '../services/bot-detection.service';
import { FileValidationService } from '../services/file-validation.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { IPReputationGuard } from '../guards/ip-reputation.guard';
import { BotDetectionGuard } from '../guards/bot-detection.guard';
import { SecurityMiddleware } from '../middleware/security.middleware';
import { WAFMiddleware } from '../middleware/waf.middleware';
import { CaptchaController } from '../controllers/captcha.controller';
import { CacheModule } from './cache.module';

@Global()
@Module({
  imports: [
    CacheModule,
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100, // 100 requests per minute
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 1000, // 1000 requests per hour
      },
      {
        name: 'strict',
        ttl: 60000,
        limit: 20, // 20 requests per minute for auth endpoints
      },
    ]),
  ],
  controllers: [CaptchaController],
  providers: [
    SecurityService, 
    IPReputationService, 
    BotDetectionService,
    FileValidationService,
    RateLimitGuard, 
    IPReputationGuard, 
    BotDetectionGuard,
    SecurityMiddleware,
    WAFMiddleware
  ],
  exports: [
    SecurityService, 
    IPReputationService, 
    BotDetectionService,
    FileValidationService,
    RateLimitGuard, 
    IPReputationGuard, 
    BotDetectionGuard,
    SecurityMiddleware,
    WAFMiddleware
  ],
})
export class SecurityModule {}
