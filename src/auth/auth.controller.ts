import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from '../dto-user/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from '../dto-user/register.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
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
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User Logout',
    description: 'Logout user (client should remove token).',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout() {
    return {
      success: true,
      message: 'Déconnexion réussie.',
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forgot Password', description: 'Send password reset code to user email.' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string' } } } })
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset Password', description: 'Reset password using code sent to email.' })
  @ApiBody({ type: require('../dto-user/reset-password.dto').ResetPasswordDto })
  async resetPassword(@Body() body: import('../dto-user/reset-password.dto').ResetPasswordDto) {
    return this.authService.resetPassword(body.email, body.verificationCode, body.newPassword);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Start Google OAuth 2.0 login' })
  async googleAuth() {
    // Redirects to Google for authentication
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth 2.0 callback' })
  async googleAuthCallback(@Req() req) {
    const result = await (this.authService as any).loginWithGoogle(req.user);
    return result;
  }

  @Post('google/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mobile Google Sign-In' })
  @ApiBody({ schema: { type: 'object', properties: { idToken: { type: 'string' } } } })
  async googleMobileAuth(@Body() body: { idToken: string }) {
    return this.authService.loginWithGoogleMobile(body.idToken);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'User Registration' })
  @ApiBody({ type: RegisterDto })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('register-creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creator Registration' })
  @ApiBody({ type: RegisterDto })
  async registerCreator(@Body() registerDto: RegisterDto) {
    return this.authService.registerCreator(registerDto);
  }
}
