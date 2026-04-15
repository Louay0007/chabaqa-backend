import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { WebhookEvent } from '../schema/webhook-config.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  // ── POST /webhooks/:communityId ─────────────────────────────
  @Post(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Create a webhook endpoint for a community' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'url', 'events'],
      properties: {
        name: { type: 'string', example: 'Slack Notifier' },
        url: { type: 'string', example: 'https://hooks.example.com/webhook' },
        events: {
          type: 'array',
          items: { type: 'string', enum: Object.values(WebhookEvent) },
        },
      },
    },
  })
  async createWebhook(
    @Param('communityId') communityId: string,
    @Request() req: any,
    @Body() body: { name: string; url: string; events: string[] },
  ) {
    if (!body.name || !body.url || !body.events?.length) {
      throw new BadRequestException(
        'name, url, and at least one event are required',
      );
    }

    const validEvents = Object.values(WebhookEvent);
    const invalidEvents = body.events.filter(
      (e) => !validEvents.includes(e as WebhookEvent),
    );
    if (invalidEvents.length) {
      throw new BadRequestException(
        `Invalid event(s): ${invalidEvents.join(', ')}`,
      );
    }

    const webhook = await this.webhookService.createWebhook(
      req.user._id,
      communityId,
      {
        name: body.name,
        url: body.url,
        events: body.events as WebhookEvent[],
      },
    );

    return {
      success: true,
      data: {
        id: webhook._id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret, // ⚠️  Only shown once
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
      },
      message:
        'Webhook created. Save the secret securely — it will not be shown again.',
    };
  }

  // ── GET /webhooks/:communityId ──────────────────────────────
  @Get(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiOperation({ summary: 'List webhooks for a community' })
  async listWebhooks(@Param('communityId') communityId: string) {
    const webhooks = await this.webhookService.listWebhooks(communityId);

    return {
      success: true,
      data: webhooks.map((w) => ({
        id: w._id,
        name: w.name,
        url: w.url,
        events: w.events,
        isActive: w.isActive,
        failuresCount: w.failuresCount,
        lastTriggeredAt: w.lastTriggeredAt ?? null,
        lastFailureReason: w.lastFailureReason ?? null,
        createdAt: w.createdAt,
      })),
    };
  }

  // ── GET /webhooks/:communityId/events ───────────────────────
  @Get(':communityId/events')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Get list of all supported webhook events' })
  listEvents() {
    return {
      success: true,
      data: Object.values(WebhookEvent).map((event) => ({
        value: event,
        label: event.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
    };
  }

  // ── PATCH /webhooks/:communityId/:webhookId ─────────────────
  @Patch(':communityId/:webhookId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Update a webhook (toggle active, change events)' })
  async updateWebhook(
    @Param('communityId') _communityId: string,
    @Param('webhookId') webhookId: string,
    @Request() req: any,
    @Body()
    body: Partial<{
      name: string;
      url: string;
      events: string[];
      isActive: boolean;
    }>,
  ) {
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.url !== undefined) updates.url = body.url;
    if (body.events !== undefined) updates.events = body.events;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await this.webhookService.updateWebhook(
      webhookId,
      req.user._id,
      updates as any,
    );

    return { success: true, data: updated };
  }

  // ── DELETE /webhooks/:communityId/:webhookId ────────────────
  @Delete(':communityId/:webhookId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Delete a webhook' })
  async deleteWebhook(
    @Param('communityId') _communityId: string,
    @Param('webhookId') webhookId: string,
    @Request() req: any,
  ) {
    await this.webhookService.deleteWebhook(webhookId, req.user._id);
    return { success: true, message: 'Webhook deleted' };
  }
}
