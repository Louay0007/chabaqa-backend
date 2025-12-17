import { Controller, Post, Body, HttpStatus, Res, ConflictException, HttpCode, Response as ExpressResponse, Req, UseGuards, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiExtraModels } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateAdminDto } from 'src/dto-admin/create-admin.dto';
import { AdminLoginDto } from 'src/dto-admin/login.dto';
import { AdminLoginResponseDto } from 'src/dto-admin/login-response.dto';
import { CookieUtil } from 'src/common/utils/cookie.util';
import { AdminVerify2FADto } from 'src/dto-admin/verify-2fa.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdminForgotPasswordDto } from 'src/dto-admin/forgot-password.dto';
import { AdminResetPasswordDto } from 'src/dto-admin/reset-password.dto';

@ApiTags('Admin')
@ApiExtraModels(AdminLoginDto, AdminVerify2FADto, AdminForgotPasswordDto, AdminResetPasswordDto, AdminLoginResponseDto)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // create admin
  @Post('create')
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
    description: '2FA code sent successfully',
    type: AdminLoginResponseDto,
    content: {
      'application/json': {
        example: {
          access_token: "",
          refresh_token: "",
          requires2FA: true,
          message: "Code de vérification envoyé par email. Utilisez /admin/verify-2fa pour compléter la connexion."
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
      CookieUtil.setTokenCookies(res as any, result.access_token, result.refresh_token);
    }
    return result;
  }
  // verify 2fa
  @Post('verify-2fa')
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
      CookieUtil.setTokenCookies(res as any, result.access_token, result.refresh_token);
    }
    return result;
  }
  // refresh token
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: { refresh_token?: string }, @Req() req, @Res({ passthrough: true }) res: Response) {
    // Récupérer le refresh token depuis le cookie ou le body
    const refreshToken = body.refresh_token || req.cookies[CookieUtil.COOKIE_NAMES.REFRESH_TOKEN];
    
    if (!refreshToken) {
      return {
        error: 'Refresh token manquant',
        message: 'Veuillez fournir un refresh token dans le body ou via cookie'
      };
    }
    const result = await this.adminService.refreshToken(refreshToken);

    if (result.access_token) {
      CookieUtil.setAccessTokenCookie(res as any, result.access_token, false);
    }
    return result;
  }
  // logout admin
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    // Récupérer les tokens depuis les headers ou cookies
    const accessToken = req.headers.authorization?.replace('Bearer ', '') || 
                       req.cookies[CookieUtil.COOKIE_NAMES.ACCESS_TOKEN];
    const refreshToken = req.cookies[CookieUtil.COOKIE_NAMES.REFRESH_TOKEN];

    // Révoquer les tokens côté serveur
    const logoutResult = await this.adminService.logout(accessToken, refreshToken);
    
    // Supprimer les cookies côté client
    CookieUtil.clearTokenCookies(res as any);
    
    return {
      message: logoutResult.message,
      revokedTokens: logoutResult.revokedTokens,
      details: 'Tokens révoqués côté serveur et cookies supprimés côté client'
    };
  }
  // forgot password
  @Post('forgot-password')
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
  @UseGuards(JwtAuthGuard)
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
      const result = await this.adminService.cleanupDatabase();
      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'Database cleaned successfully',
        deletedCollections: result.deletedCollections,
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        status: 500,
        message: err.message,
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
}
