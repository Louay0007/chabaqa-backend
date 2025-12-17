import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 1, description: 'Current page number' })
  page: number;

  @ApiProperty({ example: 20, description: 'Items per page' })
  limit: number;

  @ApiProperty({ example: 100, description: 'Total number of items' })
  total: number;

  @ApiProperty({ example: 5, description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ example: true, description: 'Whether there is a next page' })
  hasNext: boolean;

  @ApiProperty({ example: false, description: 'Whether there is a previous page' })
  hasPrev: boolean;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: 'Array of items', isArray: true })
  data: T[];

  @ApiProperty({ type: PaginationMeta })
  pagination: PaginationMeta;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.success = true;
    this.data = data;
    this.pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
    this.timestamp = new Date().toISOString();
  }
}
