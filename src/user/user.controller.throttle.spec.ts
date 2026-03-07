import { Controller, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PublicThrottlerGuard } from '../common/guards/public-throttler.guard';

@Controller('user')
class TestUserThrottleController {
  @Post('forgot-password')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  forgotPassword() {
    return { success: true };
  }

  @Post('reset-password')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  resetPassword() {
    return { success: true };
  }
}

describe('User public auth throttling', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 1000 }])],
      controllers: [TestUserThrottleController],
      providers: [PublicThrottlerGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['/user/forgot-password', { email: 'user@example.com' }],
    ['/user/reset-password', { email: 'user@example.com', verificationCode: '123456', newPassword: 'secret123' }],
  ])('returns 429 after limit is exceeded for %s', async (path, payload) => {
    const ip = `10.2.0.${Math.floor(Math.random() * 200) + 1}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post(path)
        .set('X-Forwarded-For', ip)
        .send(payload)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(path)
      .set('X-Forwarded-For', ip)
      .send(payload)
      .expect(429);
  });
});
