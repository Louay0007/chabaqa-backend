import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

/**
 * Admin Swagger Configuration
 * Comprehensive API documentation setup for admin module
 * 
 * Validates: Requirements 8.4
 */

/**
 * Configure Swagger documentation for Admin Module
 */
export function setupAdminSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Chabaqa Admin API')
    .setDescription(`
      # Chabaqa Admin API Documentation 🔐
      
      Comprehensive administrative API for managing the Chabaqa platform. This API provides full control over users, communities, content, finances, and system analytics.
      
      ## 🎯 Admin Module Features
      
      ### User Management
      - View and search all platform users
      - Suspend/activate user accounts
      - Reset user passwords
      - View detailed user analytics
      - Manage user roles and permissions
      
      ### Community Management
      - Review and approve community creation requests
      - Moderate community settings and content
      - View community analytics and performance
      - Manage community visibility and features
      
      ### Content Moderation
      - Review user-generated content (posts, courses, events)
      - Approve or reject content submissions
      - Bulk moderation operations
      - Content quality metrics and analytics
      
      ### Financial Management
      - Monitor platform revenue and transactions
      - Process creator payouts
      - Manage subscriptions
      - Handle payment disputes
      - Generate financial reports
      
      ### Analytics Dashboard
      - Platform-wide statistics and KPIs
      - User growth and engagement metrics
      - Revenue trends and forecasts
      - Performance monitoring
      - Custom analytics reports
      
      ### Communication Management
      - Create and send email campaigns
      - Manage notification templates
      - Bulk messaging to user segments
      - Track communication metrics
      
      ### Security & Audit
      - View comprehensive audit logs
      - Monitor security events
      - Configure access controls
      - Generate compliance reports
      
      ## 🔐 Authentication
      
      All admin endpoints require authentication with admin-level permissions.
      
      **Authentication Flow:**
      1. Login with admin credentials: \`POST /api/admin/login\`
      2. Complete 2FA verification: \`POST /api/admin/verify-2fa\`
      3. Use the JWT token in Authorization header: \`Bearer <token>\`
      4. Token expires after 1 hour - use refresh token to get new access token
      
      ## 🛡️ Security Features
      
      - **Rate Limiting**: All endpoints have rate limits to prevent abuse
      - **Role-Based Access Control**: Different admin roles have different permissions
      - **Audit Logging**: All admin actions are logged with full context
      - **2FA Required**: Two-factor authentication is mandatory for all admin users
      - **IP Whitelisting**: Optional IP-based access restrictions
      - **Session Management**: Automatic session timeout and concurrent session limits
      
      ## 📊 Response Format
      
      All API responses follow a consistent format:
      
      **Success Response:**
      \`\`\`json
      {
        "success": true,
        "data": { ... },
        "message": "Operation completed successfully",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
      \`\`\`
      
      **Error Response:**
      \`\`\`json
      {
        "success": false,
        "error": {
          "code": "ADMIN_VALIDATION_ERROR",
          "message": "Validation failed",
          "details": [
            {
              "field": "email",
              "message": "Invalid email format",
              "value": "invalid-email"
            }
          ],
          "path": "/api/admin/users",
          "method": "POST"
        },
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
      \`\`\`
      
      ## 🚨 Error Codes
      
      - **ADMIN_VALIDATION_ERROR**: Input validation failed
      - **ADMIN_UNAUTHORIZED**: Authentication required or invalid token
      - **ADMIN_FORBIDDEN**: Insufficient permissions for this operation
      - **ADMIN_NOT_FOUND**: Requested resource not found
      - **ADMIN_CONFLICT**: Operation conflicts with current state
      - **ADMIN_RATE_LIMIT_EXCEEDED**: Too many requests
      - **ADMIN_OPERATION_FAILED**: Business logic error
      - **ADMIN_EXTERNAL_SERVICE_ERROR**: External service integration failed
      - **ADMIN_DATABASE_ERROR**: Database operation failed
      
      ## 📈 Rate Limits
      
      Different endpoints have different rate limits:
      
      - **Standard Operations**: 100 requests per minute
      - **Sensitive Operations**: 20 requests per minute
      - **Bulk Operations**: 5 requests per minute
      - **Export Operations**: 10 requests per 5 minutes
      - **Analytics Queries**: 50 requests per minute
      
      Rate limit headers are included in all responses:
      - \`X-RateLimit-Limit\`: Maximum requests allowed
      - \`X-RateLimit-Remaining\`: Requests remaining in current window
      - \`X-RateLimit-Reset\`: Time when the rate limit resets
      
      ## 🔍 Filtering and Pagination
      
      Most list endpoints support advanced filtering and pagination:
      
      **Pagination Parameters:**
      - \`page\`: Page number (default: 1)
      - \`limit\`: Items per page (default: 20, max: 100)
      - \`sortBy\`: Field to sort by
      - \`sortOrder\`: Sort direction (ASC or DESC)
      
      **Common Filters:**
      - \`searchTerm\`: Search across multiple fields
      - \`startDate\` / \`endDate\`: Date range filtering
      - \`status\`: Filter by status
      - \`type\`: Filter by type
      
      ## 📤 Data Export
      
      Many endpoints support data export in multiple formats:
      - **CSV**: Comma-separated values
      - **Excel**: Microsoft Excel format
      - **PDF**: Portable document format
      - **JSON**: JavaScript object notation
      
      Export operations are processed asynchronously for large datasets.
      
      ## 🔔 Audit Logging
      
      All administrative actions are automatically logged with:
      - Admin user ID and name
      - Action type and timestamp
      - Affected entity type and ID
      - Before/after data (for updates)
      - IP address and user agent
      - Request metadata
      
      Audit logs are immutable and retained for compliance purposes.
      
      ## 📞 Support
      
      For API support or questions:
      - Email: admin-support@chabaqa.com
      - Documentation: https://docs.chabaqa.com/admin-api
      - Status Page: https://status.chabaqa.com
    `)
    .setVersion('1.0.0')
    .setContact(
      'Chabaqa Admin Support',
      'https://chabaqa.com/admin',
      'admin-support@chabaqa.com'
    )
    .setLicense('Proprietary', 'https://chabaqa.com/license')
    .addServer('http://localhost:3000', 'Development Server')
    .addServer('https://api.chabaqa.com', 'Production Server')
    .addServer('https://staging-api.chabaqa.com', 'Staging Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token obtained from /api/admin/login and /api/admin/verify-2fa',
        in: 'header',
      },
      'admin-jwt'
    )
    .addTag('Admin - Authentication', 'Admin authentication, 2FA, and session management')
    .addTag('Admin - User Management', 'Comprehensive user administration and analytics')
    .addTag('Admin - Community Management', 'Community oversight, approval workflows, and analytics')
    .addTag('Admin - Content Moderation', 'Content review, approval, and quality management')
    .addTag('Admin - Financial Management', 'Revenue monitoring, payouts, and financial reporting')
    .addTag('Admin - Analytics Dashboard', 'Platform-wide analytics and performance metrics')
    .addTag('Admin - Communication Management', 'Email campaigns, notifications, and messaging')
    .addTag('Admin - Security & Audit', 'Security monitoring, audit logs, and compliance')
    .addTag('Admin - Data Export', 'Data export and reporting functionality')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    include: [], // Include all modules
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
    ignoreGlobalPrefix: false,
  });

  // Setup Swagger UI with custom configuration
  SwaggerModule.setup('api/admin/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      tryItOutEnabled: true,
      filter: true,
      showRequestHeaders: true,
      showCommonExtensions: true,
      defaultModelsExpandDepth: 3,
      defaultModelExpandDepth: 3,
      displayRequestDuration: true,
      deepLinking: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      validatorUrl: null,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
      requestInterceptor: (req: any) => {
        // Add custom headers for admin requests
        req.headers['X-Admin-Request'] = 'true';
        req.headers['X-Request-ID'] = `admin-${Date.now()}`;
        return req;
      },
      responseInterceptor: (res: any) => {
        // Log response for debugging
        console.log('Admin API Response:', {
          status: res.status,
          url: res.url,
          headers: res.headers,
        });
        return res;
      },
    },
    customSiteTitle: 'Chabaqa Admin API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { 
        background-color: #1a1a2e; 
        border-bottom: 3px solid #e94560;
      }
      .swagger-ui .info .title { 
        color: #1a1a2e; 
        font-size: 2.8rem;
        font-weight: 800;
        margin-bottom: 1.5rem;
      }
      .swagger-ui .info .title::before {
        content: '🔐 ';
      }
      .swagger-ui .info .description { 
        font-size: 1.05rem;
        line-height: 1.7;
        color: #444;
      }
      .swagger-ui .scheme-container { 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 1.5rem;
        border-radius: 10px;
        margin: 1.5rem 0;
        color: white;
      }
      .swagger-ui .btn.authorize { 
        background-color: #e94560;
        border-color: #e94560;
        color: white;
        font-weight: 600;
      }
      .swagger-ui .btn.authorize:hover { 
        background-color: #d63447;
        border-color: #d63447;
      }
      .swagger-ui .opblock.opblock-post { 
        border-color: #28a745;
        background: rgba(40, 167, 69, 0.05);
      }
      .swagger-ui .opblock.opblock-get { 
        border-color: #007bff;
        background: rgba(0, 123, 255, 0.05);
      }
      .swagger-ui .opblock.opblock-put { 
        border-color: #ffc107;
        background: rgba(255, 193, 7, 0.05);
      }
      .swagger-ui .opblock.opblock-delete { 
        border-color: #dc3545;
        background: rgba(220, 53, 69, 0.05);
      }
      .swagger-ui .opblock.opblock-patch { 
        border-color: #6f42c1;
        background: rgba(111, 66, 193, 0.05);
      }
      .swagger-ui .opblock-tag { 
        border-bottom: 3px solid #667eea;
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
      }
      .swagger-ui .opblock-tag-section { 
        margin-bottom: 2rem;
      }
      .swagger-ui .parameter__name.required::after { 
        content: ' *';
        color: #dc3545;
        font-weight: bold;
      }
      .swagger-ui .response-col_status { 
        font-weight: 700;
        font-size: 1.1rem;
      }
      .swagger-ui .model-title { 
        color: #1a1a2e;
        font-weight: 700;
        font-size: 1.2rem;
      }
      .swagger-ui .model-box { 
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 1rem;
        margin: 1rem 0;
      }
      .swagger-ui .prop-type { 
        color: #6f42c1;
        font-weight: 600;
      }
      .swagger-ui .prop-format { 
        color: #6c757d;
        font-style: italic;
      }
      .swagger-ui .markdown p { 
        margin: 0.8rem 0;
        line-height: 1.6;
      }
      .swagger-ui .markdown code { 
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 2px 6px;
        font-family: 'Courier New', monospace;
        color: #e94560;
      }
      .swagger-ui .markdown pre { 
        background: #1a1a2e;
        color: #f8f9fa;
        border-radius: 8px;
        padding: 1rem;
        overflow-x: auto;
      }
      .swagger-ui .markdown h1,
      .swagger-ui .markdown h2,
      .swagger-ui .markdown h3 { 
        color: #1a1a2e;
        margin-top: 1.5rem;
        margin-bottom: 0.8rem;
        font-weight: 700;
      }
      .swagger-ui .markdown ul,
      .swagger-ui .markdown ol { 
        margin-left: 1.5rem;
        line-height: 1.8;
      }
      .swagger-ui .markdown li { 
        margin: 0.5rem 0;
      }
      .swagger-ui .authorization__btn { 
        background: #e94560;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
      }
      .swagger-ui .authorization__btn:hover { 
        background: #d63447;
      }
      .swagger-ui .auth-wrapper { 
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 1.5rem;
        margin: 1rem 0;
      }
      .swagger-ui .errors-wrapper { 
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        border-radius: 8px;
        padding: 1rem;
        margin: 1rem 0;
      }
      .swagger-ui .information-container { 
        background: white;
        padding: 2rem;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        margin-bottom: 2rem;
      }
    `,
    customJs: [
      'https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-bundle.js',
      'https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-standalone-preset.js'
    ],
  });
}

/**
 * Admin API Response Examples
 * Common response examples for Swagger documentation
 */
export const AdminSwaggerExamples = {
  /**
   * Success response example
   */
  successResponse: {
    success: true,
    data: {
      id: '64a1b2c3d4e5f6789abcdef0',
      name: 'Example Data',
    },
    message: 'Operation completed successfully',
    timestamp: '2024-01-01T00:00:00.000Z',
  },

  /**
   * Error response example
   */
  errorResponse: {
    success: false,
    error: {
      code: 'ADMIN_VALIDATION_ERROR',
      message: 'Validation failed',
      details: [
        {
          field: 'email',
          message: 'Invalid email format',
          value: 'invalid-email',
        },
      ],
      path: '/api/admin/users',
      method: 'POST',
    },
    timestamp: '2024-01-01T00:00:00.000Z',
  },

  /**
   * Paginated response example
   */
  paginatedResponse: {
    success: true,
    data: {
      data: [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ],
      total: 100,
      page: 1,
      limit: 20,
      totalPages: 5,
      hasNextPage: true,
      hasPrevPage: false,
    },
    message: 'Data retrieved successfully',
    timestamp: '2024-01-01T00:00:00.000Z',
  },

  /**
   * Bulk operation response example
   */
  bulkOperationResponse: {
    success: true,
    data: {
      totalItems: 10,
      successCount: 8,
      failureCount: 2,
      failures: [
        {
          itemId: '64a1b2c3d4e5f6789abcdef0',
          error: 'Item not found',
          code: 'NOT_FOUND',
        },
        {
          itemId: '64a1b2c3d4e5f6789abcdef1',
          error: 'Invalid status',
          code: 'VALIDATION_ERROR',
        },
      ],
      successfulIds: [
        '64a1b2c3d4e5f6789abcdef2',
        '64a1b2c3d4e5f6789abcdef3',
      ],
    },
    message: 'Bulk operation completed',
    timestamp: '2024-01-01T00:00:00.000Z',
  },
};
