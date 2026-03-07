import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { AbsoluteUploadsUrlInterceptor } from './common/interceptors/absolute-uploads-url.interceptor';
import { UploadService } from './upload/upload.service';
import { MonitoringService } from './common/services/monitoring.service';
import os from 'os';
import { webcrypto } from 'node:crypto';
import {
  getAllowedCorsOrigins,
  isCorsOriginAllowed,
  isProductionEnvironment,
  isSwaggerEnabled,
} from './common/utils/security-config.util';

// Compatibility for Node < 20 where globalThis.crypto may be undefined.
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

const getLocalNetworkIp = (): string => {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    const networkInterface = networkInterfaces[interfaceName];
    if (!networkInterface) continue;
    for (const network of networkInterface) {
      if (network.family === 'IPv4' && !network.internal) {
        return network.address;
      }
    }
  }
  return 'localhost';
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  const monitoringService = app.get(MonitoringService);
  expressApp.disable('x-powered-by');

  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === 'true') {
    expressApp.set('trust proxy', 1);
  } else if (trustProxy && /^\d+$/.test(trustProxy)) {
    expressApp.set('trust proxy', Number(trustProxy));
  }

  // Temporary backward-compat alias: /api/payments/* -> /api/payment/*
  // Keep this during migration to avoid breaking older frontend clients.
  app.use((req: any, res: any, next: any) => {
    if (typeof req.url === 'string' && req.url === '/api/payments') {
      req.url = '/api/payment';
    } else if (typeof req.url === 'string' && req.url.startsWith('/api/payments/')) {
      req.url = req.url.replace('/api/payments/', '/api/payment/');
    }
    next();
  });

  app.use('/api/payment/stripe-link/webhook', express.raw({ type: 'application/json' }));

  app.use(express.static('public'));
  // app.use('/uploads', cors(), express.static('uploads')); // Handled by ServeStaticModule in AppModule


  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '2mb';
  const urlEncodedBodyLimit = process.env.URLENCODED_BODY_LIMIT || '2mb';
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(express.urlencoded({ limit: urlEncodedBodyLimit, extended: true }));


  app.use(cookieParser());


  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors) => {
      const flattenValidationErrors = (
        validationErrors: ValidationError[],
        parentPath = '',
      ): Array<{ field: string; messages: string[] }> => {
        const flattened: Array<{ field: string; messages: string[] }> = [];

        for (const error of validationErrors) {
          const currentPath = parentPath
            ? `${parentPath}.${error.property}`
            : error.property;

          if (error.constraints && Object.keys(error.constraints).length > 0) {
            flattened.push({
              field: currentPath,
              messages: Object.values(error.constraints),
            });
          }

          if (error.children && error.children.length > 0) {
            flattened.push(...flattenValidationErrors(error.children, currentPath));
          }
        }

        return flattened;
      };

      const formattedErrors = flattenValidationErrors(errors);
      console.error('❌ Validation Error:', JSON.stringify(formattedErrors, null, 2));
      return new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: formattedErrors,
      });
    },
  }));


  app.useGlobalFilters(new HttpExceptionFilter());

  // Normalize any /uploads URLs in all API responses to HTTPS production domain
  app.useGlobalInterceptors(new AbsoluteUploadsUrlInterceptor(app.get(UploadService)));


  app.setGlobalPrefix('api');


  const isProduction = isProductionEnvironment();
  const allowedOrigins = getAllowedCorsOrigins();

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error(
      '[SECURITY] No allowed CORS origins configured. Set FRONTEND_URL and/or CORS_ALLOWED_ORIGINS.',
    );
  }

  app.use((req: any, res: any, next: any) => {
    // Swagger UI needs scripts/styles. Keep strict headers for API routes.
    if (!(req.path || '').startsWith('/api/docs')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
  });

  if (!isProduction) {
    console.log(`🌐 CORS Mode: ${isProduction ? 'PRODUCTION (restrictif)' : 'DEVELOPMENT (permissif)'}`);
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (isCorsOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-CSRF-Token',
      'X-API-Key',
      'Cache-Control',
      'Pragma'
    ],
    exposedHeaders: ['Authorization', 'X-CSRF-Token', 'Content-Length'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400, // 24 hours
  });

  if (!isProduction) {
    console.log(`✅ CORS enabled with allowlist: ${allowedOrigins.join(', ')}`);
  }

  // Always record request/error counters for Prometheus metrics.
  app.use((req, res, next) => {
    const url = req.originalUrl || req.url;

    res.on('finish', () => {
      if (url.startsWith('/api/health')) {
        return;
      }

      monitoringService.incrementRequestCount();
      if (res.statusCode >= 500) {
        monitoringService.incrementErrorCount();
      }
    });

    next();
  });

  // Access log middleware (production-friendly). This feeds Dozzle with request/response stats.
  const enableAccessLog = process.env.HTTP_ACCESS_LOG !== 'false';
  if (enableAccessLog) {
    app.use((req, res, next) => {
      const startedAt = process.hrtime.bigint();
      const startedIso = new Date().toISOString();
      const url = req.originalUrl || req.url;

      res.on('finish', () => {
        if (url.startsWith('/api/health')) {
          return;
        }

        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const status = res.statusCode;
        const icon = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✅';
        const contentLength = res.getHeader('content-length') || '-';
        const ip = req.ip || req.socket?.remoteAddress || '-';

        console.log(
          `${icon} [HTTP] ${startedIso} ${req.method} ${url} ${status} ${elapsedMs.toFixed(1)}ms size=${contentLength} ip=${ip}`,
        );
      });

      next();
    });
  }


  // Start the application
  const port = process.env.PORT || 3000;
  const localIP = getLocalNetworkIp();

  const swaggerEnabled = isSwaggerEnabled();
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Shabaka API')
      .setDescription(`
      # Welcome to Shabaka API! 🚀
      
      A comprehensive community-based learning platform API that enables users to create, join, and manage educational communities, courses, challenges, and events.
      
      ## 🎯 Key Features
      - **Community Management**: Create and manage educational communities
      - **Course Creation**: Build comprehensive courses with sections and chapters
      - **Sequential Progression**: Control learning flow with sequential content unlocking
      - **Challenge System**: Create and participate in community challenges
      - **Event Management**: Organize and manage educational events
      - **File Upload**: Support for various file types (images, videos, documents)
      - **User Management**: Complete user profile and authentication system
      - **Admin Panel**: Administrative operations and system management
      
      ## 🔐 Authentication
      Most endpoints require authentication using JWT tokens. 
      
      **Get started:**
      1. Use \`/auth/login\` to authenticate and get your access token
      2. Include the token in the Authorization header: \`Bearer <your-token>\`
      3. For 2FA-enabled accounts, complete verification with \`/auth/verify-2fa\`
      
      ## 📚 API Structure
      - **Authentication**: User login, registration, password reset, 2FA
      - **Users**: Profile management, user operations
      - **Communities**: Community creation, joining, management
      - **Courses**: Course creation, enrollment, progress tracking
      - **Challenges**: Challenge participation and management
      - **Events**: Event creation and management
      - **Upload**: File upload and management
      - **Admin**: Administrative operations
      
      ## 🌟 Sequential Progression Feature
      The API includes a powerful sequential progression system that allows course creators to:
      - Enable sequential content unlocking
      - Control access to chapters based on completion
      - Set custom unlock messages
      - Manually unlock content for specific users
      
      ## 📖 Response Format
      All API responses follow a consistent format:
      \`\`\`json
      {
        "success": true,
        "message": "Operation completed successfully",
        "data": { ... }
      }
      \`\`\`
      
      ## 🚨 Error Handling
      Errors are returned with appropriate HTTP status codes and detailed messages:
      - **400**: Bad Request - Validation errors
      - **401**: Unauthorized - Authentication required
      - **403**: Forbidden - Insufficient permissions
      - **404**: Not Found - Resource not found
      - **409**: Conflict - Resource already exists
      - **500**: Internal Server Error - Server-side error
    `)
    .setVersion('2.0.0')
    .setContact('Shabaka Team', 'https://shabaka.com', 'support@shabaka.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(`http://${localIP}:${port}`, 'Development Server')
    .addServer('https://api.shabaka.com', 'Production Server')
    .addServer('https://staging-api.shabaka.com', 'Staging Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token obtained from /auth/login',
        in: 'header',
      },
      'JWT-auth'
    )
    .addTag('Authentication', 'User authentication, registration, password reset, and 2FA verification')
    .addTag('Users', 'User profile management, account operations, and user data')
    .addTag('Community Management', 'Community creation, joining, management, and member operations')
    .addTag('Cours', 'Course creation, management, and content organization for creators')
    .addTag('Course Enrollment (User)', 'Course enrollment, progress tracking, and learning management for users')
    .addTag('Challenges', 'Community challenges, task management, and participation tracking')
    .addTag('Events', 'Event creation, management, ticketing, and attendee management')
    .addTag('Posts', 'Community posts, comments, and social interaction features')
    .addTag('Products', 'Product management, pricing, and e-commerce features within communities')
    .addTag('Upload', 'File upload, management, and media handling for various content types')
    .addTag('Admin', 'Administrative operations, system management, and admin-only features')
    .addTag('Resources', 'Resource management, organization, and content library features')
    .addTag('Sessions', 'User session management, booking, and one-on-one interactions')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
      deepScanRoutes: true,
      ignoreGlobalPrefix: false,
    });

    // Custom Swagger UI configuration
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        tryItOutEnabled: true,
        filter: true,
        showRequestHeaders: true,
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        displayRequestDuration: true,
        deepLinking: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        validatorUrl: null,
        supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch']
      },
      customSiteTitle: 'Shabaka API Documentation',
      customfavIcon: '/favicon.ico',
      customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { 
        color: #2c3e50; 
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 1rem;
      }
      .swagger-ui .info .description { 
        font-size: 1.1rem;
        line-height: 1.6;
        color: #555;
      }
      .swagger-ui .info .contact { 
        margin-top: 1rem;
      }
      .swagger-ui .scheme-container { 
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        margin: 1rem 0;
      }
      .swagger-ui .btn.authorize { 
        background-color: #007bff;
        border-color: #007bff;
      }
      .swagger-ui .btn.authorize:hover { 
        background-color: #0056b3;
        border-color: #0056b3;
      }
      .swagger-ui .opblock.opblock-post { 
        border-color: #28a745;
      }
      .swagger-ui .opblock.opblock-get { 
        border-color: #007bff;
      }
      .swagger-ui .opblock.opblock-put { 
        border-color: #ffc107;
      }
      .swagger-ui .opblock.opblock-delete { 
        border-color: #dc3545;
      }
      .swagger-ui .opblock.opblock-patch { 
        border-color: #6f42c1;
      }
      .swagger-ui .opblock .opblock-summary-description { 
        font-style: italic;
        color: #666;
      }
      .swagger-ui .response-col_status { 
        font-weight: bold;
      }
      .swagger-ui .response-col_description__inner p { 
        margin: 0.5rem 0;
      }
      .swagger-ui .model-example { 
        background-color: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 4px;
        padding: 0.5rem;
        margin: 0.5rem 0;
      }
      .swagger-ui .highlight-code { 
        background-color: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 4px;
        padding: 1rem;
        margin: 1rem 0;
        overflow-x: auto;
      }
      .swagger-ui .parameter__name { 
        font-weight: 600;
        color: #2c3e50;
      }
      .swagger-ui .parameter__type { 
        color: #6c757d;
        font-size: 0.9rem;
      }
      .swagger-ui .parameter__deprecated { 
        background-color: #fff3cd;
        border: 1px solid #ffeaa7;
        border-radius: 4px;
        padding: 0.5rem;
        margin: 0.5rem 0;
      }
      .swagger-ui .model-title { 
        color: #2c3e50;
        font-weight: 600;
      }
      .swagger-ui .model .property { 
        border-bottom: 1px solid #e9ecef;
        padding: 0.5rem 0;
      }
      .swagger-ui .model .property:last-child { 
        border-bottom: none;
      }
      .swagger-ui .model .property.primitive { 
        color: #6c757d;
      }
      .swagger-ui .model .property.required { 
        color: #dc3545;
        font-weight: 600;
      }
      .swagger-ui .model .property.required::after { 
        content: ' *';
        color: #dc3545;
      }
      .swagger-ui .opblock-tag { 
        border-bottom: 2px solid #007bff;
        margin-bottom: 1rem;
      }
      .swagger-ui .opblock-tag small { 
        color: #6c757d;
        font-style: italic;
      }
      .swagger-ui .opblock-tag.no-desc small { 
        display: none;
      }
      .swagger-ui .opblock-tag small:after { 
        content: '';
      }
      .swagger-ui .opblock-tag small:before { 
        content: '';
      }
      .swagger-ui .opblock-tag small { 
        display: block;
        margin-top: 0.5rem;
        font-size: 0.9rem;
        line-height: 1.4;
      }
    `,
      customJs: [
        'https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js',
        'https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js'
      ],
      customJsStr: [
        'console.log("Shabaka API Documentation loaded successfully!");',
        '',
        '// Wait for Swagger UI to be ready',
        'setTimeout(() => {',
        '  // Add copy button for code examples',
        '  const codeBlocks = document.querySelectorAll(".highlight-code pre");',
        '  codeBlocks.forEach(block => {',
        '    const button = document.createElement("button");',
        '    button.textContent = "Copy";',
        '    button.className = "copy-button";',
        '    button.style.cssText = "position: absolute; top: 10px; right: 10px; background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;";',
        '    block.style.position = "relative";',
        '    block.appendChild(button);',
        '    ',
        '    button.addEventListener("click", () => {',
        '      navigator.clipboard.writeText(block.textContent);',
        '      button.textContent = "Copied!";',
        '      setTimeout(() => { button.textContent = "Copy"; }, 2000);',
        '    });',
        '  });',
        '}, 1000);'
      ].join('\n')
    });
  } else {
    console.log('🔒 Swagger UI is disabled (set ENABLE_SWAGGER=true to enable in production).');
  }

  const host = process.env.HOST || (isProduction ? '127.0.0.1' : '0.0.0.0');
  await app.listen(port, host);

  const baseUrl = `http://${localIP}:${port}`;

  if (isProduction) {
    // Minimal production logging
    console.log(`🚀 Chabaqa API Server started on port ${port}`);
    console.log(`🌐 Base URL: ${baseUrl}`);
    console.log(`📚 API Docs: ${baseUrl}/api/docs`);
    console.log(`🌐 Environment: production\n`);
  } else {
    // Detailed development logging
    // Get local network IP address
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          🚀 CHABAQA BACKEND SERVER STARTED                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`📍 Port: ${port}`);
    console.log(`🌐 Binding: 0.0.0.0 (all network interfaces)`);
    console.log(`🌐 Detected IP: ${localIP}\n`);

    console.log(`🌐 Base URL (LAN): ${baseUrl}`);

    console.log('📋 AVAILABLE ENDPOINTS:\n');
    console.log(`   💻 Web Browser (localhost):`);
    console.log(`      → http://localhost:${port}/api/docs`);
    console.log(`      → http://localhost:${port}/api/auth/register\n`);

    console.log(`   📱 Mobile App (network IP):`);
    console.log(`      → http://${localIP}:${port}/api/docs`);
    console.log(`      → http://${localIP}:${port}/api/auth/register\n`);

    console.log(`   🤖 Android Emulator:`);
    console.log(`      → http://10.0.2.2:${port}/api/docs`);
    console.log(`      → http://10.0.2.2:${port}/api/auth/register\n`);

    console.log('🔧 MOBILE APP CONFIGURATION:\n');
    console.log(`   Update mobile/.env with ONE of these:`);
    console.log(`   ✓ EXPO_PUBLIC_API_URL=http://${localIP}:${port}`);
    console.log(`   ✓ EXPO_PUBLIC_API_URL=http://10.0.2.2:${port} (Android emulator)`);
    console.log(`   ✓ EXPO_PUBLIC_API_URL=http://localhost:${port} (iOS simulator)\n`);

    console.log('✅ CORS: Enabled (accepting all origins in development)');
    console.log('✅ Request Logging: Enabled');
    console.log('✅ MongoDB: Connected');
    console.log('\n🎯 Backend ready to accept mobile connections!\n');
  }
}
bootstrap();
