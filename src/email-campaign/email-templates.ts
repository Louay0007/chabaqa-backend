import { InactivityPeriod } from '../schema/email-campaign.schema';

/**
 * Email templates for inactive user campaigns
 * These templates include variables that will be replaced with actual data
 */
export enum ContentType {
  EVENT = 'event',
  CHALLENGE = 'challenge',
  COURS = 'cours',
  PRODUCT = 'product',
  SESSION = 'session',
  ALL = 'all'
}

export class EmailTemplates {
  /**
   * Template for users inactive for 7 days
   */
  static readonly INACTIVE_7_DAYS = {
    subject: "We miss you! Come back to {{communityName}}",
    content: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">We miss you! 👋</h2>
        
        <p>Hi there!</p>
        
        <p>We noticed you haven't logged in for 7 days, and we wanted to check in!</p>
        
        <p>We've been busy adding new content and features that we think you'll love:</p>
        <ul>
          <li>New courses and challenges</li>
          <li>Exciting community events</li>
          <li>Exclusive member benefits</li>
        </ul>
        
        <p>Come back and see what's new in <strong>{{communityName}}</strong>!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{communityUrl}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Visit Community
          </a>
        </div>
        
        <p>Best regards,<br>
        The {{communityName}} Team</p>
      </div>
    `
  };

  /**
   * Template for users inactive for 15 days
   */
  static readonly INACTIVE_15_DAYS = {
    subject: "Don't miss out! Important updates in {{communityName}}",
    content: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Important Updates! 📢</h2>
        
        <p>Hi there!</p>
        
        <p>It's been 15 days since your last login, and we have some exciting updates to share!</p>
        
        <p>We've added:</p>
        <ul>
          <li>New courses and challenges</li>
          <li>Exclusive member benefits</li>
          <li>Community events</li>
          <li>Premium content</li>
        </ul>
        
        <p>Don't miss out on what's happening in <strong>{{communityName}}</strong>!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{communityUrl}}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Check Updates
          </a>
        </div>
        
        <p>Best regards,<br>
        The {{communityName}} Team</p>
      </div>
    `
  };

  /**
   * Template for users inactive for 30 days
   */
  static readonly INACTIVE_30_DAYS = {
    subject: "We're worried about you! Come back to {{communityName}}",
    content: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">We're worried about you! 😟</h2>
        
        <p>Hi there!</p>
        
        <p>It's been 30 days since your last login, and we're starting to worry!</p>
        
        <p>We've been working hard to make {{communityName}} even better:</p>
        <ul>
          <li>New premium courses</li>
          <li>Exclusive challenges</li>
          <li>Member-only events</li>
          <li>Special discounts</li>
        </ul>
        
        <p>We'd love to welcome you back and show you everything that's new!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{communityUrl}}" style="background-color: #ffc107; color: #333; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Come Back Now
          </a>
        </div>
        
