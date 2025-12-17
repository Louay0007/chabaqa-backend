
import { Controller, Get, Patch, Param, Body, UseGuards, Req, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationDto } from '../dto-notification/notification.dto';
import { UpdateNotificationPreferencesDto } from '../dto-notification/update-notification-preferences.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiResponse({ status: 200, type: [NotificationDto] })
  getUserNotifications(@Req() req) {
    const notifications = this.notificationService.getUserNotifications(req.user._id);
    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data: notifications
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, type: NotificationDto })
  markAsRead(@Param('id') id: string, @Req() req) {
    const notification = this.notificationService.markAsRead(id, req.user._id);
    return {
      success: true,
      message: 'Notification marked as read',
      data: notification
    };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get user notification preferences' })
  @ApiResponse({ status: 200 })
  getUserPreferences(@Req() req) {
    const preferences = this.notificationService.getUserPreferences(req.user._id);
    return {
      success: true,
      message: 'Notification preferences retrieved successfully',
      data: preferences
    };
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update user notification preferences' })
  @ApiResponse({ status: 200 })
  updateUserPreferences(@Req() req, @Body() dto: UpdateNotificationPreferencesDto) {
    const preferences = this.notificationService.updateUserPreferences(req.user._id, dto);
    return {
      success: true,
      message: 'Notification preferences updated successfully',
      data: preferences
    };
  }
}
