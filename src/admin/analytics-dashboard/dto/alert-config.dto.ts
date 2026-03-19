import { IsString, IsNumber, IsEnum, IsOptional, IsArray, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AlertMetricType {
  USER_GROWTH = 'user_growth',
  ENGAGEMENT_RATE = 'engagement_rate',
  REVENUE = 'revenue',
  ERROR_RATE = 'error_rate',
  RESPONSE_TIME = 'response_time',
  CHURN_RATE = 'churn_rate',
  SYSTEM_HEALTH = 'system_health',
  PENDING_CONTENT = 'pending_content',
  FLAGGED_CONTENT = 'flagged_content',
  PENDING_COMMUNITIES = 'pending_communities',
  FAILED_LOGINS = 'failed_logins',
  HIGH_VALUE_TRANSACTION = 'high_value_transaction',
}

export enum AlertCondition {
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  EQUALS = 'equals',
  CHANGE_PERCENTAGE = 'change_percentage'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export class CreateAlertDto {
  @ApiProperty({
    description: 'Alert name',
    example: 'High Error Rate Alert'
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Alert description',
    example: 'Triggers when error rate exceeds 5%'
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Metric to monitor',
    enum: AlertMetricType,
    example: AlertMetricType.ERROR_RATE
  })
  @IsEnum(AlertMetricType)
  metricType: string;

  @ApiProperty({
    description: 'Alert condition',
    enum: AlertCondition,
    example: AlertCondition.GREATER_THAN
  })
  @IsEnum(AlertCondition)
  condition: string;

  @ApiProperty({
    description: 'Threshold value',
    example: 5
  })
  @IsNumber()
  threshold: number;

  @ApiProperty({
    description: 'Alert severity',
    enum: AlertSeverity,
    example: AlertSeverity.CRITICAL
  })
  @IsEnum(AlertSeverity)
  severity: string;

  @ApiPropertyOptional({
    description: 'Admin user IDs to notify',
    example: ['64a1b2c3d4e5f6789abcdef0']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifyAdmins?: string[];

  @ApiPropertyOptional({
    description: 'Email addresses to notify',
    example: ['admin@example.com']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifyEmails?: string[];
}

export class UpdateAlertDto {
  @ApiPropertyOptional({
    description: 'Alert name',
    example: 'High Error Rate Alert'
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Alert description',
    example: 'Triggers when error rate exceeds 5%'
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Threshold value',
    example: 5
  })
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional({
    description: 'Alert severity',
    enum: AlertSeverity,
    example: AlertSeverity.CRITICAL
  })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: string;

  @ApiPropertyOptional({
    description: 'Admin user IDs to notify',
    example: ['64a1b2c3d4e5f6789abcdef0']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifyAdmins?: string[];

  @ApiPropertyOptional({
    description: 'Email addresses to notify',
    example: ['admin@example.com']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifyEmails?: string[];

  @ApiPropertyOptional({
    description: 'Enable or disable alert',
    example: true
  })
  @IsOptional()
  isEnabled?: boolean;
}

export class AlertResponseDto {
  @ApiProperty({ description: 'Alert ID' })
  id: string;

  @ApiProperty({ description: 'Alert name' })
  name: string;

  @ApiProperty({ description: 'Alert description' })
  description: string;

  @ApiProperty({ description: 'Metric type', enum: AlertMetricType })
  metricType: string;

  @ApiProperty({ description: 'Alert condition', enum: AlertCondition })
  condition: string;

  @ApiProperty({ description: 'Threshold value' })
  threshold: number;

  @ApiProperty({ description: 'Alert severity', enum: AlertSeverity })
  severity: string;

  @ApiProperty({ description: 'Is alert enabled' })
  isEnabled: boolean;

  @ApiProperty({ description: 'Admin user IDs to notify' })
  notifyAdmins: string[];

  @ApiProperty({ description: 'Email addresses to notify' })
  notifyEmails: string[];

  @ApiProperty({ description: 'Last triggered timestamp' })
  lastTriggered?: Date;

  @ApiProperty({ description: 'Trigger count' })
  triggerCount: number;

  @ApiProperty({ description: 'Created by admin ID' })
  createdBy: string;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt: Date;
}

export class AlertNotificationDto {
  @ApiProperty({ description: 'Alert ID' })
  alertId: string;

  @ApiProperty({ description: 'Alert name' })
  alertName: string;

  @ApiProperty({ description: 'Metric type', enum: AlertMetricType })
  metricType: string;

  @ApiProperty({ description: 'Current value' })
  currentValue: number;

  @ApiProperty({ description: 'Threshold value' })
  threshold: number;

  @ApiProperty({ description: 'Alert severity', enum: AlertSeverity })
  severity: string;

  @ApiProperty({ description: 'Triggered at timestamp' })
  triggeredAt: Date;

  @ApiProperty({ description: 'Additional context' })
  context?: any;
}
