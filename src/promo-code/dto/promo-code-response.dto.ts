import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export class PromoCodeResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: 'SUMMER25' })
  code: string;

  @ApiPropertyOptional({ example: 25 })
  percentOff?: number;

  @ApiPropertyOptional({ example: 10 })
  amountOffDT?: number;

  @ApiPropertyOptional({ enum: TrackableContentType })
  appliesToType?: TrackableContentType;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  appliesToId?: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  creatorId?: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  communityId?: string;

  @ApiPropertyOptional({ example: '2024-06-01T00:00:00.000Z' })
  startsAt?: Date;

  @ApiPropertyOptional({ example: '2024-12-31T23:59:59.999Z' })
  endsAt?: Date;

  @ApiPropertyOptional({ example: 100 })
  maxRedemptions?: number;

  @ApiProperty({ example: 0 })
  redemptionsCount: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: ['vip@example.com'], type: [String] })
  allowedEmails?: string[];

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class PromoCodeUsageDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  orderId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  buyerId: string;

  @ApiProperty({ example: 'user@example.com' })
  buyerEmail: string;

  @ApiProperty({ example: 'John Doe' })
  buyerName: string;

  @ApiProperty({ example: 100 })
  originalAmount: number;

  @ApiProperty({ example: 20 })
  discountAmount: number;

  @ApiProperty({ example: 80 })
  finalAmount: number;

  @ApiProperty({ example: 'course' })
  contentType: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  contentId: string;

  @ApiProperty({ example: 'Advanced TypeScript Course' })
  contentTitle?: string;

  @ApiProperty({ example: '2024-06-15T14:30:00.000Z' })
  usedAt: Date;

  @ApiProperty({ example: 'paid' })
  orderStatus: string;
}

export class PromoCodeStatsDto {
  @ApiProperty({ example: 'SUMMER25' })
  code: string;

  @ApiProperty({ example: 150 })
  totalUses: number;

  @ApiProperty({ example: 12500 })
  totalRevenue: number;

  @ApiProperty({ example: 3750 })
  totalDiscounts: number;

  @ApiProperty({ example: 83.33 })
  averageDiscount: number;

  @ApiProperty({ example: 100 })
  maxRedemptions?: number;

  @ApiProperty({ example: 50 })
  remainingUses?: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-06-01T00:00:00.000Z' })
  startsAt?: Date;

  @ApiProperty({ example: '2024-12-31T23:59:59.999Z' })
  endsAt?: Date;
}
