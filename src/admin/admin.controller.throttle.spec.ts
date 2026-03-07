import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminAuthGuard } from './common/guards/admin-auth.guard';

describe('AdminController throttling', () => {
  let app: INestApplication;

  const adminServiceMock = {
    loginAdmin: jest.fn().mockResolvedValue({ requires2FA: true, message: 'ok' }),
    verify2FA: jest.fn().mockResolvedValue({ access_token: 'token', refresh_token: 'refresh', admin: { role: 'admin' }, rememberMe: false }),
    forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
    hasAnyAdminAccount: jest.fn().mockResolvedValue(true),
    getAdminSessionForRequestUser: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 1000 }])],
      controllers: [AdminController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: AdminService, useValue: adminServiceMock },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        { provide: AdminGuard, useValue: { canActivate: () => true } },
        { provide: AdminAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['/api/admin/login', { email: 'admin@example.com', password: 'secret' }, 5],
    ['/api/admin/verify-2fa', { email: 'admin@example.com', verificationCode: '123456' }, 3],
    ['/api/admin/forgot-password', { email: 'admin@example.com' }, 3],
    ['/api/admin/reset-password', { email: 'admin@example.com', verificationCode: '123456', newPassword: 'secret123' }, 3],
  ])('returns 429 after limit is exceeded for %s', async (path, payload, limit) => {
    const ip = `10.1.0.${Math.floor(Math.random() * 200) + 1}`;

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
