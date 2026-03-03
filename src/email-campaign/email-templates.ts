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

type InactivityTemplateOptions = {
  badge: string;
  title: string;
  intro: string;
  highlights: string[];
  ctaLabel: string;
  accentColor: string;
  softBackground: string;
  closing: string;
};

const buildInactivityTemplate = (options: InactivityTemplateOptions): string => {
  const highlightsHtml = options.highlights
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#334155;font-size:14px;line-height:1.6;">
            ${item}
          </td>
        </tr>
      `,
    )
    .join('');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#ffffff;">
      <div style="padding:18px 22px;background:${options.softBackground};border-bottom:1px solid #e5e7eb;">
        <p style="margin:0;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${options.accentColor};font-weight:700;">
          ${options.badge}
        </p>
        <h2 style="margin:8px 0 0 0;font-size:24px;line-height:1.3;color:#0f172a;">
          ${options.title}
        </h2>
      </div>

      <div style="padding:22px;color:#334155;font-size:15px;line-height:1.75;">
        <p style="margin:0 0 14px 0;">${options.intro}</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px 0;">
          ${highlightsHtml}
        </table>

        <div style="margin:18px 0 10px 0;">
          <a href="{{communityUrl}}" style="display:inline-block;background:${options.accentColor};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">
            ${options.ctaLabel}
          </a>
        </div>

        <p style="margin:0;color:#64748b;font-size:13px;">
          ${options.closing}
        </p>
      </div>
    </div>
  `;
};

export class EmailTemplates {
  /**
   * Template for users inactive for 7 days
   */
  static readonly INACTIVE_7_DAYS = {
    subject: "A quick update from {{communityName}}",
    content: buildInactivityTemplate({
      badge: '7-Day Check-In',
      title: 'Your community is active and waiting for you.',
      intro:
        'It has been about 7 days since your last visit. Here is what changed inside {{communityName}}.',
      highlights: [
        'New learning resources and practical updates',
        'Fresh conversations from members in your network',
        'Upcoming sessions and collaborative activities',
      ],
      ctaLabel: 'Open Community',
      accentColor: '#2563eb',
      softBackground: 'linear-gradient(120deg,#eff6ff 0%,#f8fafc 100%)',
      closing: 'Thanks for being part of {{communityName}}.',
    }),
  };

  /**
   * Template for users inactive for 15 days
   */
  static readonly INACTIVE_15_DAYS = {
    subject: "Important updates are waiting in {{communityName}}",
    content: buildInactivityTemplate({
      badge: '15-Day Follow-Up',
      title: 'Do not miss your latest updates.',
      intro:
        'It has been around 15 days since your last login. We prepared new highlights for you in {{communityName}}.',
      highlights: [
        'New content releases and community resources',
        'Announcements from creators and moderators',
        'Member-only opportunities and featured discussions',
      ],
      ctaLabel: 'See What Is New',
      accentColor: '#059669',
      softBackground: 'linear-gradient(120deg,#ecfdf5 0%,#f0fdf4 100%)',
      closing: 'Your next step is one click away.',
    }),
  };

  /**
   * Template for users inactive for 30 days
   */
  static readonly INACTIVE_30_DAYS = {
    subject: "Your progress in {{communityName}} is waiting",
    content: buildInactivityTemplate({
      badge: '30-Day Re-Engagement',
      title: 'We have saved your place in the community.',
      intro:
        'It has been around 30 days since your last activity. Here is what you can jump back into right now.',
      highlights: [
        'Updated learning tracks and practical guides',
        'High-value posts and curated recommendations',
        'New events and participation opportunities',
      ],
      ctaLabel: 'Return To Community',
      accentColor: '#ea580c',
      softBackground: 'linear-gradient(120deg,#fff7ed 0%,#fef2f2 100%)',
      closing: 'You are always welcome in {{communityName}}.',
    }),
  };

  /**
   * Template for users inactive for 60+ days
   */
  static readonly INACTIVE_60_PLUS_DAYS = {
    subject: "A welcome-back invitation from {{communityName}}",
    content: buildInactivityTemplate({
      badge: '60+ Day Comeback',
      title: 'A lot has changed since your last visit.',
      intro:
        'You have been away for over 60 days, so we prepared a focused way to rejoin the momentum in {{communityName}}.',
      highlights: [
        'Newest resources selected for fast onboarding',
        'Priority updates to help you catch up quickly',
        'Featured activities where you can restart today',
      ],
      ctaLabel: 'Rejoin Now',
      accentColor: '#dc2626',
      softBackground: 'linear-gradient(120deg,#fff1f2 0%,#fee2e2 100%)',
      closing: 'We would be happy to see you back.',
    }),
  };

  /**
   * Generic template for any inactivity period
   */
  static readonly GENERIC_INACTIVE = {
    subject: "We miss you in {{communityName}}",
    content: buildInactivityTemplate({
      badge: 'Community Update',
      title: 'Your next session is ready when you are.',
      intro:
        'It has been around {{daysThreshold}} days since your last login. Here is a quick snapshot of what is new.',
      highlights: [
        'New content and useful resources',
        'Fresh conversations and member activity',
        'Upcoming opportunities to reconnect',
      ],
      ctaLabel: 'Visit Community',
      accentColor: '#2563eb',
      softBackground: 'linear-gradient(120deg,#eff6ff 0%,#f8fafc 100%)',
      closing: 'See you again in {{communityName}}.',
    }),
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
