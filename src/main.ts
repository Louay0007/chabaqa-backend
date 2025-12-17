import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { WAFMiddleware } from './common/middleware/waf.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);


  app.use(express.static('public'));
  app.use('/uploads', express.static('uploads'));


  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));


  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));


  app.use(cookieParser());


  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors) => {
      const formattedErrors = errors.map(error => ({
        field: error.property,
        messages: Object.values(error.constraints || {}),
      }));
      console.error('❌ Validation Error:', JSON.stringify(formattedErrors, null, 2));
      return new Error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
    },
  }));


  app.useGlobalFilters(new HttpExceptionFilter());


  app.setGlobalPrefix('api');


  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.log(`🌐 CORS Mode: ${isProduction ? 'PRODUCTION (restrictif)' : 'DEVELOPMENT (permissif)'}`);
  }

  app.enableCors({

    origin: true,
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
    console.log('✅ CORS enabled - Accepting all origins in development mode');
  }

  // Request logging middleware (development only)
  if (!isProduction) {
    app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`📥 [${timestamp}] ${req.method} ${req.url} - Origin: ${req.get('origin') || 'No origin'}`);
      next();
    });
  }


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
    .addServer('http://localhost:3001', 'Development Server')
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

  // Start the application
  const port = process.env.PORT || 3000;

  // Bind to 0.0.0.0 to allow connections from both localhost and network
  await app.listen(port, '0.0.0.0');

  if (isProduction) {
    // Minimal production logging
    console.log(`🚀 Chabaqa API Server started on port ${port}`);
    console.log(`📚 API Docs: http://localhost:${port}/api/docs`);
    console.log(`🌐 Environment: production\n`);
  } else {
    // Detailed development logging
    // Get local network IP address
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';

    for (const interfaceName in networkInterfaces) {
      const networkInterface = networkInterfaces[interfaceName];
      for (const network of networkInterface) {
        if (network.family === 'IPv4' && !network.internal) {
          localIP = network.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          🚀 CHABAQA BACKEND SERVER STARTED                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`📍 Port: ${port}`);
    console.log(`🌐 Binding: 0.0.0.0 (all network interfaces)`);
    console.log(`🌐 Detected IP: ${localIP}\n`);

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
