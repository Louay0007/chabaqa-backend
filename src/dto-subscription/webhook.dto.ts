import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsObject, IsOptional, IsDateString } from 'class-validator';

export enum WebhookEventType {
  SUBSCRIPTION_CREATED = 'subscription.created',
  SUBSCRIPTION_UPDATED = 'subscription.updated', 
  SUBSCRIPTION_DELETED = 'subscription.deleted',
  INVOICE_PAYMENT_SUCCEEDED = 'invoice.payment_succeeded',
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed',
  CUSTOMER_SUBSCRIPTION_TRIAL_WILL_END = 'customer.subscription.trial_will_end',
  CUSTOMER_SUBSCRIPTION_DELETED = 'customer.subscription.deleted',
  PAYMENT_METHOD_ATTACHED = 'payment_method.attached',
  PAYMENT_METHOD_DETACHED = 'payment_method.detached'
}

export class WebhookEventDto {
  @ApiProperty({ 
    description: 'Event ID',
    example: 'evt_1234567890'
  })
  @IsString()
  id: string;

  @ApiProperty({ 
    description: 'Object type',
    example: 'event'
  })
  @IsString()
  object: string;

  @ApiProperty({ 
    description: 'Event type',
    enum: WebhookEventType
  })
  @IsEnum(WebhookEventType)
  type: string;

  @ApiProperty({ 
    description: 'Event data'
  })
  @IsObject()
  data: any;

  @ApiPropertyOptional({ 
    description: 'Event created timestamp',
    example: '2024-01-15T10:30:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  created?: string;

  @ApiPropertyOptional({ 
    description: 'Live mode flag',
    example: false
  })
  @IsOptional()
  livemode?: boolean;

  @ApiPropertyOptional({ 
    description: 'Number of retries',
    example: 0
  })
  @IsOptional()
  retries?: number;
}

export class WebhookResponseDto {
  @ApiProperty({ 
    description: 'Response message',
    example: 'Webhook processed successfully'
  })
  message: string;

  @ApiProperty({ 
    description: 'Event ID',
    example: 'evt_1234567890'
  })
  eventId: string;

  @ApiProperty({ 
    description: 'Processing status',
    example: 'success'
  })
  status: 'success' | 'error' | 'skipped';
}