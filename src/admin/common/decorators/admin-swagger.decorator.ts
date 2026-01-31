import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { AdminApiResponse } from '../interceptors/admin-response.interceptor';
import { AdminErrorResponse } from '../filters/admin-exception.filter';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';

/**
 * Admin API Documentation Decorators
 * Convenience decorators for consistent Swagger documentation
 * 
 * Validates: Requirements 8.4
 */

/**
 * Standard Admin API Operation
 * Applies common decorators for admin endpoints
 */
export function AdminApiOperation(options: {
  summary: string;
  description?: string;
  deprecated?: boolean;
}) {
  return applyDecorators(
    ApiBearerAuth('admin-jwt'),
    ApiOperation({
      summary: options.summary,
      description: options.description,
      deprecated: options.deprecated,
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Invalid or missing authentication token',
      type: AdminErrorResponse,
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden - Insufficient permissions',
      type: AdminErrorResponse,
    }),
    ApiResponse({
      status: 429,
      description: 'Too Many Requests - Rate limit exceeded',
      type: AdminErrorResponse,
    })
  );
}

/**
 * Admin Success Response
 * Documents successful response with data type
 */
export function AdminSuccessResponse<T>(options: {
  status?: number;
  description: string;
  type?: Type<T>;
  isArray?: boolean;
}) {
  const { status = 200, description, type, isArray = false } = options;

  if (type) {
    return ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(AdminApiResponse) },
          {
            properties: {
              data: isArray
                ? {
                    type: 'array',
                    items: { $ref: getSchemaPath(type) },
                  }
                : { $ref: getSchemaPath(type) },
            },
          },
        ],
      },
    });
  }

  return ApiResponse({
    status,
    description,
    type: AdminApiResponse,
  });
}

/**
 * Admin Paginated Response
 * Documents paginated list response
 */
export function AdminPaginatedResponse<T>(type: Type<T>, description: string) {
  return applyDecorators(
    ApiExtraModels(PaginatedResponseDto, type),
    ApiResponse({
      status: 200,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(AdminApiResponse) },
          {
            properties: {
              data: {
                allOf: [
                  { $ref: getSchemaPath(PaginatedResponseDto) },
                  {
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: getSchemaPath(type) },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    })
  );
}

/**
 * Admin Error Responses
 * Documents common error responses
 */
export function AdminErrorResponses() {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Bad Request - Validation error or invalid input',
      type: AdminErrorResponse,
    }),
    ApiResponse({
      status: 404,
      description: 'Not Found - Resource not found',
      type: AdminErrorResponse,
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict - Resource already exists or operation conflicts with current state',
      type: AdminErrorResponse,
    }),
    ApiResponse({
      status: 500,
      description: 'Internal Server Error - Unexpected server error',
      type: AdminErrorResponse,
    })
  );
}

/**
 * Admin ID Parameter
 * Documents ID path parameter
 */
export function AdminIdParam(options: {
  name?: string;
  description?: string;
  example?: string;
}) {
  const { name = 'id', description = 'Resource ID', example = '64a1b2c3d4e5f6789abcdef0' } = options;

  return ApiParam({
    name,
    description,
    example,
    required: true,
    type: String,
  });
}

/**
 * Admin Pagination Queries
 * Documents pagination query parameters
 */
export function AdminPaginationQueries() {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Page number',
      example: 1,
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Items per page (max 100)',
      example: 20,
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      type: String,
      description: 'Field to sort by',
      example: 'createdAt',
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['ASC', 'DESC'],
      description: 'Sort order',
      example: 'DESC',
    })
  );
}

/**
 * Admin Search Query
 * Documents search query parameter
 */
export function AdminSearchQuery(options?: {
  description?: string;
  example?: string;
}) {
  const {
    description = 'Search term for filtering results',
    example = 'john',
  } = options || {};

  return ApiQuery({
    name: 'searchTerm',
    required: false,
    type: String,
    description,
    example,
  });
}

/**
 * Admin Date Range Queries
 * Documents date range query parameters
 */
export function AdminDateRangeQueries() {
  return applyDecorators(
    ApiQuery({
      name: 'startDate',
      required: false,
      type: String,
      description: 'Start date (ISO 8601 format)',
      example: '2024-01-01T00:00:00.000Z',
    }),
    ApiQuery({
      name: 'endDate',
      required: false,
      type: String,
      description: 'End date (ISO 8601 format)',
      example: '2024-01-31T23:59:59.999Z',
    })
  );
}

