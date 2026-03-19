import { ContentStatus, ContentType } from '../enums/content-status.enum';

export interface UserSummaryDto {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface CommunitySummaryDto {
  id: string;
  name: string;
  slug: string;
}

export interface ContentStatsDto {
  viewCount?: number;
  enrollmentCount?: number;
  participantCount?: number;
  attendeeCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
}

export class ContentSummaryDto {
  id: string;
  title: string;
  type: string;
  status: string;
  creator: UserSummaryDto;
  community: CommunitySummaryDto;
  createdAt: Date;
  updatedAt: Date;
  isFeatured: boolean;
  stats: ContentStatsDto;
}

export class CourseResponseDto {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  status: string;
  creator: UserSummaryDto;
  community: CommunitySummaryDto;
  price: number;
  currency: string;
  isPaidCourse: boolean;
  enrollmentCount: number;
  sectionCount: number;
  chapterCount: number;
  isPublished: boolean;
  category?: string;
  level?: string;
  sequentialProgression: boolean;
  averageRating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
  isFeatured: boolean;
}

export class CourseDetailDto extends CourseResponseDto {
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    order: number;
    chapters: Array<{
      id: string;
      title: string;
      content: string;
      videoUrl?: string;
      duration?: number;
      order: number;
      isPreview: boolean;
      isPaidChapter: boolean;
      prix?: number;
      notes?: string;
    }>;
  }>;
  resources: Array<{
    id: string;
    title: string;
    type: string;
    url: string;
    description: string;
    order: number;
  }>;
  learningObjectives?: string[];
  requirements?: string[];
  notes?: string;
}

export class ChallengeResponseDto {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  status: string;
  creator: UserSummaryDto;
  community: CommunitySummaryDto;
  startDate: Date;
  endDate: Date;
  participantCount: number;
  submissionCount: number;
  prizeInfo?: string;
  challengeStatus: 'upcoming' | 'active' | 'ended';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  maxParticipants?: number;
  isTeamChallenge: boolean;
  createdAt: Date;
  updatedAt: Date;
  isFeatured: boolean;
}

export class ChallengeDetailDto extends ChallengeResponseDto {
  rules: string;
  evaluationCriteria?: string[];
  tasks: Array<{
    id: string;
    day: number;
    title: string;
    description: string;
    deliverable: string;
    points: number;
    isActive: boolean;
  }>;
  resources: Array<{
    id: string;
    title: string;
    type: string;
    url: string;
  }>;
  prizes?: Array<{
    position: number;
    description: string;
    value?: string;
  }>;
  hashtags?: string[];
}

export class ChallengeSubmissionDto {
  id: string;
  challengeId: string;
  user: UserSummaryDto;
  content: string;
  attachments?: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: UserSummaryDto;
  feedback?: string;
  isWinner: boolean;
  points: number;
}

export class EventResponseDto {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  status: string;
  creator: UserSummaryDto;
  community: CommunitySummaryDto;
  startDate: Date;
  endDate: Date;
  location: string;
  isOnline: boolean;
  onlineLink?: string;
  attendeeCount: number;
  maxAttendees?: number;
  eventStatus: 'upcoming' | 'ongoing' | 'ended' | 'cancelled';
  ticketTypes: Array<{
    id: string;
    type: string;
    name: string;
    price: number;
    quantity?: number;
    sold: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
  isFeatured: boolean;
}

export class EventDetailDto extends EventResponseDto {
  agenda?: Array<{
    id: string;
    startTime: string;
    endTime: string;
    title: string;
    description: string;
    speaker?: string;
  }>;
  speakers?: Array<{
    id: string;
    name: string;
    title: string;
    bio?: string;
    avatar?: string;
  }>;
  requirements?: string[];
  whatToBring?: string[];
  isPrivate: boolean;
  approvalRequired: boolean;
}

export class EventAttendeeDto {
  id: string;
  user: UserSummaryDto;
  ticketType: string;
  registeredAt: Date;
  checkedIn: boolean;
  checkedInAt?: Date;
  status: 'registered' | 'cancelled' | 'attended';
}

export class PostResponseDto {
  id: string;
  title?: string;
  content: string;
  excerpt?: string;
  thumbnail?: string;
  status: string;
  author: UserSummaryDto;
  community: CommunitySummaryDto;
  likeCount: number;
  commentCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  isFeatured: boolean;
}

export class PostDetailDto extends PostResponseDto {
  comments: Array<{
    id: string;
    content: string;
    user: UserSummaryDto;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export class PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export class BulkOperationResult {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  errors?: Array<{
    id: string;
    error: string;
  }>;
}
