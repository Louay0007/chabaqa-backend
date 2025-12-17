import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto<T> {
  @ApiProperty({ example: true, description: 'Indicates if the request was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response data' })
  data: T;

  @ApiProperty({ example: 'Operation successful', description: 'Optional success message', required: false })
  message?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Response timestamp' })
  timestamp: string;

  constructor(data: T, message?: string) {
    this.success = true;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}
