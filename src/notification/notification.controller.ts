
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationDto } from '../dto-notification/notification.dto';
import { RemovePushSubscriptionDto, SavePushSubscriptionDto } from '../dto-notification/push-subscription.dto';
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
  async getUserNotifications(@Req() req) {
    const notifications = await this.notificationService.getUserNotifications(req.user._id);
    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data: notifications,
    };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200 })
  async markAllAsRead(@Req() req) {
    const updatedCount = await this.notificationService.markAllAsRead(req.user._id);
    return {
      success: true,
      message: 'All notifications marked as read',
      data: { updatedCount },
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, type: NotificationDto })
  async markAsRead(@Param('id') id: string, @Req() req) {
    const notification = await this.notificationService.markAsRead(id, req.user._id);
    return {
      success: true,
      message: 'Notification marked as read',
      data: notification,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one notification' })
  @ApiResponse({ status: 200 })
  async deleteNotification(@Param('id') id: string, @Req() req) {
    const deleted = await this.notificationService.deleteNotification(id, req.user._id);
    return {
      success: true,
      message: deleted ? 'Notification deleted successfully' : 'Notification not found',
      data: { deleted },
    };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get user notification preferences' })
  @ApiResponse({ status: 200 })
  async getUserPreferences(@Req() req) {
    const preferences = await this.notificationService.getUserPreferences(req.user._id);
    return {
      success: true,
      message: 'Notification preferences retrieved successfully',
      data: preferences,
    };
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update user notification preferences' })
  @ApiResponse({ status: 200 })
  async updateUserPreferences(@Req() req, @Body() dto: UpdateNotificationPreferencesDto) {
    const preferences = await this.notificationService.updateUserPreferences(req.user._id, dto);
    return {
      success: true,
      message: 'Notification preferences updated successfully',
      data: preferences,
    };
  }

  @Get('push/public-key')
  @ApiOperation({ summary: 'Get web push public key' })
  @ApiResponse({ status: 200 })
  getPushPublicKey() {
    const pushConfig = this.notificationService.getPushPublicKey();
    return {
      success: true,
      message: 'Push configuration retrieved successfully',
      data: pushConfig,
    };
  }

  @Post('push/subscribe')
  @ApiOperation({ summary: 'Save or update web push subscription for current user' })
  @ApiResponse({ status: 200 })
  async savePushSubscription(@Req() req, @Body() dto: SavePushSubscriptionDto) {
    await this.notificationService.savePushSubscription(req.user._id, dto, req.headers['user-agent']);
    return {
      success: true,
      message: 'Push subscription saved successfully',
    };
  }

  @Post('push/unsubscribe')
  @ApiOperation({ summary: 'Remove web push subscription for current user' })
  @ApiResponse({ status: 200 })
  async removePushSubscription(@Req() req, @Body() dto: RemovePushSubscriptionDto) {
    await this.notificationService.removePushSubscription(req.user._id, dto.endpoint);
    return {
      success: true,
      message: 'Push subscription removed successfully',
    };
  }
}
