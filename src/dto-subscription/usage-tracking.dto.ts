import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsDateString, IsOptional, IsEnum } from 'class-validator';

export enum UsageMetricType {
  COMMUNITIES_CREATED = 'communities_created',
  MEMBERS_ADDED = 'members_added', 
  COURSES_ACTIVATED = 'courses_activated',
  STORAGE_USED = 'storage_used',
  ADMINS_ADDED = 'admins_added',
  API_REQUESTS = 'api_requests',
  EMAIL_SENT = 'email_sent',
  AUTOMATION_TRIGGERED = 'automation_triggered'
}

export class UsageTrackingDto {
  @ApiProperty({ 
    description: 'Metric type',
    enum: UsageMetricType
  })
  @IsEnum(UsageMetricType)
  metricType: string;

  @ApiProperty({ 
    description: 'Usage value',
    example: 5
  })
  @IsNumber()
  value: number;

  @ApiProperty({ 
    description: 'Customer/Creator ID',
    example: '507f1f77bcf86cd799439012'
  })
  @IsString()
  customerId: string;

  @ApiProperty({ 
    description: 'Subscription ID',
    example: 'sub_1234567890'
  })
  @IsString()
  subscriptionId: string;

  @ApiPropertyOptional({ 
    description: 'Resource ID related to usage',
    example: 'comm_1234567890'
  })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiProperty({ 
    description: 'Timestamp when usage occurred',
    example: '2024-01-15T10:30:00.000Z'
  })
  @IsDateString()
  timestamp: string;
}

export class UsageSummaryDto {
  @ApiProperty({ 
    description: 'Customer ID',
    example: '507f1f77bcf86cd799439012'
  })
  @IsString()
  customerId: string;

  @ApiProperty({ 
    description: 'Subscription ID',
    example: 'sub_1234567890'
  })
  @IsString()
  subscriptionId: string;

  @ApiProperty({ 
    description: 'Billing period start',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ 
    description: 'Billing period end',
    example: '2024-01-31T23:59:59.999Z'
  })
  @IsDateString()
  periodEnd: string;

  @ApiProperty({ 
    description: 'Communities created',
    example: 3
  })
  @IsNumber()
  communitiesCreated: number;

  @ApiProperty({ 
    description: 'Members added',
    example: 150
  })
  @IsNumber()
  membersAdded: number;

  @ApiProperty({ 
    description: 'Courses activated',
    example: 8
  })
  @IsNumber()
  coursesActivated: number;

  @ApiProperty({ 
    description: 'Storage used in GB',
    example: 5.5
  })
  @IsNumber()
  storageUsedGB: number;

  @ApiProperty({ 
    description: 'Admins added',
    example: 2
  })
  @IsNumber()
  adminsAdded: number;

  @ApiPropertyOptional({ 
    description: 'API requests made',
    example: 10000
  })
  @IsOptional()
  @IsNumber()
  apiRequests?: number;

  @ApiPropertyOptional({ 
    description: 'Emails sent',
    example: 500
  })
  @IsOptional()
  @IsNumber()
  emailsSent?: number;

  @ApiPropertyOptional({ 
    description: 'Automations triggered',
    example: 25
  })
  @IsOptional()
  @IsNumber()
  automationsTriggered?: number;

  @ApiProperty({ 
    description: 'Plan limits',
    type: Object
  })
  planLimits: {
    communitiesMax: number;
    membersMax: number;
    coursesActivationMax: number;
    storageGB: number;
    adminsMax: number;
  };

  @ApiProperty({ 
    description: 'Usage percentages',
    type: Object
  })
  usagePercentages: {
    communities: number;
    members: number;
    courses: number;
    storage: number;
    admins: number;
  };
}

export class RecordUsageDto {
  @ApiProperty({ 
    description: 'Metric type',
    enum: UsageMetricType
  })
  @IsEnum(UsageMetricType)
  metricType: string;

  @ApiProperty({ 
    description: 'Usage value to record',
    example: 1
  })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ 
    description: 'Resource ID',
    example: 'comm_1234567890'
  })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ 
    description: 'Additional metadata',
    type: Object
  })
  @IsOptional()
  metadata?: Record<string, any>;
}