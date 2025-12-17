import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetail {
  @ApiProperty({ example: 'email', description: 'Field that caused the error', required: false })
  field?: string;

  @ApiProperty({ example: 'Invalid email format', description: 'Error message' })
  message: string;
}

export class ErrorData {
  @ApiProperty({ example: 'VALIDATION_ERROR', description: 'Error code' })
  code: string;

  @ApiProperty({ example: 'Validation failed', description: 'Error message' })
  message: string;

  @ApiProperty({ type: [ErrorDetail], description: 'Detailed error information', required: false })
  details?: ErrorDetail[];
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ type: ErrorData })
  error: ErrorData;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;

  constructor(code: string, message: string, details?: ErrorDetail[]) {
    this.success = false;
    this.error = {
      code,
      message,
      details,
    };
    this.timestamp = new Date().toISOString();
  }
}
