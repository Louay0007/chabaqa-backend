import { Controller, Post, Body, HttpStatus, Res, ConflictException, HttpCode, Req, UseGuards, Delete, ForbiddenException, Get, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiExtraModels } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { CreateAdminDto } from '../dto-admin/create-admin.dto';
import { AdminLoginDto } from '../dto-admin/login.dto';
import { AdminLoginResponseDto } from '../dto-admin/login-response.dto';
import { CookieUtil } from '../common/utils/cookie.util';
import { AdminVerify2FADto } from '../dto-admin/verify-2fa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminForgotPasswordDto } from '../dto-admin/forgot-password.dto';
import { AdminResetPasswordDto } from '../dto-admin/reset-password.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminAuthGuard } from './common/guards/admin-auth.guard';
import { UpdateAdminProfileDto } from '../dto-admin/update-admin-profile.dto';
import { ChangeAdminPasswordDto } from '../dto-admin/change-admin-password.dto';
import { UpdateAdminPreferencesDto } from '../dto-admin/update-admin-preferences.dto';
import { AdminNotificationsService } from './admin-notifications.service';

@ApiTags('Admin')
@ApiExtraModels(
  AdminLoginDto,
  AdminVerify2FADto,
  AdminForgotPasswordDto,
  AdminResetPasswordDto,
  AdminLoginResponseDto,
  UpdateAdminProfileDto,
  ChangeAdminPasswordDto,
  UpdateAdminPreferencesDto,
)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminNotificationsService: AdminNotificationsService,
  ) {}

  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bootstrap first admin account',
    description: 'Creates the first admin account only when no admin exists and a bootstrap key is provided.',
    tags: ['Admin'],
  })
  async bootstrapAdmin(@Req() req, @Res() response, @Body() createAdminDto: CreateAdminDto) {
    const hasAdmins = await this.adminService.hasAnyAdminAccount();
    if (hasAdmins) {
      throw new ForbiddenException('Bootstrap endpoint is disabled after first admin creation');
    }

    const expectedBootstrapKey = (process.env.ADMIN_BOOTSTRAP_KEY || '').trim();
    const providedBootstrapKey = String(req.headers['x-admin-bootstrap-key'] || '').trim();

    if (!expectedBootstrapKey || !providedBootstrapKey || providedBootstrapKey !== expectedBootstrapKey) {
      throw new ForbiddenException('Invalid bootstrap key');
    }

    const admin = await this.adminService.createAdmin(createAdminDto);
    return response.status(HttpStatus.CREATED).json({
      success: true,
      message: 'Admin created successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        createdAt: admin.createdAt,
      },
    });
  }

  // create admin
  @Post('create')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Create Admin Account',
    description: 'Create a new admin account in the system.',
    tags: ['Admin']
  })
  @ApiBody({
    type: CreateAdminDto,
    description: 'Admin account creation data',
    examples: {
      'Create Admin': {
        summary: 'Create new admin account',
        value: {
          name: 'Admin User',
          email: 'admin@shabaka.com',
          password: 'adminpassword123',
          role: 'admin'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Admin created successfully',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'Admin created successfully',
          admin: {
            _id: '64a1b2c3d4e5f6789abcdef0',
            name: 'Admin User',
            email: 'admin@shabaka.com',
            role: 'admin',
            createdAt: '2023-07-01T10:00:00.000Z'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Email or name already exists',
    content: {
      'application/json': {
        example: {
          success: false,
          status: 409,
          message: "L'email 'admin@shabaka.com' est déjà utilisé par un autre compte",
          error: 'CONFLICT',
          details: {
            field: 'email',
            value: 'admin@shabaka.com'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors',
    content: {
      'application/json': {
        example: {
          success: false,
          status: 400,
          message: 'Données de validation invalides',
          error: 'VALIDATION_ERROR',
          details: 'email must be an email'
        }
      }
    }
  })
  async createAdmin(@Res() response, @Body() createAdminDto: CreateAdminDto) {
    try {
      const admin = await this.adminService.createAdmin(createAdminDto);
      return response.status(HttpStatus.CREATED).json({
        success: true,
        message: 'Admin created successfully',
        admin: {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          createdAt: admin.createdAt
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        return response.status(HttpStatus.CONFLICT).json({
          success: false,
          status: 409,
          message: error.message,
          error: 'CONFLICT',
          details: {
            field: error.message.includes('email') ? 'email' : 'name',
            value: error.message.includes('email') ? createAdminDto.email : createAdminDto.name
          }
        });
      }
      if (error.name === 'ValidationError') {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          status: 400,
          message: 'Données de validation invalides',
          error: 'VALIDATION_ERROR',
          details: error.message
        });
      }
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        status: 400,
        message: 'Erreur lors de la création du compte',
        error: 'BAD_REQUEST',
        details: error.message
      });
    }
  }
  //login admin
  @Post('login')
  @Throttle({ default: { ttl: 300000, limit: 5 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin Login with 2FA',
    description: 'Authenticate admin and send 2FA code to email. Use /admin/verify-2fa to complete login.',
    tags: ['Admin']
  })
  @ApiBody({
    type: AdminLoginDto,
    description: 'Admin login credentials',
    examples: {
      'Admin Login': {
        summary: 'Admin login example',
        value: {
          email: 'admin@shabaka.com',
          password: 'adminpassword123',
          remember_me: false
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AdminLoginResponseDto,
    content: {
      'application/json': {
        example: {
          access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          requires2FA: false,
          admin: {
            _id: "64a1b2c3d4e5f6789abcdef0",
            name: "Admin User",
            email: "admin@shabaka.com",
            role: "admin",
            createdAt: "2023-07-01T10:00:00.000Z"
          },
          message: "Connexion réussie"
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    content: {
      'application/json': {
        example: {
          statusCode: 401,
          message: 'Email ou mot de passe incorrect',
          error: 'Unauthorized'
        }
      }
    }
  })
  async loginAdmin(@Body() loginAdminDto: AdminLoginDto, @Res({ passthrough: true }) res: Response): Promise<AdminLoginResponseDto> {
    const result = await this.adminService.loginAdmin(loginAdminDto);
    if (!result.requires2FA && result.access_token && result.refresh_token) {
      CookieUtil.setAdminTokenCookies(res as any, result.access_token, result.refresh_token, result.rememberMe);
    }
    return result;
  }
  // verify 2fa
  @Post('verify-2fa')
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Admin 2FA Code',
    description: 'Complete admin authentication by verifying the 2FA code sent to email.',
    tags: ['Admin']
  })
  @ApiBody({
    type: AdminVerify2FADto,
    description: 'Admin 2FA verification code',
    examples: {
      'Admin 2FA Verification': {
        summary: 'Verify admin 2FA code',
        value: {
          email: 'admin@shabaka.com',
          verificationCode: '123456'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    type: AdminLoginResponseDto,
    content: {
      'application/json': {
        example: {
          access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          user: {
            _id: "64a1b2c3d4e5f6789abcdef0",
            name: "Admin User",
            email: "admin@shabaka.com",
            role: "admin",
            createdAt: "2023-07-01T10:00:00.000Z"
          },
          rememberMe: false,
          message: "Connexion réussie avec authentification à deux facteurs"
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification code',
    content: {
      'application/json': {
        example: {
          statusCode: 400,
          message: 'Code de vérification invalide ou expiré',
          error: 'Bad Request'
        }
      }
    }
  })
  async verify2FA(@Body() verify2FADto: AdminVerify2FADto, @Res({ passthrough: true }) res: Response): Promise<AdminLoginResponseDto> {
    const result = await this.adminService.verify2FA(verify2FADto);
    if (result.access_token && result.refresh_token) {
      CookieUtil.setAdminTokenCookies(res as any, result.access_token, result.refresh_token, result.rememberMe);
    }
    return result;
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current admin session',
    description: 'Returns the normalized admin session used by the admin console.',
    tags: ['Admin']
  })
  async getAdminSession(@Req() req) {
    return req.adminSession || this.adminService.getAdminSessionForRequestUser(req.user);
  }

  @Put('profile')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update admin profile',
    description: 'Update the current authenticated admin name/email and return refreshed session payload.',
    tags: ['Admin'],
  })
  async updateAdminProfile(@Req() req, @Body() updateProfileDto: UpdateAdminProfileDto) {
    const session = await this.adminService.updateAdminProfile(req.user, updateProfileDto);
    return {
      success: true,
      message: 'Profile updated successfully',
      data: session,
    };
  }

  @Post('change-password')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change admin password',
    description: 'Update password for the current authenticated admin account.',
    tags: ['Admin'],
  })
  async changeAdminPassword(@Req() req, @Body() changePasswordDto: ChangeAdminPasswordDto) {
    const result = await this.adminService.changeAdminPassword(req.user, changePasswordDto);
    return {
      success: true,
      ...result,
    };
  }

  @Get('settings/preferences')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get admin preferences',
    description: 'Get personal settings/preferences for the current authenticated admin.',
    tags: ['Admin'],
  })
  async getAdminPreferences(@Req() req) {
    const preferences = await this.adminService.getAdminPreferences(req.user);
    return {
      success: true,
      data: preferences,
    };
  }

  @Put('settings/preferences')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update admin preferences',
    description: 'Persist personal settings/preferences for the current authenticated admin.',
    tags: ['Admin'],
  })
  async updateAdminPreferences(@Req() req, @Body() updatePreferencesDto: UpdateAdminPreferencesDto) {
    const preferences = await this.adminService.updateAdminPreferences(req.user, updatePreferencesDto);
    return {
      success: true,
      message: 'Preferences updated successfully',
      data: preferences,
    };
  }

  @Get('notifications/summary')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get admin notification summary',
    description: 'Returns aggregate counts for actionable admin notifications shown in the header.',
    tags: ['Admin'],
  })
  async getAdminNotificationSummary() {
    const summary = await this.adminNotificationsService.getSummary();
    return {
      success: true,
      data: summary,
    };
  }

  @Get('notifications/feed')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get admin notification feed',
    description: 'Returns the latest actionable admin notifications for the header panel.',
    tags: ['Admin'],
  })
  async getAdminNotificationFeed(@Req() req) {
    const requestedLimit = Number(req?.query?.limit);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 8;
    const feed = await this.adminNotificationsService.getFeed(limit);
    return {
      success: true,
      data: feed,
    };
  }

  // refresh token
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: { refresh_token?: string }, @Req() req, @Res({ passthrough: true }) res: Response) {
    // Prefer the server-managed cookie to avoid stale localStorage/body tokens
    const refreshToken =
      req.cookies[CookieUtil.ADMIN_COOKIE_NAMES.REFRESH_TOKEN]
      || req.cookies.admin_refresh_token
      || body.refresh_token;
    
    if (!refreshToken) {
      return {
        error: 'Refresh token manquant',
        message: 'Veuillez fournir un refresh token dans le body ou via cookie'
      };
    }
    const result = await this.adminService.refreshToken(refreshToken);

    if (result.access_token) {
      CookieUtil.setAdminAccessTokenCookie(res as any, result.access_token, false);
    }
    return result;
  }
  // logout admin
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    // Récupérer les tokens depuis les headers ou cookies
    const accessToken = req.headers.authorization?.replace('Bearer ', '') || 
                       req.cookies[CookieUtil.ADMIN_COOKIE_NAMES.ACCESS_TOKEN] ||
                       req.cookies.admin_access_token;
    const refreshToken =
      req.cookies[CookieUtil.ADMIN_COOKIE_NAMES.REFRESH_TOKEN] ||
      req.cookies.admin_refresh_token;

    // Révoquer les tokens côté serveur
    const logoutResult = await this.adminService.logout(accessToken, refreshToken);
    
    // Supprimer les cookies côté client
    CookieUtil.clearAdminTokenCookies(res as any);
    
    return {
      message: logoutResult.message,
      revokedTokens: logoutResult.revokedTokens,
      details: 'Tokens révoqués côté serveur et cookies supprimés côté client'
    };
  }
  // forgot password
  @Post('forgot-password')
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: AdminForgotPasswordDto, @Res() response) {
    try {
      const result = await this.adminService.forgotPassword(forgotPasswordDto);
      return response.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        status: 400,
        message: err.message,
        error: 'BAD_REQUEST'
      });
    }
  }
  // reset password
  @Post('reset-password')
  @Throttle({ default: { ttl: 900000, limit: 3 } } as any)
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Res() response, @Body() resetPasswordDto: AdminResetPasswordDto) {
    try {
      const result = await this.adminService.resetPassword(resetPasswordDto);
      return response.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
      });
    }catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        status: 400,
        message: err.message,
        error: 'BAD_REQUEST'
      });
    }
  }

  // ⚠️ DANGER: Delete all database data
  @Delete('cleanup-database')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: '⚠️ DANGER: Delete All Database Data',
    description: 'Deletes ALL data from the database. Use with extreme caution!',
    tags: ['Admin']
  })
  @ApiResponse({
    status: 200,
    description: 'Database cleaned successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        deletedCollections: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  async cleanupDatabase(@Res() response) {
    try {
      if (process.env.ALLOW_ADMIN_DB_CLEANUP !== 'true') {
        throw new ForbiddenException('Database cleanup is disabled. Set ALLOW_ADMIN_DB_CLEANUP=true to enable.');
      }
      const result = await this.adminService.cleanupDatabase();
      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'Database cleaned successfully',
        deletedCollections: result.deletedCollections,
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        return response.status(HttpStatus.FORBIDDEN).json({
          success: false,
          status: 403,
          message: err.message,
          error: 'FORBIDDEN',
        });
      }
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        status: 500,
        message: err.message,
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
}
