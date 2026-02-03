import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

export class CommunityCreatorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  avatar?: string;

  @ApiProperty()
  verified?: boolean;
}

export class CommunityStatsDto {
  @ApiProperty()
  totalRevenue: number;

  @ApiProperty()
  monthlyGrowth: number;

  @ApiProperty()
  engagementRate: number;

  @ApiProperty()
  retentionRate: number;
}

export class CommunityResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  logo: string;

  @ApiProperty()
  coverImage: string;

  @ApiProperty({ type: CommunityCreatorDto })
  creator: CommunityCreatorDto;

  @ApiProperty({ example: 'active' })
  status?: 'pending' | 'approved' | 'rejected' | 'active' | 'inactive' | 'suspended';

  @ApiProperty({ example: 150 })
  membersCount: number;

  @ApiProperty({ example: 45 })
  contentCount: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isPrivate: boolean;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty()
  featured: boolean;

  @ApiProperty()
  priceType: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  ratingCount: number;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: CommunityStatsDto })
  stats: CommunityStatsDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  adminNotes?: string;

  @ApiProperty()
  approvalStatus?: string;

  @ApiProperty()
  approvedBy?: string;

  @ApiProperty()
  approvedAt?: Date;

  @ApiProperty()
  rejectionReason?: string;

  @ApiProperty({ required: false })
  members?: any[];

  @ApiProperty({ required: false })
  content?: any[];

  @ApiProperty({ required: false })
  analytics?: {
    totalRevenue: number;
    activeMembers: number;
    contentPublished: number;
    engagementRate: number;
  };
}

export class CommunityApprovalRequestDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  logo: string;

  @ApiProperty()
  coverImage: string;

  @ApiProperty({ type: CommunityCreatorDto })
  creator: CommunityCreatorDto;

  @ApiProperty()
  priceType: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  submittedAt: Date;

  @ApiProperty()
  status: string;

  @ApiProperty()
  reviewedBy?: string;

  @ApiProperty()
  reviewedAt?: Date;

  @ApiProperty()
  reviewNotes?: string;
}

export class CommunityAnalyticsDto {
  @ApiProperty()
  communityId: string;

  @ApiProperty()
  communityName: string;

  @ApiProperty()
  membersCount: number;

  @ApiProperty()
  memberGrowth: {
    daily: number;
    weekly: number;
    monthly: number;
  };

  @ApiProperty()
  engagementMetrics: {
    activeMembers: number;
    engagementRate: number;
    averageSessionDuration: number;
  };

  @ApiProperty()
  revenueMetrics: {
    totalRevenue: number;
    monthlyRecurringRevenue: number;
    averageRevenuePerUser: number;
  };

  @ApiProperty()
  contentMetrics: {
    totalPosts: number;
    totalCourses: number;
    totalEvents: number;
  };

  @ApiProperty()
  retentionMetrics: {
    day1Retention: number;
    day7Retention: number;
    day30Retention: number;
  };

  @ApiProperty()
  period: {
    startDate: Date;
    endDate: Date;
  };
}