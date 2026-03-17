
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationDto } from '../dto-notification/notification.dto';
import { RemovePushSubscriptionDto, SavePushSubscriptionDto } from '../dto-notification/push-subscription.dto';
import { UpdateNotificationPreferencesDto } from '../dto-notification/update-notification-preferences.dto';
import { BulkUpsertPreferenceItemsDto, UpsertNotificationPreferenceItemDto } from '../dto-notification/notification-preference-item.dto';
import { CreateNotificationMuteDto } from '../dto-notification/notification-mute.dto';

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

  @Get('push/status')
  @ApiOperation({ summary: 'Get push notification status for current user' })
  @ApiResponse({ status: 200 })
  async getPushStatus(@Req() req) {
    const status = await this.notificationService.getPushStatus(req.user._id);
    return {
      success: true,
      message: 'Push status retrieved successfully',
      data: status,
    };
  }

  @Post('push/test')
  @ApiOperation({ summary: 'Send a test push notification to current user' })
  @ApiResponse({ status: 200 })
  async sendTestPush(@Req() req) {
    const result = await this.notificationService.sendTestPush(req.user._id);
    return {
      success: true,
      message: result.message,
      data: result,
    };
  }

  // ===== Preference Items (per-community overrides) =====

  @Get('preferences/items')
  @ApiOperation({ summary: 'Get notification preference items (global or per-community)' })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiResponse({ status: 200 })
  async getPreferenceItems(@Req() req, @Query('communityId') communityId?: string) {
    const items = await this.notificationService.getPreferenceItems(
      req.user._id,
      communityId === undefined ? undefined : communityId || null,
    );
    return {
      success: true,
      message: 'Preference items retrieved successfully',
      data: items,
    };
  }

  @Put('preferences/items')
  @ApiOperation({ summary: 'Upsert a single notification preference item' })
  @ApiResponse({ status: 200 })
  async upsertPreferenceItem(@Req() req, @Body() dto: UpsertNotificationPreferenceItemDto) {
    const item = await this.notificationService.upsertPreferenceItem(req.user._id, dto);
    return {
      success: true,
      message: 'Preference item saved successfully',
      data: item,
    };
  }

  @Put('preferences/items/bulk')
  @ApiOperation({ summary: 'Bulk upsert notification preference items' })
  @ApiResponse({ status: 200 })
  async bulkUpsertPreferenceItems(@Req() req, @Body() dto: BulkUpsertPreferenceItemsDto) {
    const items = await this.notificationService.bulkUpsertPreferenceItems(req.user._id, dto.items);
    return {
      success: true,
      message: 'Preference items saved successfully',
      data: items,
    };
  }

  // ===== Mutes =====

  @Get('mutes')
  @ApiOperation({ summary: 'Get all notification mutes for current user' })
  @ApiResponse({ status: 200 })
  async getUserMutes(@Req() req) {
    const mutes = await this.notificationService.getUserMutes(req.user._id);
    return {
      success: true,
      message: 'Mutes retrieved successfully',
      data: mutes,
    };
  }

  @Post('mutes')
  @ApiOperation({ summary: 'Create or update a notification mute' })
  @ApiResponse({ status: 200 })
  async createMute(@Req() req, @Body() dto: CreateNotificationMuteDto) {
    const mute = await this.notificationService.createMute(req.user._id, dto);
    return {
      success: true,
      message: 'Mute created successfully',
      data: mute,
    };
  }

  @Delete('mutes/:targetType/:targetId')
  @ApiOperation({ summary: 'Remove a notification mute' })
  @ApiResponse({ status: 200 })
  async removeMute(
    @Req() req,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    const removed = await this.notificationService.removeMute(req.user._id, targetType, targetId);
    return {
      success: true,
      message: removed ? 'Mute removed successfully' : 'Mute not found',
      data: { removed },
    };
  }
}
