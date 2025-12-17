import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { BotDetectionService } from '../services/bot-detection.service';
import { SecurityService } from '../services/security.service';
import { SkipBotDetection } from '../guards/bot-detection.guard';

export class VerifyCaptchaDto {
  token: string;
  answer: string;
}

@ApiTags('Security')
@Controller('security/captcha')
@SkipBotDetection() // Skip bot detection for CAPTCHA endpoints
export class CaptchaController {
  private readonly logger = new Logger(CaptchaController.name);

  constructor(
    private botDetectionService: BotDetectionService,
    private securityService: SecurityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get CAPTCHA challenge',
    description: 'Generate a new CAPTCHA challenge for bot verification'
  })
  @ApiResponse({
    status: 200,
    description: 'CAPTCHA challenge generated successfully',
    schema: {
      type: 'object',
      properties: {
        challenge: {
          type: 'string',
          example: 'What is 7 + 5?',
          description: 'The CAPTCHA question to display to the user'
        },
        token: {
          type: 'string',
          example: 'abc123def456...',
          description: 'Unique token to identify this challenge'
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'When the challenge was generated'
        }
      }
    }
  })
  @ApiResponse({
    status: 429,
    description: 'Too many CAPTCHA requests'
  })
  async getCaptcha(@Req() req: Request, @Res() res: Response) {
    try {
      const clientIP = this.getClientIP(req);
      
      // Rate limiting for CAPTCHA requests (prevent abuse)
      const rateLimitKey = `captcha_requests:${clientIP}`;
      // This would normally use a proper rate limiter, but for simplicity:
      
      // Generate CAPTCHA challenge
      const captchaData = await this.botDetectionService.generateCaptchaChallenge(clientIP);
      
      // Log CAPTCHA generation
      this.securityService.logSecurityEvent(
        'CAPTCHA_GENERATED',
        {
          ip: clientIP,
          userAgent: req.get('User-Agent'),
          token: captchaData.token,
        },
        'info'
      );

      res.status(HttpStatus.OK).json({
        challenge: captchaData.challenge,
        token: captchaData.token,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to generate CAPTCHA:', error);
      
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to generate CAPTCHA challenge',
        error: 'CAPTCHA_GENERATION_FAILED',
      });
    }
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verify CAPTCHA response',
    description: 'Verify the user\'s answer to a CAPTCHA challenge'
  })
  @ApiBody({
    type: VerifyCaptchaDto,
    description: 'CAPTCHA verification data',
    examples: {
      example1: {
        summary: 'Basic verification',
        value: {
          token: 'abc123def456...',
          answer: '12'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'CAPTCHA verification result',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the CAPTCHA was solved correctly'
        },
        message: {
          type: 'string',
          description: 'Result message'
        },
        verified: {
          type: 'boolean',
          description: 'Whether the user is now verified'
        },
        timestamp: {
          type: 'string',
          format: 'date-time'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid CAPTCHA token or answer'
  })
  async verifyCaptcha(
    @Body() body: VerifyCaptchaDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    try {
      const clientIP = this.getClientIP(req);
      const { token, answer } = body;

      if (!token || !answer) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Token and answer are required',
          error: 'MISSING_PARAMETERS',
        });
      }

      // Verify CAPTCHA
      const isValid = await this.botDetectionService.verifyCaptcha(token, answer, clientIP);
      
      // Log verification attempt
      this.securityService.logSecurityEvent(
        isValid ? 'CAPTCHA_VERIFIED_SUCCESS' : 'CAPTCHA_VERIFIED_FAILED',
        {
          ip: clientIP,
          userAgent: req.get('User-Agent'),
          token,
          answer,
          success: isValid,
        },
        isValid ? 'info' : 'warn'
      );

      if (isValid) {
        res.status(HttpStatus.OK).json({
          success: true,
          message: 'CAPTCHA verified successfully',
          verified: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Invalid CAPTCHA answer or expired token',
          verified: false,
          error: 'CAPTCHA_VERIFICATION_FAILED',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('CAPTCHA verification error:', error);
      
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'CAPTCHA verification failed',
        error: 'CAPTCHA_VERIFICATION_ERROR',
      });
    }
  }

  @Get('status')
  @ApiOperation({
    summary: 'Check CAPTCHA verification status',
    description: 'Check if the current IP has passed CAPTCHA verification recently'
  })
  @ApiResponse({
    status: 200,
    description: 'CAPTCHA verification status',
    schema: {
      type: 'object',
      properties: {
        verified: {
          type: 'boolean',
          description: 'Whether the IP is currently verified'
        },
        timestamp: {
          type: 'string',
          format: 'date-time'
        }
      }
    }
  })
  async getCaptchaStatus(@Req() req: Request, @Res() res: Response) {
    try {
      const clientIP = this.getClientIP(req);
      
      const isVerified = await this.botDetectionService.isCaptchaVerified(clientIP);
      
      res.status(HttpStatus.OK).json({
        verified: isVerified,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to check CAPTCHA status:', error);
      
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        verified: false,
        error: 'STATUS_CHECK_FAILED',
      });
    }
  }

  @Get('image')
  @ApiOperation({
    summary: 'Generate visual CAPTCHA image',
    description: 'Generate a visual CAPTCHA image (alternative to text-based)'
  })
  @ApiResponse({
    status: 200,
    description: 'CAPTCHA image generated',
    content: {
      'image/png': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  async getCaptchaImage(@Req() req: Request, @Res() res: Response) {
    try {
      const clientIP = this.getClientIP(req);
      
      // For now, return a simple base64 encoded placeholder
      // In production, you'd use a library like 'canvas' to generate actual CAPTCHA images
      const placeholderSvg = `
        <svg width="200" height="60" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="60" fill="#f0f0f0" stroke="#ccc"/>
          <text x="100" y="35" text-anchor="middle" font-family="Arial" font-size="16"
                fill="#333" transform="rotate(-5 100 35)">
            Visual CAPTCHA
          </text>
          <line x1="20" y1="10" x2="180" y2="50" stroke="#ddd" stroke-width="1"/>
          <line x1="20" y1="50" x2="180" y2="10" stroke="#ddd" stroke-width="1"/>
        </svg>
      `;

      const buffer = Buffer.from(placeholderSvg);
      
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.status(HttpStatus.OK).send(buffer);
      
      // Log image CAPTCHA request
      this.securityService.logSecurityEvent(
        'CAPTCHA_IMAGE_REQUESTED',
        {
          ip: clientIP,
          userAgent: req.get('User-Agent'),
        },
        'info'
      );
    } catch (error) {
      this.logger.error('Failed to generate CAPTCHA image:', error);
      
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to generate CAPTCHA image',
        error: 'IMAGE_GENERATION_FAILED',
      });
    }
  }

  private getClientIP(req: Request): string {
    // Check multiple headers for real IP
    const headers = [
      'CF-Connecting-IP', // Cloudflare
      'True-Client-IP', // Akamai, Cloudflare
      'X-Real-IP', // Nginx
      'X-Forwarded-For', // Standard proxy header
    ];

    for (const header of headers) {
      const value = req.get(header);
      if (value) {
        return value.split(',')[0].trim();
      }
    }

    return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
  }
}
