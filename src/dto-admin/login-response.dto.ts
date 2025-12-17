import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminInfoDto {
  @ApiProperty({
    description: 'Admin unique identifier',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  _id: string;

  @ApiProperty({
    description: 'Admin full name',
    example: 'Admin User'
  })
  name: string;

  @ApiProperty({
    description: 'Admin email address',
    example: 'admin@shabaka.com'
  })
  email: string;

  @ApiProperty({
    description: 'Admin role',
    example: 'admin',
    enum: ['admin', 'super_admin']
  })
  role: string;

  @ApiProperty({
    description: 'Admin creation date',
    example: '2023-07-01T10:00:00.000Z'
  })
  createdAt: Date;
}

export class AdminLoginResponseDto {
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
    description: 'Admin information (only present after successful 2FA verification)',
    type: AdminInfoDto
  })
  admin?: AdminInfoDto;

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