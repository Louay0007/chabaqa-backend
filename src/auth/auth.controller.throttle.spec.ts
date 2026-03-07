import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PublicThrottlerGuard } from '../common/guards/public-throttler.guard';

describe('AuthController throttling', () => {
  let app: INestApplication;

  const authServiceMock = {
    login: jest.fn().mockResolvedValue({ accessToken: 'token', user: { role: 'user' } }),
    forgotPassword: jest.fn().mockResolvedValue({ success: true }),
    resetPassword: jest.fn().mockResolvedValue({ success: true }),
    register: jest.fn().mockResolvedValue({ success: true }),
    registerCreator: jest.fn().mockResolvedValue({ success: true }),
    resendRegistrationOtp: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 1000 }])],
      controllers: [AuthController],
      providers: [
        PublicThrottlerGuard,
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['login', '/auth/login', { email: 'user@example.com', password: 'secret' }, 5],
    ['register', '/auth/register', { email: 'user@example.com', password: 'secret', name: 'User' }, 3],
    ['register-creator', '/auth/register-creator', { email: 'creator@example.com', password: 'secret', name: 'Creator' }, 3],
    ['register/resend-otp', '/auth/register/resend-otp', { email: 'user@example.com' }, 3],
    ['forgot-password', '/auth/forgot-password', { email: 'user@example.com' }, 3],
    ['reset-password', '/auth/reset-password', { email: 'user@example.com', verificationCode: '123456', newPassword: 'secret123' }, 3],
  ])('returns 429 after limit is exceeded for %s', async (_label, path, payload, limit) => {
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      await request(app.getHttpServer())
        .post(path)
        .set('X-Forwarded-For', ip)
        .send(payload)
        .expect((res) => {
          expect(res.status).toBeLessThan(429);
        });
    }

    await request(app.getHttpServer())
      .post(path)
      .set('X-Forwarded-For', ip)
      .send(payload)
      .expect(429);
  });
});
