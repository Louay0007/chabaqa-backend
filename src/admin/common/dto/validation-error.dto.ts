import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Validation error severity levels
 */
export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

/**
 * Validation error codes
 */
export enum ValidationErrorCode {
  REQUIRED_FIELD = 'REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_TYPE = 'INVALID_TYPE',
  OUT_OF_RANGE = 'OUT_OF_RANGE',
  TOO_SHORT = 'TOO_SHORT',
  TOO_LONG = 'TOO_LONG',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_URL = 'INVALID_URL',
  INVALID_DATE = 'INVALID_DATE',
  INVALID_ENUM = 'INVALID_ENUM',
  DUPLICATE_VALUE = 'DUPLICATE_VALUE',
  REFERENCE_NOT_FOUND = 'REFERENCE_NOT_FOUND',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  CUSTOM_VALIDATION = 'CUSTOM_VALIDATION',
}

/**
 * Field validation error
 */
export class FieldValidationError {
  @ApiProperty({ description: 'Field name that failed validation' })
  field: string;

  @ApiProperty({ description: 'Validation error message' })
  message: string;

  @ApiProperty({
    description: 'Error code',
    enum: ValidationErrorCode,
  })
  code: string;

  @ApiPropertyOptional({ description: 'The invalid value' })
  value?: any;

  @ApiPropertyOptional({
    description: 'Severity level',
    enum: ValidationSeverity,
    default: ValidationSeverity.ERROR,
  })
  severity?: string;

  @ApiPropertyOptional({ description: 'Additional context or constraints' })
  context?: Record<string, any>;
}

/**
 * Validation result response
 */
export class ValidationResultDto {
  @ApiProperty({ description: 'Whether validation passed' })
  valid: boolean;

  @ApiProperty({
    description: 'Array of validation errors',
    type: [FieldValidationError],
  })
  errors: FieldValidationError[];

  @ApiPropertyOptional({
    description: 'Array of validation warnings',
    type: [FieldValidationError],
  })
  warnings?: FieldValidationError[];

  @ApiPropertyOptional({ description: 'Summary message' })
  message?: string;

  @ApiProperty({ description: 'Total number of errors' })
  errorCount: number;

  @ApiProperty({ description: 'Total number of warnings' })
  warningCount: number;
}
