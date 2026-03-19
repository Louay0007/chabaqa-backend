import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum NotificationType {
  SYSTEM = 'system',
  COMMUNITY = 'community',
  CONTENT = 'content',
  PAYMENT = 'payment',
  SOCIAL = 'social',
  ACHIEVEMENT = 'achievement',
  CUSTOM = 'custom',
}

export enum DeliveryMethod {
  IN_APP = 'in_app',
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

export class NotificationConfigDto {
  @ApiProperty({
    description: 'Notification type',
    enum: NotificationType,
    example: NotificationType.SYSTEM,
  })
  @IsEnum(NotificationType)
  type: string;

  @ApiProperty({
    description: 'Notification name/identifier',
    example: 'user_welcome',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Notification description',
    example: 'Sent when a new user joins the platform',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Enabled delivery methods',
    type: [String],
    enum: DeliveryMethod,
    example: [DeliveryMethod.IN_APP, DeliveryMethod.EMAIL],
  })
  @IsArray()
  @IsEnum(DeliveryMethod, { each: true })
  enabledMethods: DeliveryMethod[];

  @ApiPropertyOptional({
    description: 'Whether notification is enabled',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Whether users can control this notification',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  userControllable?: boolean;

  @ApiPropertyOptional({
    description: 'Default user preference (enabled/disabled)',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  defaultEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Notification priority',
    enum: ['low', 'normal', 'high', 'urgent'],
    example: 'normal',
    default: 'normal',
  })
  @IsOptional()
  @IsEnum(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional({
    description: 'Additional configuration metadata',
    example: { throttle: '1h', batchable: true },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateNotificationConfigDto {
  @ApiPropertyOptional({
    description: 'Notification description',
    example: 'Sent when a new user joins the platform',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Enabled delivery methods',
    type: [String],
    enum: DeliveryMethod,
    example: [DeliveryMethod.IN_APP, DeliveryMethod.EMAIL],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DeliveryMethod, { each: true })
  enabledMethods?: DeliveryMethod[];

  @ApiPropertyOptional({
    description: 'Whether notification is enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Whether users can control this notification',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  userControllable?: boolean;

  @ApiPropertyOptional({
    description: 'Default user preference (enabled/disabled)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  defaultEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Notification priority',
    enum: ['low', 'normal', 'high', 'urgent'],
    example: 'normal',
  })
  @IsOptional()
  @IsEnum(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional({
    description: 'Additional configuration metadata',
    example: { throttle: '1h', batchable: true },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
