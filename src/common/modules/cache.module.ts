import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from '../services/cache.service';
import * as redisStore from 'cache-manager-redis-store';

const logger = new Logger('CacheModule');

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisEnabled = configService.get<string>('REDIS_ENABLED') === 'true';
        
        if (redisEnabled) {
          const redisHost = configService.get<string>('REDIS_HOST', '127.0.0.1');
          const redisPort = configService.get<number>('REDIS_PORT', 6379);
          const redisPassword = configService.get<string>('REDIS_PASSWORD', '');
          const redisDb = configService.get<number>('REDIS_DB', 0);
          const redisTtl = configService.get<number>('REDIS_TTL', 300);
          const redisTtlMs = redisTtl * 1000;
          
          logger.log(`🔴 Redis cache enabled - connecting to ${redisHost}:${redisPort}`);
          
          return {
            store: redisStore,
            host: redisHost,
            port: redisPort,
            password: redisPassword || undefined,
            db: redisDb,
            ttl: redisTtlMs,
            isGlobal: true,
          };
        }
        
        logger.log('💾 Using in-memory cache (Redis disabled)');
        return {
          ttl: configService.get<number>('REDIS_TTL', 300) * 1000,
          max: 1000, // Maximum number of items in cache
          isGlobal: true,
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class CacheModule {}
