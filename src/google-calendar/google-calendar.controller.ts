import { Controller, Get, Post, Body, Query, Request, Res, UseGuards, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('google-calendar')
@ApiTags('Google Calendar Integration')
@ApiBearerAuth()
export class GoogleCalendarController {
  private readonly logger = new Logger(GoogleCalendarController.name);
  
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * Helper to extract user ID from JWT payload
   */
  private getUserId(req: any): string {
    const userId = req.user?._id || req.user?.userId || req.user?.sub || req.user?.id;
    this.logger.debug(`[getUserId] Extracted userId: ${userId} from JWT: ${JSON.stringify(req.user)}`);
    return userId;
  }

  /**
   * Get Google OAuth authorization URL
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
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
    const userId = this.getUserId(req);
    this.logger.log(`[getAuthUrl] Generating auth URL for user: ${userId}`);
    const authUrl = this.googleCalendarService.getAuthUrl(userId);
    return { authUrl };
  }

  /**
   * Handle Google OAuth callback - PUBLIC endpoint (no JWT required)
   * This is called by Google's redirect, so we use the state parameter for user identification
   * Returns HTML page that signals result to parent window and auto-closes
   */
  @Get('callback')
  @ApiOperation({
    summary: 'Handle Google OAuth callback (redirect from Google)',
    description: 'Exchange authorization code for access tokens - called by Google redirect'
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
  async handleCallbackGet(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<void> {
    this.logger.log(`[handleCallbackGet] Received callback with code: ${code?.substring(0, 10)}..., state (userId): ${state}`);
    
    // Helper to return HTML result page
    const sendResultPage = (success: boolean, message: string) => {
      const eventType = success ? 'GOOGLE_CALENDAR_SUCCESS' : 'GOOGLE_CALENDAR_ERROR';
      const safeMessage = message.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
      res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
      res.send(`<!DOCTYPE html>
<html><head><title>Google Calendar - ${success ? 'Connected' : 'Error'}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
  .c{text-align:center;padding:20px}
  .success{color:#16a34a;font-size:18px;font-weight:600}
  .err{color:#dc2626;font-size:18px}
  .sub{color:#666;margin-top:10px}
</style>
</head>
<body>
<div class="c">
<p class="${success ? 'success' : 'err'}">${success ? '✓ Google Calendar connected successfully!' : message}</p>
<p class="sub">You can close this window now.</p>
</div>
<script>
(function(){
  // Signal to parent window via localStorage
  var result = JSON.stringify({type:'${eventType}',message:'${safeMessage}'});
  localStorage.removeItem('google_calendar_oauth_pending');
  localStorage.removeItem('google_calendar_oauth_token');
  
  // Set result multiple times to ensure storage event fires
  localStorage.setItem('google_calendar_oauth_result', result);
  
  // Force storage event by toggling
  setTimeout(function(){
    localStorage.removeItem('google_calendar_oauth_result');
    localStorage.setItem('google_calendar_oauth_result', result);
  }, 100);
  
  // Try to close window (may not work due to browser security)
  setTimeout(function(){
    try { window.close(); } catch(e) {}
  }, 1500);
  
  // Keep trying to close
  var closeAttempts = 0;
  var closeInterval = setInterval(function(){
    closeAttempts++;
    try { window.close(); } catch(e) {}
    if (closeAttempts > 10) clearInterval(closeInterval);
  }, 1000);
})();
</script>
</body></html>`);
    };

    if (!code || !state) {
      sendResultPage(false, 'Missing code or state parameter');
      return;
    }
    
    try {
      // State contains the user ID (set in getAuthUrl)
      const result = await this.googleCalendarService.handleCallback(code, state);
      sendResultPage(result.success, result.message);
    } catch (error: any) {
      this.logger.error(`[handleCallbackGet] Error: ${error.message}`);
      sendResultPage(false, error.message || 'Failed to connect Google Calendar');
    }
  }

  /**
   * Handle Google OAuth callback - POST endpoint for frontend to call with JWT
   */
  @Post('callback')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle Google OAuth callback (from frontend)',
    description: 'Exchange authorization code for access tokens - called by frontend with JWT'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Authorization code from Google' }
      }
    }
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
  async handleCallbackPost(
    @Body('code') code: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = this.getUserId(req);
    this.logger.log(`[handleCallbackPost] Received callback with code: ${code?.substring(0, 10)}..., userId: ${userId}`);
    
    if (!code) {
      throw new Error('Missing authorization code');
    }
    
    return this.googleCalendarService.handleCallback(code, userId);
  }

  /**
   * Get Google Calendar connection status
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
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
    const userId = this.getUserId(req);
    this.logger.debug(`[getConnectionStatus] Checking status for user: ${userId}`);
    return this.googleCalendarService.getConnectionStatus(userId);
  }

  /**
   * Disconnect Google Calendar
   */
  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
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
    const userId = this.getUserId(req);
    this.logger.log(`[disconnectGoogleCalendar] Disconnecting for user: ${userId}`);
    return this.googleCalendarService.disconnectGoogleCalendar(userId);
  }
}