        <p>See you soon!<br>
        The {{communityName}} Team</p>
      </div>
    `
  };

  /**
   * Template for users inactive for 60+ days
   */
  static readonly INACTIVE_60_PLUS_DAYS = {
    subject: "Exclusive offer for returning members of {{communityName}}",
    content: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Exclusive Offer! 🎁</h2>
        
        <p>Hi there!</p>
        
        <p>As a valued member who's been away for more than 60 days, we have something special for you!</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #dc3545; margin-top: 0;">Special Welcome Back Offer:</h3>
          <ul>
            <li>50% off all premium courses</li>
            <li>Free access to exclusive content</li>
            <li>Priority support</li>
            <li>Member-only events</li>
          </ul>
        </div>
        
        <p>This offer is exclusively for returning members like you. Don't miss out!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{communityUrl}}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Claim Your Offer
          </a>
        </div>
        
        <p>Welcome back to <strong>{{communityName}}</strong>!<br>
        The {{communityName}} Team</p>
      </div>
    `
  };

  /**
   * Generic template for any inactivity period
   */
  static readonly GENERIC_INACTIVE = {
    subject: "We miss you! Come back to {{communityName}}",
    content: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">We miss you! 👋</h2>
        
        <p>Hi there!</p>
        
        <p>We noticed you haven't logged in for {{daysThreshold}} days, and we wanted to check in!</p>
        
        <p>We've been busy adding new content and features that we think you'll love.</p>
        
        <p>Come back and see what's new in <strong>{{communityName}}</strong>!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{communityUrl}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Visit Community
          </a>
        </div>
        
        <p>Best regards,<br>
        The {{communityName}} Team</p>
      </div>
    `
  };

  /**
   * Get template based on inactivity period
   */
  static getTemplateForPeriod(period: InactivityPeriod): { subject: string; content: string } {
    switch (period) {
      case InactivityPeriod.LAST_7_DAYS:
        return this.INACTIVE_7_DAYS;
      case InactivityPeriod.LAST_15_DAYS:
        return this.INACTIVE_15_DAYS;
      case InactivityPeriod.LAST_30_DAYS:
        return this.INACTIVE_30_DAYS;
      case InactivityPeriod.LAST_60_DAYS:
      case InactivityPeriod.MORE_THAN_60_DAYS:
        return this.INACTIVE_60_PLUS_DAYS;
      default:
        return this.GENERIC_INACTIVE;
    }
  }

  /**
   * Get all available templates
   */
  static getAllTemplates(): Array<{ period: InactivityPeriod; template: { subject: string; content: string } }> {
    return [
      { period: InactivityPeriod.LAST_7_DAYS, template: this.INACTIVE_7_DAYS },
      { period: InactivityPeriod.LAST_15_DAYS, template: this.INACTIVE_15_DAYS },
      { period: InactivityPeriod.LAST_30_DAYS, template: this.INACTIVE_30_DAYS },
      { period: InactivityPeriod.LAST_60_DAYS, template: this.INACTIVE_60_PLUS_DAYS },
      { period: InactivityPeriod.MORE_THAN_60_DAYS, template: this.INACTIVE_60_PLUS_DAYS }
    ];
  }
}

/**
 * Service for processing email templates and replacing variables
 */
export class EmailTemplateProcessor {
  /**
   * Process template content by replacing variables
   */
  static processTemplate(
    template: string,
    variables: Record<string, string | number>
  ): string {
    let processedTemplate = template;

    // Replace all variables in the format {{variableName}}
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedTemplate = processedTemplate.replace(regex, String(value));
    }

    return processedTemplate;
  }

  /**
   * Get default variables for inactive user campaigns
   */
  static getDefaultVariables(
    communityName: string,
    inactivityPeriod: InactivityPeriod,
    communityUrl?: string
  ): Record<string, string | number> {
    const daysThreshold = this.getDaysThreshold(inactivityPeriod);
    
    return {
      communityName,
      daysThreshold,
      inactivityPeriod: this.getPeriodText(inactivityPeriod),
      communityUrl: communityUrl || `https://yourdomain.com/community/${communityName.toLowerCase().replace(/\s+/g, '-')}`,
      currentYear: new Date().getFullYear(),
      currentDate: new Date().toLocaleDateString()
    };
  }

  /**
   * Get days threshold for inactivity period
   */
  private static getDaysThreshold(period: InactivityPeriod): number {
    switch (period) {
      case InactivityPeriod.LAST_7_DAYS: return 7;
      case InactivityPeriod.LAST_15_DAYS: return 15;
      case InactivityPeriod.LAST_30_DAYS: return 30;
      case InactivityPeriod.LAST_60_DAYS: return 60;
      case InactivityPeriod.MORE_THAN_60_DAYS: return 60;
      default: return 7;
    }
  }

  /**
   * Get period text for inactivity period
   */
  private static getPeriodText(period: InactivityPeriod): string {
    switch (period) {
      case InactivityPeriod.LAST_7_DAYS: return '7 days';
      case InactivityPeriod.LAST_15_DAYS: return '15 days';
      case InactivityPeriod.LAST_30_DAYS: return '30 days';
      case InactivityPeriod.LAST_60_DAYS: return '60 days';
      case InactivityPeriod.MORE_THAN_60_DAYS: return 'more than 60 days';
      default: return '7 days';
    }
  }
}
