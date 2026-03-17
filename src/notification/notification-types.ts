/** Canonical notification type identifiers used across the platform. */
export enum NotificationType {
  // Mentions
  POST_MENTION = 'post_mention',
  COMMENT_MENTION = 'comment_mention',

  // Messaging
  NEW_DM_MESSAGE = 'new_dm_message',

  // Events
  EVENT_REMINDER = 'event_reminder',
  EVENT_CREATED = 'event_created',

  // Community
  NEW_COMMUNITY_MEMBER = 'new_community_member',
  MEMBER_JOINED = 'member_joined',

  // Courses
  COURSE_CREATED = 'course_created',
  COURSE_ENROLLED = 'course_enrolled',

  // Challenges
  CHALLENGE_CREATED = 'challenge_created',
  CHALLENGE_COMPLETED = 'challenge_completed',

  // Commerce
  PRODUCT_PURCHASED = 'product_purchased',
  PAYMENT_RECEIVED = 'payment_received',

  // Analytics
  ANALYTICS_UPDATE = 'analytics_update',

  // System
  SYSTEM_ERROR = 'system_error',
}

/**
 * Default channel preferences per notification type.
 * If a type is not listed here, all channels default to true.
 */
export const DEFAULT_CHANNEL_PREFERENCES: Record<
  string,
  { inApp: boolean; email: boolean; push: boolean }
> = {
  [NotificationType.POST_MENTION]: { inApp: true, email: true, push: true },
  [NotificationType.COMMENT_MENTION]: { inApp: true, email: true, push: true },
  [NotificationType.NEW_DM_MESSAGE]: { inApp: true, email: false, push: true },
  [NotificationType.EVENT_REMINDER]: { inApp: true, email: true, push: true },
  [NotificationType.EVENT_CREATED]: { inApp: true, email: true, push: false },
  [NotificationType.NEW_COMMUNITY_MEMBER]: { inApp: true, email: true, push: true },
  [NotificationType.MEMBER_JOINED]: { inApp: true, email: false, push: false },
  [NotificationType.COURSE_CREATED]: { inApp: true, email: true, push: false },
  [NotificationType.COURSE_ENROLLED]: { inApp: true, email: true, push: true },
  [NotificationType.CHALLENGE_CREATED]: { inApp: true, email: true, push: false },
  [NotificationType.CHALLENGE_COMPLETED]: { inApp: true, email: true, push: true },
  [NotificationType.PRODUCT_PURCHASED]: { inApp: true, email: true, push: true },
  [NotificationType.PAYMENT_RECEIVED]: { inApp: true, email: true, push: true },
  [NotificationType.ANALYTICS_UPDATE]: { inApp: true, email: false, push: false },
  [NotificationType.SYSTEM_ERROR]: { inApp: true, email: true, push: false },
};

/** Types that always force in-app + push regardless of user preferences. */
export const FORCED_NOTIFICATION_TYPES = new Set<string>([
  NotificationType.NEW_COMMUNITY_MEMBER,
]);

/** Types considered high-priority (bypass quiet hours). */
export const HIGH_PRIORITY_TYPES = new Set<string>([
  NotificationType.PAYMENT_RECEIVED,
  NotificationType.SYSTEM_ERROR,
]);
