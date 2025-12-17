
import { ApiProperty } from '@nestjs/swagger';
import { NotificationChannel, NotificationPriority } from '../schema/notification.schema';

export class NotificationDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  recipient: string;

  @ApiProperty({ required: false })
  sender?: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ required: false })
  data?: Record<string, any>;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty({ required: false })
  readAt?: Date;

  @ApiProperty({ enum: NotificationChannel })
  channel: NotificationChannel;

  @ApiProperty({ enum: NotificationPriority })
  priority: NotificationPriority;

  @ApiProperty({ required: false })
  expiresAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
