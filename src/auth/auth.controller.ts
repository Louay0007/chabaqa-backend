import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, UserAuthPayload, UserRefreshPayload } from './auth.service';
import { LoginDto } from '../dto-user/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from '../dto-user/register.dto';
import { ResetPasswordDto } from '../dto-user/reset-password.dto';
import { VerifyEmailOtpDto } from '../dto-user/verify-email-otp.dto';
import { ResendEmailOtpDto } from '../dto-user/resend-email-otp.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { CookieUtil } from '../common/utils/cookie.util';
import { PublicThrottlerGuard } from '../common/guards/public-throttler.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  private getFrontendBaseUrl(): string {
    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8080';
    return baseUrl.replace(/\/+$/, '');
  }

  private normalizeRedirectPath(rawPath?: string): string | null {
    if (!rawPath) return null;

    let path = rawPath;
    try {
      path = decodeURIComponent(rawPath);
    } catch {
      path = rawPath;
    }

    if (!path.startsWith('/') || path.startsWith('//')) {
      return null;
    }

    return path;
  }

  private defaultRedirectForRole(role?: string): string {
    const normalizedRole = role?.toLowerCase();
    if (normalizedRole === 'creator') return '/creator/dashboard';
    if (normalizedRole === 'admin') return '/admin';
    return '/explore';
  }

  @Post('login')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User Login',
    description: 'Authenticate user credentials and return access token.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        user: { type: 'object' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserAuthPayload> {
    const result = await this.authService.login(loginDto);
    if (result?.accessToken && result?.refreshToken) {
      CookieUtil.setTokenCookies(res as any, result.accessToken, result.refreshToken, !!result.rememberMe);
    }
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh user access token',
    description: 'Refresh a user access token using a refresh token from the request body or cookies.',
  })
  @ApiBody({ type: RefreshTokenDto, required: false })
  async refreshToken(
    @Body() body: { refreshToken?: string; refresh_token?: string } = {},
    @Req() req,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    success: true;
    data: UserRefreshPayload;
    access_token: string;
    accessToken: string;
    expires_in: number;
    rememberMe: boolean;
    user: any;
  }> {
    const refreshToken = (
      body?.refreshToken
      || body?.refresh_token
      || req.cookies?.refreshToken
      || req.cookies?.refresh_token
      || ''
    ).trim();

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token manquant');
    }

    const result = await this.authService.refreshToken(refreshToken);
    if (result?.accessToken) {
      CookieUtil.setAccessTokenCookie(res as any, result.accessToken, !!result.rememberMe);
    }

    return {
      success: true,
      data: result,
      access_token: result.access_token,
      accessToken: result.accessToken,
      expires_in: result.expires_in,
      rememberMe: result.rememberMe,
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({
    summary: 'Get Current User Profile',
    description: 'Get current authenticated user profile information.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Req() req) {
    try {
      // The user object is attached to the request by the JwtAuthGuard
      if (!req.user || !req.user._id) {
        throw new UnauthorizedException('Token non valide ou expiré');
      }

      const user = await this.authService.getUserById(req.user._id);

      if (!user) {
        throw new UnauthorizedException('Utilisateur non trouvé');
      }

      return {
        success: true,
        data: user,
        message: 'Token valide',
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Erreur lors de la récupération du profil');
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User Logout',
    description: 'Logout user (client should remove token).',
  })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    const accessToken = (
      req.headers?.authorization?.replace('Bearer ', '')
      || req.cookies?.accessToken
      || req.cookies?.access_token
      || ''
    ).trim();
    const refreshToken = (
      req.cookies?.refreshToken
      || req.cookies?.refresh_token
      || ''
    ).trim();

    await this.authService.logout(accessToken, refreshToken);

    CookieUtil.clearTokenCookies(res as any);

    return {
      success: true,
      message: 'Déconnexion réussie.',
    };
  }

  @Post('revoke-all-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke All Tokens',
    description: 'Revoke all user tokens (Placeholder for stateless JWT).',
  })
  @ApiResponse({ status: 200, description: 'Tokens revoked successfully' })
  async revokeAllTokens(@Req() req, @Res({ passthrough: true }) res: Response) {
    const accessToken = (
      req.headers?.authorization?.replace('Bearer ', '')
      || req.cookies?.accessToken
      || req.cookies?.access_token
      || ''
    ).trim();
    const refreshToken = (
      req.cookies?.refreshToken
      || req.cookies?.refresh_token
      || ''
    ).trim();

    try {
      if (accessToken) {
        await this.authService.revokeAllTokensFromAccessToken(accessToken);
      } else if (refreshToken) {
        await this.authService.revokeAllTokensFromRefreshToken(refreshToken);
      }
    } catch {
      // Keep endpoint idempotent.
    }
    CookieUtil.clearTokenCookies(res as any);

    return {
      success: true,
      message: 'Tous les tokens ont été révoqués.',
    };
  }

  @Get('signout')
  @ApiOperation({
    summary: 'Sign Out (browser redirect)',
    description:
      'Revokes auth tokens, clears all auth cookies, and redirects the browser to the signin page. Intended for window.location.href navigation from the frontend.',
  })
  @ApiResponse({ status: 302, description: 'Redirected to signin page after clearing cookies' })
  async signout(@Req() req, @Res() res: Response) {
    const accessToken = (
      req.headers?.authorization?.replace('Bearer ', '')
      || req.cookies?.accessToken
      || req.cookies?.access_token
      || ''
    ).trim();
    const refreshToken = (
      req.cookies?.refreshToken
      || req.cookies?.refresh_token
      || ''
    ).trim();

    // Revoke tokens — idempotent, errors swallowed intentionally
    await this.authService.logout(accessToken, refreshToken);

    // Clear all auth cookies
    CookieUtil.clearTokenCookies(res as any);

    // Redirect browser to the frontend signin page (locale-aware)
    const frontendBaseUrl = this.getFrontendBaseUrl();
    const localeCookie: string = (req.cookies?.NEXT_LOCALE || '').toLowerCase();
    const locale = (localeCookie === 'ar' || localeCookie === 'en') ? localeCookie : 'en';
    return res.redirect(`${frontendBaseUrl}/${locale}/signin`);
  }

  @Post('forgot-password')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forgot Password', description: 'Send password reset code to user email.' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string' } } } })
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset Password', description: 'Reset password using code sent to email.' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.email, body.verificationCode, body.newPassword);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Start Google OAuth 2.0 login' })
  async googleAuth() {
    // Redirects to Google for authentication
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth 2.0 callback' })
  async googleAuthCallback(@Req() req, @Res() res: Response) {
    try {
      const result = await (this.authService as any).loginWithGoogle(req.user);
      CookieUtil.setTokenCookies(res as any, result.accessToken, result.refreshToken, !!result.rememberMe);
      const frontendBaseUrl = this.getFrontendBaseUrl();

      const stateParam = Array.isArray(req.query?.state) ? req.query.state[0] : req.query?.state;
      const requestedRedirect = this.normalizeRedirectPath(stateParam);
      const redirectPath = requestedRedirect && requestedRedirect !== '/signin'
        ? requestedRedirect
        : this.defaultRedirectForRole(result?.user?.role);

      const userPayload = Buffer.from(JSON.stringify(result.user || {}), 'utf8').toString('base64url');
      const hashParams = new URLSearchParams({
        access_token: result.access_token,
        user: userPayload,
        redirect: redirectPath,
      });

      return res.redirect(`${frontendBaseUrl}/signin#${hashParams.toString()}`);
    } catch (error) {
      const frontendBaseUrl = this.getFrontendBaseUrl();
      return res.redirect(`${frontendBaseUrl}/signin?message=${encodeURIComponent('Google sign-in failed. Please try again.')}`);
    }
  }

  @Post('google/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mobile Google Sign-In' })
  @ApiBody({ schema: { type: 'object', properties: { idToken: { type: 'string' } } } })
  async googleMobileAuth(@Body() body: { idToken: string }) {
    return this.authService.loginWithGoogleMobile(body.idToken);
  }

  @Post('register')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User Registration (Send OTP)' })
  @ApiBody({ type: RegisterDto })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('register-creator')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Creator Registration (Send OTP)' })
  @ApiBody({ type: RegisterDto })
  async registerCreator(@Body() registerDto: RegisterDto) {
    return this.authService.registerCreator(registerDto);
  }

  @Post('register/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Registration OTP and Create Account' })
  @ApiBody({ type: VerifyEmailOtpDto })
  async verifyRegistrationOtp(@Body() body: VerifyEmailOtpDto) {
    return this.authService.verifyRegistrationOtp(body.email, body.verificationCode);
  }

  @Post('register/resend-otp')
  @UseGuards(PublicThrottlerGuard)
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend Registration OTP' })
  @ApiBody({ type: ResendEmailOtpDto })
  async resendRegistrationOtp(@Body() body: ResendEmailOtpDto) {
    return this.authService.resendRegistrationOtp(body.email);
  }
}
