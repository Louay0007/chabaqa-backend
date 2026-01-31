import { IsString, MinLength, IsOptional, IsDateString, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for suspending a user
 */
export class SuspendUserDto {
  @ApiProperty({ description: 'Reason for suspension', minLength: 10 })
  @IsString()
  @MinLength(10)
  reason: string;

  @ApiPropertyOptional({ description: 'Suspension end date (ISO format). If not provided, suspension is indefinite' })
  @IsOptional()
  @IsDateString()
  suspensionEndDate?: string;
}

/**
 * DTO for activating a user
 */
export class ActivateUserDto {
  @ApiPropertyOptional({ description: 'Reason for activation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * DTO for resetting user password
 */
export class ResetUserPasswordDto {
  @ApiPropertyOptional({ description: 'Reason for password reset' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Send reset email to user', default: true })
  @IsOptional()
  sendEmail?: boolean = true;
}

/**
 * DTO for updating admin notes
 */
export class UpdateAdminNotesDto {
  @ApiProperty({ description: 'Admin notes about the user' })
  @IsString()
  notes: string;
}