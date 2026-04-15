import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  // ── POST /api-keys/:communityId ─────────────────────────────
  @Post(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'My Integration' },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          example: ['read:posts', 'read:members'],
        },
        expiresInDays: { type: 'number', example: 365 },
      },
    },
  })
  @ApiOperation({ summary: 'Create a new API key for community' })
  async createApiKey(
    @Param('communityId') communityId: string,
    @Request() req: any,
    @Body()
    body: {
      name: string;
      permissions?: string[];
      expiresInDays?: number;
    },
  ) {
    const { apiKey, rawKey } = await this.apiKeyService.createApiKey(
      req.user._id,
      communityId,
      body.name,
      body.permissions || [],
      body.expiresInDays,
    );

    return {
      success: true,
      data: {
        id: apiKey._id,
        name: apiKey.name,
        key: rawKey, // ⚠️  Only returned once — not stored in DB
        permissions: apiKey.permissions,
        rateLimitPerHour: apiKey.rateLimitPerHour,
        expiresAt: apiKey.expiresAt ?? null,
        createdAt: apiKey.createdAt,
      },
      message:
        'API key created. Save it securely — it will not be shown again.',
    };
  }

  // ── GET /api-keys/:communityId ──────────────────────────────
  @Get(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiOperation({ summary: 'List all API keys for a community' })
  async listApiKeys(
    @Param('communityId') communityId: string,
    @Request() req: any,
  ) {
    const [keys, stats] = await Promise.all([
      this.apiKeyService.getApiKeys(req.user._id, communityId),
      this.apiKeyService.getApiKeyStats(req.user._id, communityId),
    ]);

    return {
      success: true,
      data: keys.map((k) => ({
        id: k._id,
        name: k.name,
        status: k.status,
        permissions: k.permissions,
        rateLimitPerHour: k.rateLimitPerHour,
        requestsThisHour: k.requestsThisHour,
        lastUsedAt: k.lastUsedAt ?? null,
        expiresAt: k.expiresAt ?? null,
        createdAt: k.createdAt,
      })),
      meta: stats,
    };
  }

  // ── DELETE /api-keys/:communityId/:keyId ────────────────────
  @Delete(':communityId/:keyId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeApiKey(
    @Param('communityId') _communityId: string,
    @Param('keyId') keyId: string,
    @Request() req: any,
  ) {
    await this.apiKeyService.revokeApiKey(keyId, req.user._id);
    return { success: true, message: 'API key revoked successfully' };
  }
}
