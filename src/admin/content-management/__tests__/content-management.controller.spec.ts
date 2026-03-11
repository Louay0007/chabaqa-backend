import { ContentManagementController } from '../content-management.controller';
import { ContentManagementService } from '../content-management.service';
import { ContentStatus } from '../enums/content-status.enum';
import { AdminAction } from '../../schemas/audit-log.schema';

describe('ContentManagementController', () => {
  let controller: ContentManagementController;
  let mockService: any;

  const testAdminId = 'admin-123';
  const testAdmin = {
    _id: testAdminId,
    name: 'Test Admin',
    email: 'admin@test.com',
  };

  const mockReq = {
    user: {
      id: testAdminId,
    },
  };

  beforeEach(async () => {
    mockService = {
      getContentSummary: jest.fn(),
      getCourses: jest.fn(),
      getCourseById: jest.fn(),
      approveCourse: jest.fn(),
      rejectCourse: jest.fn(),
      featureCourse: jest.fn(),
      getCourseEnrollments: jest.fn(),
      bulkApproveCourses: jest.fn(),
      getChallenges: jest.fn(),
      getChallengeById: jest.fn(),
      getChallengeSubmissions: jest.fn(),
      approveChallenge: jest.fn(),
      rejectChallenge: jest.fn(),
      endChallengeEarly: jest.fn(),
      approveSubmission: jest.fn(),
      rejectSubmission: jest.fn(),
      getEvents: jest.fn(),
      getEventById: jest.fn(),
      getEventAttendees: jest.fn(),
      approveEvent: jest.fn(),
      rejectEvent: jest.fn(),
      cancelEvent: jest.fn(),
      messageAttendees: jest.fn(),
      getPosts: jest.fn(),
      getPostById: jest.fn(),
      moderatePost: jest.fn(),
      featurePost: jest.fn(),
      deletePost: jest.fn(),
      deleteComment: jest.fn(),
    };

    // Unit-test style: instantiate controller directly to avoid resolving guards/providers
    controller = new ContentManagementController(mockService as unknown as ContentManagementService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== SUMMARY ENDPOINTS ====================
  describe('GET /admin/content/summary', () => {
    it('should return content summary with correct structure', async () => {
      const mockSummary = {
        courses: { total: 100, pending: 10, featured: 20 },
        challenges: { total: 50, pending: 5, active: 15, featured: 10 },
        events: { total: 75, pending: 8, upcoming: 30, featured: 15 },
        posts: { total: 500, hidden: 25, featured: 50 },
      };

      mockService.getContentSummary.mockResolvedValue(mockSummary);

      const result = await controller.getContentSummary(mockReq as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSummary);
      expect(mockService.getContentSummary).toHaveBeenCalledWith(testAdminId);
    });

    it('should return zero counts when no content exists', async () => {
      const mockSummary = {
        courses: { total: 0, pending: 0, featured: 0 },
        challenges: { total: 0, pending: 0, active: 0, featured: 0 },
        events: { total: 0, pending: 0, upcoming: 0, featured: 0 },
        posts: { total: 0, hidden: 0, featured: 0 },
      };

      mockService.getContentSummary.mockResolvedValue(mockSummary);

      const result = await controller.getContentSummary(mockReq as any);

      expect(result.data.courses.total).toBe(0);
      expect(result.data.challenges.total).toBe(0);
      expect(result.data.events.total).toBe(0);
      expect(result.data.posts.total).toBe(0);
    });
  });

  // ==================== COURSES ENDPOINTS ====================
  describe('GET /admin/content/courses', () => {
    it('should return paginated courses list', async () => {
      const mockCourses = {
        data: [
          {
            id: 'course-1',
            title: 'Test Course',
            status: ContentStatus.APPROVED,
            enrollmentCount: 50,
            sectionCount: 5,
            chapterCount: 20,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      mockService.getCourses.mockResolvedValue(mockCourses);

      const result = await controller.getCourses({}, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCourses);
      expect(mockService.getCourses).toHaveBeenCalledWith(expect.anything(), testAdminId);
    });

    it('should pass filter parameters correctly', async () => {
      const filters = {
        status: ContentStatus.PENDING,
        minPrice: 10,
        maxPrice: 100,
        page: 2,
        limit: 10,
      };

      mockService.getCourses.mockResolvedValue({
        data: [],
        total: 0,
        page: 2,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });

      await controller.getCourses(filters, mockReq as any);

      expect(mockService.getCourses).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ContentStatus.PENDING,
          minPrice: 10,
          maxPrice: 100,
          page: 2,
          limit: 10,
        }),
        testAdminId,
      );
    });
  });

  describe('GET /admin/content/courses/:id', () => {
    it('should return course details', async () => {
      const mockCourse = {
        id: 'course-1',
        title: 'Test Course',
        description: 'Test Description',
        sections: [
          {
            id: 'sec-1',
            title: 'Section 1',
            chapters: [{ id: 'chap-1', title: 'Chapter 1' }],
          },
        ],
      };

      mockService.getCourseById.mockResolvedValue(mockCourse);

      const result = await controller.getCourseById('course-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCourse);
    });
  });

  describe('PUT /admin/content/courses/:id/approve', () => {
    it('should approve a course', async () => {
      mockService.approveCourse.mockResolvedValue(undefined);
      const approveDto = {};

      const result = await controller.approveCourse('course-1', approveDto, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Course approved successfully');
      expect(mockService.approveCourse).toHaveBeenCalledWith('course-1', testAdminId);
    });
  });

  describe('PUT /admin/content/courses/:id/reject', () => {
    it('should reject a course with reason', async () => {
      mockService.rejectCourse.mockResolvedValue(undefined);
      const rejectDto = { reason: 'Inappropriate content', notes: 'Violates guidelines' };

      const result = await controller.rejectCourse('course-1', rejectDto, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Course rejected successfully');
      expect(mockService.rejectCourse).toHaveBeenCalledWith('course-1', rejectDto, testAdminId);
    });
  });

  describe('PUT /admin/content/courses/:id/feature', () => {
    it('should feature a course', async () => {
      mockService.featureCourse.mockResolvedValue(undefined);

      const result = await controller.featureCourse('course-1', true, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Course featured successfully');
      expect(mockService.featureCourse).toHaveBeenCalledWith('course-1', true, testAdminId);
    });

    it('should unfeature a course', async () => {
      mockService.featureCourse.mockResolvedValue(undefined);

      const result = await controller.featureCourse('course-1', false, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Course unfeatured successfully');
      expect(mockService.featureCourse).toHaveBeenCalledWith('course-1', false, testAdminId);
    });
  });

  describe('GET /admin/content/courses/:id/enrollments', () => {
    it('should return course enrollments', async () => {
      const mockEnrollments = {
        data: [
          {
            id: 'enrollment-1',
            user: { id: 'user-1', name: 'Test User', email: 'user@test.com' },
            enrolledAt: new Date(),
            progress: 75,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      mockService.getCourseEnrollments.mockResolvedValue(mockEnrollments);

      const result = await controller.getCourseEnrollments('course-1', { page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockEnrollments);
    });
  });

  describe('POST /admin/content/courses/bulk-approve', () => {
    it('should bulk approve courses successfully', async () => {
      const bulkResult = {
        success: true,
        processed: 3,
        succeeded: 3,
        failed: 0,
        errors: undefined,
      };

      mockService.bulkApproveCourses.mockResolvedValue(bulkResult);

      const result = await controller.bulkApproveCourses(
        { ids: ['course-1', 'course-2', 'course-3'], action: ContentStatus.APPROVED },
        mockReq as any
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(bulkResult);
      expect(result.message).toBe('Processed 3 courses: 3 succeeded, 0 failed');
    });

    it('should handle partial failures in bulk operation', async () => {
      const bulkResult = {
        success: false,
        processed: 3,
        succeeded: 2,
        failed: 1,
        errors: [{ id: 'course-3', error: 'Course not found' }],
      };

      mockService.bulkApproveCourses.mockResolvedValue(bulkResult);

      const result = await controller.bulkApproveCourses(
        { ids: ['course-1', 'course-2', 'course-3'], action: ContentStatus.APPROVED },
        mockReq as any
      );

      expect(result.success).toBe(false);
      expect(result.data.succeeded).toBe(2);
      expect(result.data.failed).toBe(1);
    });
  });

  // ==================== CHALLENGES ENDPOINTS ====================
  describe('GET /admin/content/challenges', () => {
    it('should return paginated challenges list', async () => {
      const mockChallenges = {
        data: [
          {
            id: 'challenge-1',
            title: 'Test Challenge',
            status: ContentStatus.APPROVED,
            challengeStatus: 'active',
            participantCount: 25,
            submissionCount: 15,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      mockService.getChallenges.mockResolvedValue(mockChallenges);

      const result = await controller.getChallenges({}, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockChallenges);
    });
  });

  describe('GET /admin/content/challenges/:id', () => {
    it('should return challenge details with tasks', async () => {
      const mockChallenge = {
        id: 'challenge-1',
        title: 'Test Challenge',
        tasks: [
          { id: 'task-1', day: 1, title: 'Day 1 Task', points: 10 },
          { id: 'task-2', day: 2, title: 'Day 2 Task', points: 20 },
        ],
        resources: [{ id: 'res-1', title: 'Resource 1', type: 'pdf' }],
      };

      mockService.getChallengeById.mockResolvedValue(mockChallenge);

      const result = await controller.getChallengeById('challenge-1');

      expect(result.success).toBe(true);
      expect(result.data.tasks).toHaveLength(2);
      expect(result.data.resources).toHaveLength(1);
    });
  });

  describe('GET /admin/content/challenges/:id/submissions', () => {
    it('should return challenge submissions', async () => {
      const mockSubmissions = {
        data: [
          {
            id: 'submission-1',
            user: { id: 'user-1', name: 'Test User' },
            status: 'approved',
            content: 'My submission',
            points: 100,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      mockService.getChallengeSubmissions.mockResolvedValue(mockSubmissions);

      const result = await controller.getChallengeSubmissions('challenge-1', {});

      expect(result.success).toBe(true);
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('PUT /admin/content/challenges/:id/approve', () => {
    it('should approve a challenge', async () => {
      mockService.approveChallenge.mockResolvedValue(undefined);

      const result = await controller.approveChallenge('challenge-1', mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Challenge approved successfully');
    });
  });

  describe('PUT /admin/content/challenges/:id/end', () => {
    it('should end challenge early', async () => {
      mockService.endChallengeEarly.mockResolvedValue(undefined);

      const result = await controller.endChallengeEarly('challenge-1', mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Challenge ended successfully');
    });
  });

  describe('PUT /admin/content/challenges/submissions/:id/approve', () => {
    it('should approve submission with feedback', async () => {
      mockService.approveSubmission.mockResolvedValue(undefined);
      const approveDto = { feedback: 'Great work!', markAsWinner: true };

      const result = await controller.approveSubmission('submission-1', approveDto, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Submission approved successfully');
    });
  });

  describe('PUT /admin/content/challenges/submissions/:id/reject', () => {
    it('should reject submission with reason', async () => {
      mockService.rejectSubmission.mockResolvedValue(undefined);
      const rejectDto = { reason: 'Incomplete work', feedback: 'Please complete all tasks' };

      const result = await controller.rejectSubmission('submission-1', rejectDto, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Submission rejected successfully');
    });
  });

  // ==================== EVENTS ENDPOINTS ====================
  describe('GET /admin/content/events', () => {
    it('should return paginated events list', async () => {
      const mockEvents = {
        data: [
          {
            id: 'event-1',
            title: 'Test Event',
            status: ContentStatus.APPROVED,
            eventStatus: 'upcoming',
            attendeeCount: 45,
            maxAttendees: 100,
            location: 'Online',
            isOnline: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      mockService.getEvents.mockResolvedValue(mockEvents);

      const result = await controller.getEvents({}, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockEvents);
    });
  });

  describe('GET /admin/content/events/:id', () => {
    it('should return event details with agenda', async () => {
      const mockEvent = {
        id: 'event-1',
        title: 'Test Event',
        agenda: [
          { id: 'agenda-1', startTime: '09:00', endTime: '10:00', title: 'Opening' },
        ],
        speakers: [{ id: 'speaker-1', name: 'John Doe', title: 'Keynote Speaker' }],
        ticketTypes: [{ id: 'ticket-1', type: 'vip', name: 'VIP', price: 50, sold: 10 }],
      };

      mockService.getEventById.mockResolvedValue(mockEvent);

      const result = await controller.getEventById('event-1');

      expect(result.success).toBe(true);
      expect(result.data.agenda).toHaveLength(1);
      expect(result.data.speakers).toHaveLength(1);
    });
  });

  describe('GET /admin/content/events/:id/attendees', () => {
    it('should return event attendees', async () => {
      const mockAttendees = {
        data: [
          {
            id: 'attendee-1',
            user: { id: 'user-1', name: 'Test User' },
            ticketType: 'standard',
            checkedIn: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      mockService.getEventAttendees.mockResolvedValue(mockAttendees);

      const result = await controller.getEventAttendees('event-1', { page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('PUT /admin/content/events/:id/approve', () => {
    it('should approve an event', async () => {
      mockService.approveEvent.mockResolvedValue(undefined);

      const result = await controller.approveEvent('event-1', mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Event approved successfully');
    });
  });

  describe('PUT /admin/content/events/:id/cancel', () => {
    it('should cancel an event with reason', async () => {
      mockService.cancelEvent.mockResolvedValue(undefined);

      const result = await controller.cancelEvent('event-1', 'Weather emergency', mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Event cancelled successfully');
    });
  });

  describe('POST /admin/content/events/:id/message-attendees', () => {
    it('should send message to attendees', async () => {
      mockService.messageAttendees.mockResolvedValue(undefined);
      const messageDto = { message: 'Event starting in 30 minutes!', sendEmail: true };

      const result = await controller.messageAttendees('event-1', messageDto, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Message sent to attendees');
    });
  });

  // ==================== POSTS ENDPOINTS ====================
  describe('GET /admin/content/posts', () => {
    it('should return paginated posts list', async () => {
      const mockPosts = {
        data: [
          {
            id: 'post-1',
            title: 'Test Post',
            content: 'Test content',
            status: ContentStatus.APPROVED,
            likeCount: 100,
            commentCount: 25,
            isFeatured: false,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      mockService.getPosts.mockResolvedValue(mockPosts);

      const result = await controller.getPosts({}, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPosts);
    });
  });

  describe('GET /admin/content/posts/:id', () => {
    it('should return post details with comments', async () => {
      const mockPost = {
        id: 'post-1',
        title: 'Test Post',
        content: 'Test content',
        comments: [
          {
            id: 'comment-1',
            content: 'Great post!',
            user: { id: 'user-1', name: 'Test User' },
          },
        ],
      };

      mockService.getPostById.mockResolvedValue(mockPost);

      const result = await controller.getPostById('post-1');

      expect(result.success).toBe(true);
      expect(result.data.comments).toHaveLength(1);
    });
  });

  describe('PUT /admin/content/posts/:id/moderate', () => {
    it('should hide a post', async () => {
      mockService.moderatePost.mockResolvedValue(undefined);

      const result = await controller.moderatePost('post-1', 'hide', mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Post hidden successfully');
      expect(mockService.moderatePost).toHaveBeenCalledWith('post-1', 'hide', testAdminId);
    });

    it('should delete a post', async () => {
      mockService.moderatePost.mockResolvedValue(undefined);

      const result = await controller.moderatePost('post-1', 'delete', mockReq as any);

      expect(result.success).toBe(true);
      expect(mockService.moderatePost).toHaveBeenCalledWith('post-1', 'delete', testAdminId);
    });

    it('should restore a post', async () => {
      mockService.moderatePost.mockResolvedValue(undefined);

      const result = await controller.moderatePost('post-1', 'restore', mockReq as any);

      expect(result.success).toBe(true);
      expect(mockService.moderatePost).toHaveBeenCalledWith('post-1', 'restore', testAdminId);
    });
  });

  describe('PUT /admin/content/posts/:id/feature', () => {
    it('should feature a post', async () => {
      mockService.featurePost.mockResolvedValue(undefined);

      const result = await controller.featurePost('post-1', true, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Post featured successfully');
    });

    it('should unfeature a post', async () => {
      mockService.featurePost.mockResolvedValue(undefined);

      const result = await controller.featurePost('post-1', false, mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Post unfeatured successfully');
    });
  });

  describe('DELETE /admin/content/posts/:id', () => {
    it('should delete a post', async () => {
      mockService.deletePost.mockResolvedValue(undefined);

      const result = await controller.deletePost('post-1', mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Post deleted successfully');
    });
  });

  describe('DELETE /admin/content/posts/:postId/comments/:commentId', () => {
    it('should delete a comment', async () => {
      mockService.deleteComment.mockResolvedValue(undefined);

      const result = await controller.deleteComment('post-1', 'comment-1', mockReq as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Comment deleted successfully');
    });
  });

  // ==================== ERROR RESPONSE TESTS ====================
  describe('error handling', () => {
    it('should handle service errors gracefully for summary', async () => {
      mockService.getContentSummary.mockRejectedValue(new Error('Database error'));

      await expect(controller.getContentSummary(mockReq as any)).rejects.toThrow('Database error');
    });

    it('should handle not found errors for course details', async () => {
      mockService.getCourseById.mockRejectedValue(new Error('Course not found'));

      await expect(controller.getCourseById('invalid-id')).rejects.toThrow('Course not found');
    });

    it('should handle not found errors for challenge details', async () => {
      mockService.getChallengeById.mockRejectedValue(new Error('Challenge not found'));

      await expect(controller.getChallengeById('invalid-id')).rejects.toThrow('Challenge not found');
    });

    it('should handle not found errors for event details', async () => {
      mockService.getEventById.mockRejectedValue(new Error('Event not found'));

      await expect(controller.getEventById('invalid-id')).rejects.toThrow('Event not found');
    });

    it('should handle not found errors for post details', async () => {
      mockService.getPostById.mockRejectedValue(new Error('Post not found'));

      await expect(controller.getPostById('invalid-id')).rejects.toThrow('Post not found');
    });
  });

  // ==================== ADMIN USER EXTRACTION TESTS ====================
  describe('admin user extraction', () => {
    it('should correctly extract admin user ID from request', async () => {
      const customReq = { user: { id: 'custom-admin-456' } };
      mockService.getCourses.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });

      await controller.getCourses({}, customReq as any);

      expect(mockService.getCourses).toHaveBeenCalledWith(expect.anything(), 'custom-admin-456');
    });
  });
});
