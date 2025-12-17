import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserInfoDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  _id: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe'
  })
  name: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  email: string;

  @ApiProperty({
    description: 'User role',
    example: 'user',
    enum: ['user', 'creator', 'admin']
  })
  role: string;

  @ApiProperty({
    description: 'User creation date',
    example: '2023-07-01T10:00:00.000Z'
  })
  createdAt: Date;
}

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  access_token: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  refresh_token: string;

  @ApiPropertyOptional({
    description: 'User information (only present after successful 2FA verification)',
    type: UserInfoDto
  })
  user?: UserInfoDto;

  @ApiPropertyOptional({
    description: 'Indicates if 2FA verification is required',
    example: true,
    default: false
  })
  requires2FA?: boolean;

  @ApiPropertyOptional({
    description: 'Indicates if remember me option was selected',
    example: false,
    default: false
  })
  rememberMe?: boolean;

  @ApiPropertyOptional({
    description: 'Response message',
    example: 'Connexion réussie avec authentification à deux facteurs'
  })
  message?: string;
} 