import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schema/user.schema';
import { Session, SessionDocument } from '../schema/session.schema';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private oauth2Client: OAuth2Client;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
    );
  }

  /**
   * Generate Google OAuth authorization URL
   */
  getAuthUrl(userId: string): string {
    this.logger.log(`[getAuthUrl] Generating auth URL for user: ${userId}`);
    this.logger.debug(`[getAuthUrl] GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID?.substring(0, 20)}...`);
    this.logger.debug(`[getAuthUrl] GOOGLE_REDIRECT_URI: ${process.env.GOOGLE_REDIRECT_URI}`);
    
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    // Generate base auth URL
    let authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to get refresh token
      include_granted_scopes: true
    });
    
    // Manually add state parameter (the library sometimes doesn't include it properly)
    const stateParam = `state=${encodeURIComponent(userId)}`;
    if (authUrl.includes('?')) {
      authUrl = `${authUrl}&${stateParam}`;
    } else {
      authUrl = `${authUrl}?${stateParam}`;
    }
    
    this.logger.log(`[getAuthUrl] Generated auth URL with state=${userId}`);
    this.logger.debug(`[getAuthUrl] Full auth URL: ${authUrl}`);
    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async handleCallback(code: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`[handleCallback] Exchanging code for tokens, userId: ${userId}`);
      const { tokens } = await this.oauth2Client.getToken(code);
      this.logger.log(`[handleCallback] Got tokens, scope: ${tokens.scope}`);
      
      // Verify the state matches the user ID for security
      if (tokens.scope && !tokens.scope.includes('calendar')) {
        this.logger.error('[handleCallback] Calendar access not granted in scope');
        throw new BadRequestException('Calendar access not granted');
      }

      // Save tokens to user document
      const updateResult = await this.userModel.findByIdAndUpdate(userId, {
        googleTokens: {
          access_token: tokens.access_token!,
          refresh_token: tokens.refresh_token!,
          scope: tokens.scope!,
          token_type: tokens.token_type!,
          expiry_date: tokens.expiry_date!
        }
      }, { new: true });

      this.logger.log(`[handleCallback] Google Calendar connected for user ${userId}, update result: ${!!updateResult}`);
      return { success: true, message: 'Google Calendar connected successfully' };
    } catch (error: any) {
      this.logger.error(`[handleCallback] Error: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to connect Google Calendar: ${error.message}`);
    }
  }

  /**
   * Check if user has valid Google Calendar access
   */
  async hasValidAccess(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('googleTokens');
    if (!user?.googleTokens) return false;

    // Check if token is expired
    const now = Date.now();
    if (user.googleTokens.expiry_date && now >= user.googleTokens.expiry_date) {
      // Try to refresh the token
      return await this.refreshUserToken(userId);
    }

    return true;
  }

  /**
   * Refresh user's Google token
   */
  private async refreshUserToken(userId: string): Promise<boolean> {
    try {
      const user = await this.userModel.findById(userId).select('googleTokens');
      if (!user?.googleTokens?.refresh_token) return false;

      this.oauth2Client.setCredentials({
        refresh_token: user.googleTokens.refresh_token
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // Update user with new tokens
      await this.userModel.findByIdAndUpdate(userId, {
        googleTokens: {
          ...user.googleTokens,
          access_token: credentials.access_token!,
          expiry_date: credentials.expiry_date!
        }
      });

      return true;
    } catch (error) {
      this.logger.error('Error refreshing Google token:', error);
      return false;
    }
  }

  /**
   * Create Google Calendar event with Meet link
   */
  async createCalendarEventWithMeet(
    creatorId: string,
    sessionId: string,
    attendeeEmail: string,
    startTime: Date,
    endTime: Date,
    sessionTitle: string,
    sessionDescription?: string
  ): Promise<{ meetLink: string; eventId: string }> {
    try {
      // Check if creator has valid Google access
      const hasAccess = await this.hasValidAccess(creatorId);
      if (!hasAccess) {
        throw new UnauthorizedException('Creator must connect Google Calendar first');
      }

      // Get creator's tokens
      const creator = await this.userModel.findById(creatorId).select('googleTokens email');
      if (!creator?.googleTokens) {
        throw new UnauthorizedException('Google Calendar not connected');
      }

      // Set up OAuth client with creator's tokens
      this.oauth2Client.setCredentials({
        access_token: creator.googleTokens.access_token,
        refresh_token: creator.googleTokens.refresh_token
      });

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      // Create the event with Meet link
      const event = {
        summary: sessionTitle,
        description: sessionDescription || `Session: ${sessionTitle}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC',
        },
        attendees: [
          { email: attendeeEmail },
          { email: creator.email } // Include creator
        ],
        conferenceData: {
          createRequest: {
            requestId: new Types.ObjectId().toString(),
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: true,
        },
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        conferenceDataVersion: 1
      });

      const meetLink = response.data.conferenceData?.entryPoints?.[0]?.uri;
      const eventId = response.data.id;

      if (!meetLink || !eventId) {
        throw new BadRequestException('Failed to create Google Meet link');
      }

      this.logger.log(`Created Google Meet event ${eventId} for session ${sessionId}`);
      
      return { meetLink, eventId };
    } catch (error) {
      this.logger.error('Error creating Google Calendar event:', error);
      throw new BadRequestException('Failed to create Google Meet link');
    }
  }

  /**
   * Disconnect Google Calendar for user
   */
  async disconnectGoogleCalendar(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.userModel.findByIdAndUpdate(userId, {
        $unset: { googleTokens: 1 }
      });

      this.logger.log(`Google Calendar disconnected for user ${userId}`);
      return { success: true, message: 'Google Calendar disconnected successfully' };
    } catch (error) {
      this.logger.error('Error disconnecting Google Calendar:', error);
      throw new BadRequestException('Failed to disconnect Google Calendar');
    }
  }

  /**
   * Get Google Calendar connection status
   */
  async getConnectionStatus(userId: string): Promise<{ connected: boolean; hasValidAccess: boolean }> {
    this.logger.debug(`[getConnectionStatus] Checking status for user: ${userId}`);
    const user = await this.userModel.findById(userId).select('googleTokens');
    const connected = !!user?.googleTokens;
    this.logger.debug(`[getConnectionStatus] User found: ${!!user}, connected: ${connected}`);
    const hasValidAccess = connected ? await this.hasValidAccess(userId) : false;
    this.logger.debug(`[getConnectionStatus] hasValidAccess: ${hasValidAccess}`);
    
    return { connected, hasValidAccess };
  }
}
