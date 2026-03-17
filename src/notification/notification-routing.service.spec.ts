import { NotificationRoutingService } from './notification-routing.service';
import { NotificationType } from './notification-types';

describe('NotificationRoutingService', () => {
  let service: NotificationRoutingService;

  beforeEach(() => {
    service = new NotificationRoutingService();
  });

  it('resolves post_mention with communityId and postId', () => {
    expect(
      service.resolveUrl(NotificationType.POST_MENTION, {
        communityId: 'c1',
        postId: 'p1',
      }),
    ).toBe('/creator/communities/c1/posts/p1');
  });

  it('resolves comment_mention with communityId and postId', () => {
    expect(
      service.resolveUrl(NotificationType.COMMENT_MENTION, {
        communityId: 'c1',
        postId: 'p1',
      }),
    ).toBe('/creator/communities/c1/posts/p1');
  });

  it('resolves new_dm_message with conversationId', () => {
    expect(
      service.resolveUrl(NotificationType.NEW_DM_MESSAGE, {
        conversationId: 'conv1',
      }),
    ).toBe('/creator/messages/conv1');
  });

  it('resolves event_reminder with eventId', () => {
    expect(
      service.resolveUrl(NotificationType.EVENT_REMINDER, { eventId: 'e1' }),
    ).toBe('/creator/events/e1');
  });

  it('resolves new_community_member with communityId', () => {
    expect(
      service.resolveUrl(NotificationType.NEW_COMMUNITY_MEMBER, {
        communityId: 'c1',
      }),
    ).toBe('/creator/communities/c1/members');
  });

  it('resolves payment_received to revenue page', () => {
    expect(service.resolveUrl(NotificationType.PAYMENT_RECEIVED, {})).toBe(
      '/creator/revenue',
    );
  });

  it('falls back to /creator/notifications for unknown types', () => {
    expect(service.resolveUrl('unknown_type', {})).toBe(
      '/creator/notifications',
    );
  });

  it('falls back when required data is missing', () => {
    expect(service.resolveUrl(NotificationType.POST_MENTION, {})).toBe(
      '/creator/notifications',
    );
  });
});