/**
 * Admin Bulk Operation
 * Documents bulk operation endpoint
 */
export function AdminBulkOperation(options: {
  summary: string;
  description: string;
  bodyType: Type<any>;
}) {
  return applyDecorators(
    AdminApiOperation({
      summary: options.summary,
      description: options.description,
    }),
    ApiBody({
      type: options.bodyType,
      description: 'Bulk operation data',
    }),
    ApiResponse({
      status: 200,
      description: 'Bulk operation completed (may include partial failures)',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              totalItems: { type: 'number', example: 10 },
              successCount: { type: 'number', example: 8 },
              failureCount: { type: 'number', example: 2 },
              failures: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    itemId: { type: 'string', example: '64a1b2c3d4e5f6789abcdef0' },
                    error: { type: 'string', example: 'Item not found' },
                    code: { type: 'string', example: 'NOT_FOUND' },
                  },
                },
              },
              successfulIds: {
                type: 'array',
                items: { type: 'string' },
                example: ['64a1b2c3d4e5f6789abcdef0', '64a1b2c3d4e5f6789abcdef1'],
              },
            },
          },
          message: { type: 'string', example: 'Bulk operation completed' },
          timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        },
      },
    }),
    AdminErrorResponses()
  );
}

/**
 * Admin Export Operation
 * Documents export endpoint
 */
export function AdminExportOperation(options: {
  summary: string;
  description: string;
}) {
  return applyDecorators(
    AdminApiOperation({
      summary: options.summary,
      description: options.description,
    }),
    ApiQuery({
      name: 'format',
      required: true,
      enum: ['csv', 'excel', 'pdf', 'json'],
      description: 'Export format',
      example: 'csv',
    }),
    ApiQuery({
      name: 'fields',
      required: false,
      type: [String],
      description: 'Fields to include in export',
      example: ['name', 'email', 'createdAt'],
    }),
    ApiResponse({
      status: 200,
      description: 'Export job created successfully',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              jobId: { type: 'string', example: '64a1b2c3d4e5f6789abcdef0' },
              status: { type: 'string', example: 'processing' },
              downloadUrl: { type: 'string', example: '/api/admin/export/download/64a1b2c3d4e5f6789abcdef0' },
            },
          },
          message: { type: 'string', example: 'Export job created successfully' },
          timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        },
      },
    }),
    AdminErrorResponses()
  );
}

/**
 * Admin Analytics Operation
 * Documents analytics endpoint
 */
export function AdminAnalyticsOperation(options: {
  summary: string;
  description: string;
  responseType?: Type<any>;
}) {
  const decorators = [
    AdminApiOperation({
      summary: options.summary,
      description: options.description,
    }),
    ApiQuery({
      name: 'period',
      required: false,
      enum: ['last_7_days', 'last_30_days', 'last_90_days', 'last_year', 'all_time'],
      description: 'Time period for analytics',
      example: 'last_30_days',
    }),
    AdminDateRangeQueries(),
  ];

  if (options.responseType) {
    decorators.push(
      AdminSuccessResponse({
        description: 'Analytics data retrieved successfully',
        type: options.responseType,
      })
    );
  }

  decorators.push(AdminErrorResponses());

  return applyDecorators(...decorators);
}

/**
 * Complete Admin Endpoint Documentation
 * Combines all common decorators for a complete endpoint documentation
 */
export function AdminEndpoint(options: {
  summary: string;
  description: string;
  responseType?: Type<any>;
  isArray?: boolean;
  isPaginated?: boolean;
  includeIdParam?: boolean;
  includePagination?: boolean;
  includeSearch?: boolean;
  includeDateRange?: boolean;
}) {
  const decorators = [
    AdminApiOperation({
      summary: options.summary,
      description: options.description,
    }),
  ];

  if (options.includeIdParam) {
    decorators.push(AdminIdParam({}));
  }

  if (options.includePagination) {
    decorators.push(AdminPaginationQueries());
  }

  if (options.includeSearch) {
    decorators.push(AdminSearchQuery());
  }

  if (options.includeDateRange) {
    decorators.push(AdminDateRangeQueries());
  }

  if (options.responseType) {
    if (options.isPaginated) {
      decorators.push(AdminPaginatedResponse(options.responseType, 'Data retrieved successfully'));
    } else {
      decorators.push(
        AdminSuccessResponse({
          description: 'Operation completed successfully',
          type: options.responseType,
          isArray: options.isArray,
        })
      );
    }
  }

  decorators.push(AdminErrorResponses());

  return applyDecorators(...decorators);
}
