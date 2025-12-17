import { Controller, Get, Post, Query, Request, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('google-calendar')
@UseGuards(JwtAuthGuard)
@ApiTags('Google Calendar Integration')
@ApiBearerAuth()
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * Get Google OAuth authorization URL
   */
  @Get('auth-url')
  @ApiOperation({
    summary: 'Get Google OAuth authorization URL',
    description: 'Get the URL to authorize Google Calendar access for the current user'
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string', example: 'https://accounts.google.com/oauth/authorize?...' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getAuthUrl(@Request() req): { authUrl: string } {
    const authUrl = this.googleCalendarService.getAuthUrl(req.user.id);
    return { authUrl };
  }

  /**
   * Handle Google OAuth callback
   */
  @Get('callback')
  @ApiOperation({
    summary: 'Handle Google OAuth callback',
    description: 'Exchange authorization code for access tokens'
  })
  @ApiQuery({
    name: 'code',
    description: 'Authorization code from Google',
    example: '4/0AX4XfWh...'
  })
  @ApiQuery({
    name: 'state',
    description: 'State parameter (user ID)',
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({
    status: 200,
    description: 'Google Calendar connected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Google Calendar connected successfully' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid code or failed to connect' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    // Verify state matches current user for security
    if (state !== req.user.id) {
      throw new Error('Invalid state parameter');
    }
    
    return this.googleCalendarService.handleCallback(code, req.user.id);
  }

  /**
   * Get Google Calendar connection status
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get Google Calendar connection status',
    description: 'Check if the user has connected Google Calendar and if the connection is valid'
  })
  @ApiResponse({
    status: 200,
    description: 'Connection status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        connected: { type: 'boolean', example: true },
        hasValidAccess: { type: 'boolean', example: true }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnectionStatus(@Request() req): Promise<{ connected: boolean; hasValidAccess: boolean }> {
    return this.googleCalendarService.getConnectionStatus(req.user.id);
  }

  /**
   * Disconnect Google Calendar
   */
  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disconnect Google Calendar',
    description: 'Remove Google Calendar access for the current user'
  })
  @ApiResponse({
    status: 200,
    description: 'Google Calendar disconnected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Google Calendar disconnected successfully' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - failed to disconnect' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async disconnectGoogleCalendar(@Request() req): Promise<{ success: boolean; message: string }> {
    return this.googleCalendarService.disconnectGoogleCalendar(req.user.id);
  }
}
