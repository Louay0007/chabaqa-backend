import { InactivityPeriod } from '../schema/email-campaign.schema';

export type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

export const renderTemplate = (template: string, variables: TemplateVariables): string => {
  let result = template || '';
  for (const [key, value] of Object.entries(variables)) {
    const replacement = value === null || value === undefined ? '' : String(value);
    result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), replacement);
  }
  return result;
};

export const inactivityPeriodToText = (period?: InactivityPeriod): string => {
  switch (period) {
    case InactivityPeriod.LAST_7_DAYS:
      return '7 days';
    case InactivityPeriod.LAST_15_DAYS:
      return '15 days';
    case InactivityPeriod.LAST_30_DAYS:
      return '30 days';
    case InactivityPeriod.LAST_60_DAYS:
      return '60 days';
    case InactivityPeriod.MORE_THAN_60_DAYS:
      return 'more than 60 days';
    default:
      return '';
  }
};

export const contentTypeToLabel = (contentType?: string): string => {
  switch (contentType) {
    case 'cours':
      return 'course';
    case 'event':
    case 'challenge':
    case 'product':
    case 'session':
      return contentType;
    case 'all':
      return 'content';
    default:
      return contentType || '';
  }
};
