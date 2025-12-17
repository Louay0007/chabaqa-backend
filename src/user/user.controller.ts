import { Controller, Post, Get, Put, Delete, Body, Param, HttpStatus, Res, Response, ConflictException, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from 'src/dto-user/create-user.dto';
import { UpdateUserDto } from 'src/dto-user/update-user.dto';
import { ForgotPasswordDto } from 'src/dto-user/forgot-password.dto';
import { ResetPasswordDto } from 'src/dto-user/reset-password.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Users')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  
  //signup
  @Post('signup')
  @ApiOperation({
    summary: 'User Registration',
    description: 'Register a new user account in the system.',
    tags: ['Users']
  })
  @ApiBody({
    type: CreateUserDto,
    description: 'User registration data',
    examples: {
      'Basic Registration': {
        summary: 'Basic user registration',
        value: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
          role: 'user'
        }
      },
      'Complete Registration': {
        summary: 'Complete user registration with all fields',
        value: {
          name: 'Jane Smith',
          email: 'jane@example.com',
          password: 'password123',
          role: 'user',
          numtel: '+1234567890',
          date_naissance: '1990-01-01',
          sexe: 'female',
          pays: 'Tunisia',
          ville: 'Tunis',
          code_postal: '1000',
          adresse: '123 Main Street',
          bio: 'Software developer passionate about learning'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'Compte créé avec succès',
          user: {
            _id: '64a1b2c3d4e5f6789abcdef0',
            name: 'John Doe',
            email: 'john@example.com',
            role: 'user',
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
          message: "L'email 'john@example.com' est déjà utilisé par un autre compte",
          error: 'CONFLICT',
          details: {
            field: 'email',
            value: 'john@example.com'
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
    async signup(@Res() response, @Body() createUserDto: CreateUserDto) {
      try {
        console.log('Backend: Received signup request:', { ...createUserDto, password: '[REDACTED]' });
        const user = await this.userService.createUser(createUserDto);
        console.log('Backend: User created successfully:', { _id: user._id, name: user.name, email: user.email });
        return response.status(HttpStatus.CREATED).json({
          success: true,
          message: 'Compte créé avec succès',
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt
          },
        });
      } catch (err) {
        // Gérer les erreurs de conflit (email ou nom déjà existant)
        if (err instanceof ConflictException) {
          console.error('Backend: Conflict error:', err.message);
          return response.status(HttpStatus.CONFLICT).json({
            success: false,
            status: 409,
            message: err.message,
            error: 'CONFLICT',
            details: {
              field: err.message.includes('email') ? 'email' : 'name',
              value: err.message.includes('email') ? createUserDto.email : createUserDto.name
            }
          });
        }

        // Gérer les autres erreurs de validation
        if (err.name === 'ValidationError') {
          console.error('Backend: Validation error:', err.message);
          return response.status(HttpStatus.BAD_REQUEST).json({
            success: false,
            status: 400,
            message: 'Données de validation invalides',
            error: 'VALIDATION_ERROR',
            details: err.message
          });
        }

        // Erreur générale
        console.error('Backend: General error:', err);
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          status: 400,
          message: 'Erreur lors de la création du compte',
          error: 'BAD_REQUEST',
          details: err.message
        });
      }
  }

  // Mettre à jour le mot de passe (sécurisé)


  // Mettre à jour son propre mot de passe (sans ID dans l'URL)
  @Put('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Change User Password',
    description: 'Change password for the currently authenticated user.',
    tags: ['Users']
  })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({
    type: UpdateUserDto,
    description: 'New password data',
    examples: {
      'Change Password': {
        summary: 'Change user password',
        value: {
          password: 'newpassword123'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'Mot de passe changé avec succès',
          user: {
            _id: '64a1b2c3d4e5f6789abcdef0',
            name: 'John Doe',
            email: 'john@example.com',
            role: 'user',
            createdAt: '2023-07-01T10:00:00.000Z'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or missing password',
    content: {
      'application/json': {
        example: {
          success: false,
          status: 400,
          message: 'Le mot de passe est requis',
          error: 'BAD_REQUEST'
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid token',
    content: {
      'application/json': {
        example: {
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized'
        }
      }
    }
  })
  async changePassword(
    @Res() response,
    @Request() req,
    @Body() updateUserDto: UpdateUserDto
  ) {
    try {
      // Récupérer l'ID de l'utilisateur connecté depuis le token JWT
      const userId = req.user.sub || req.user._id;
      
      // Vérifier que le mot de passe est fourni
      if (!updateUserDto.password) {
        throw new Error('Le mot de passe est requis');
      }
      
      const updatedUser = await this.userService.updateUserPassword(userId, updateUserDto);
      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'Mot de passe changé avec succès',
        user: updatedUser,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        status: 400,
        message: 'Erreur lors du changement de mot de passe',
        error: 'BAD_REQUEST',
        details: err.message
      });
    }
  }

  //get all users
  @Get('all-users')
    async getAllUsers(@Res() response) {
      try {
        const users = await this.userService.getAllUsers();
        return response.status(HttpStatus.OK).json({
          message: 'Users fetched successfully',
          users,
        });
      } catch (err) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          status: 400,
          message: 'Error fetching users',
          error: 'bad request'
        });
      }
    }

  //get user by id
  @Get('user/:id')
    async getUserById(@Res() response, @Param('id') id: string) {
      try {
        const user = await this.userService.getUserById(id);
        return response.status(HttpStatus.OK).json({
          message: 'User fetched successfully',
          user,
        });
      } catch (err) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          status: 400,
          message: 'Error fetching user',
          error: 'bad request'
        });
      }
    }

  //get user by username/handle
  @Get('by-username/:handle')
  @ApiOperation({
    summary: 'Get User by Username/Handle',
    description: 'Fetch user profile by username (email local-part)',
    tags: ['Users']
  })
  @ApiParam({
    name: 'handle',
    description: 'Username/handle (email local-part)',
    example: 'john'
  })
  @ApiResponse({
    status: 200,
    description: 'User profile fetched successfully',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'User profile fetched successfully',
          user: {
            _id: '64a1b2c3d4e5f6789abcdef0',
            name: 'John Doe',
            email: 'john@example.com',
            role: 'user',
            avatar: 'https://example.com/avatar.jpg',
            ville: 'Tunis',
            pays: 'Tunisia',
            bio: 'Software developer',
            createdAt: '2023-07-01T10:00:00.000Z'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    content: {
      'application/json': {
        example: {
          success: false,
          status: 404,
          message: "User with handle 'john' not found",
          error: 'NOT_FOUND'
        }
      }
    }
  })
  async getUserByUsername(@Res() response, @Param('handle') handle: string) {
    try {
      const user = await this.userService.getUserByUsername(handle);
      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'User profile fetched successfully',
        user,
      });
    } catch (err) {
      if (err.status === 404) {
        return response.status(HttpStatus.NOT_FOUND).json({
          success: false,
          status: 404,
          message: err.message,
          error: 'NOT_FOUND'
        });
      }
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        status: 400,
        message: 'Error fetching user profile',
        error: 'BAD_REQUEST',
        details: err.message
      });
    }
  }

    
    //delete user by id
    @Delete('user/:id')
    async deleteUser(@Res() response, @Param('id') id: string) {
      try {
        const user = await this.userService.deleteUser(id);
        return response.status(HttpStatus.OK).json({
          message: 'User deleted successfully',
          user,
        });
      } catch (err) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          status: 400,
          message: 'Error deleting user',
          error: 'bad request'
        });
      }
    }

    // Mettre à jour son propre profil (sans ID dans l'URL)
    @Put('update-profile')
    @UseGuards(JwtAuthGuard)
    async updateProfile(@Res() response, @Request() req, @Body() updateUserDto: UpdateUserDto) {
      try {
        // Récupérer l'ID de l'utilisateur connecté depuis le token JWT
        const userId = req.user.sub || req.user._id;
        
        // Exclure le champ password de la mise à jour
        const { password, ...updateData } = updateUserDto;
        
        const user = await this.userService.updateUser(userId, updateData);
        return response.status(HttpStatus.OK).json({
          success: true,
          message: 'Profil mis à jour avec succès',
          user,
        });
      } catch (err) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          status: 400,
          message: 'Erreur lors de la mise à jour du profil',
          error: 'BAD_REQUEST',
          details: err.message
        });
      }
    }



  // Demande de mot de passe oublié
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request Password Reset',
    description: 'Request password reset and send verification code to email.',
    tags: ['Users']
  })
  @ApiBody({
    type: ForgotPasswordDto,
    description: 'Email address for password reset',
    examples: {
      'Forgot Password': {
        summary: 'Request password reset',
        value: {
          email: 'user@example.com'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset code sent (if email exists)',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'Si cet email existe dans notre base de données, vous recevrez un code de vérification.'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or email sending failed',
    content: {
      'application/json': {
        example: {
          success: false,
          status: 400,
          message: "Erreur lors de l'envoi de l'email: SMTP connection failed",
          error: 'BAD_REQUEST'
        }
      }
    }
  })
  async forgotPassword(@Res() response, @Body() forgotPasswordDto: ForgotPasswordDto) {
    try {
      const result = await this.userService.forgotPassword(forgotPasswordDto);
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

  // Réinitialisation du mot de passe avec code de vérification
  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset Password with Verification Code',
    description: 'Reset password using verification code sent to email.',
    tags: ['Users']
  })
  @ApiBody({
    type: ResetPasswordDto,
    description: 'Password reset data with verification code',
    examples: {
      'Reset Password': {
        summary: 'Reset password with verification code',
        value: {
          email: 'user@example.com',
          verificationCode: '123456',
          newPassword: 'newpassword123'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'Mot de passe réinitialisé avec succès'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid code, expired code, or validation errors',
    content: {
      'application/json': {
        example: {
          success: false,
          status: 400,
          message: 'Code de vérification invalide ou expiré',
          error: 'BAD_REQUEST'
        }
      }
    }
  })
  async resetPassword(@Res() response, @Body() resetPasswordDto: ResetPasswordDto) {
    try {
      const result = await this.userService.resetPassword(resetPasswordDto);
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
}
