import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService token flow', () => {
  const buildService = () => {
    const userModel = {
      findById: jest.fn(),
    };
    const jwtService = {
      verify: jest.fn(),
      sign: jest.fn(),
    };
    const tokenBlacklistService = {
      isTokenRevoked: jest.fn(),
      revokeTokenFromJWT: jest.fn(),
    };

    const service = new AuthService(
      userModel as any,
      {} as any,
      jwtService as any,
      {} as any,
      { trackUserLoginForAllCommunities: jest.fn() } as any,
      { ensureAbsoluteUrl: (value: string) => value } as any,
      tokenBlacklistService as any,
    );

    return { service, userModel, jwtService, tokenBlacklistService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes a user access token after validating the refresh token', async () => {
    const { service, userModel, jwtService, tokenBlacklistService } = buildService();
    jwtService.verify.mockReturnValue({
      sub: '507f1f77bcf86cd799439011',
      email: 'user@example.com',
      role: 'user',
      jti: 'refresh-jti',
      iat: 10,
    });
    tokenBlacklistService.isTokenRevoked.mockResolvedValue(false);
    userModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        role: 'user',
        name: 'User',
        profile_picture: '',
        photo_profil: '',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
    });
    jwtService.sign.mockReturnValue('new-access-token');

    await expect(service.refreshToken('refresh-token')).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'new-access-token',
        access_token: 'new-access-token',
        expires_in: 7200,
        user: expect.objectContaining({
          email: 'user@example.com',
        }),
      }),
    );
    expect(tokenBlacklistService.isTokenRevoked).toHaveBeenCalledWith(
      'refresh-jti',
      '507f1f77bcf86cd799439011',
    );
  });

  it('rejects revoked refresh tokens', async () => {
    const { service, jwtService, tokenBlacklistService } = buildService();
    jwtService.verify.mockReturnValue({
      sub: '507f1f77bcf86cd799439011',
      jti: 'refresh-jti',
      iat: 10,
    });
    tokenBlacklistService.isTokenRevoked.mockResolvedValue(true);

    await expect(service.refreshToken('revoked-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes both access and refresh tokens during logout', async () => {
    const { service } = buildService();
    const revokeTokenSpy = jest.spyOn(service, 'revokeToken').mockResolvedValue();
    const revokeRefreshTokenSpy = jest.spyOn(service, 'revokeRefreshToken').mockResolvedValue();

    await expect(service.logout('access-token', 'refresh-token')).resolves.toEqual({
      message: 'Déconnexion réussie.',
      revokedTokens: 2,
    });
    expect(revokeTokenSpy).toHaveBeenCalledWith('access-token');
    expect(revokeRefreshTokenSpy).toHaveBeenCalledWith('refresh-token');
  });
});
