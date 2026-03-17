import {
  Controller, Post, Get, Patch, Body, Param, Query, Req,
  UseGuards, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AffiliateService } from './affiliate.service';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, OptionalCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import {
  CreateProgramDto, UpdateProgramDto, InvitePartnerDto,
  UpdatePartnerDto, CreateLinkDto, StatsQueryDto,
} from './dto/affiliate.dto';

@ApiTags('Affiliate – Creator')
@Controller('affiliate/creator')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AffiliateCreatorController {
  private readonly logger = new Logger(AffiliateCreatorController.name);

  constructor(private readonly affiliateService: AffiliateService) {}

  private getUserId(req: any): string {
    return (req.user?._id || req.user?.sub || '').toString();
  }

  // ── Programs ──

  @Post('programs')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.AFFILIATES_MANAGE)
  @ApiOperation({ summary: 'Create an affiliate program' })
  async createProgram(@Req() req: any, @Body() dto: CreateProgramDto) {
    return this.affiliateService.createProgram(this.getUserId(req), dto);
  }

  @Get('programs')
  @ApiOperation({ summary: 'List creator affiliate programs' })
  async getPrograms(@Req() req: any) {
    return this.affiliateService.getCreatorPrograms(this.getUserId(req));
  }

  @Patch('programs/:id')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.AFFILIATES_MANAGE)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Update a program (pause/change rate)' })
  async updateProgram(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateProgramDto) {
    return this.affiliateService.updateProgram(this.getUserId(req), id, dto);
  }

  // ── Partners ──

  @Post('programs/:id/partners')
  @ApiOperation({ summary: 'Invite a partner to a program' })
  async invitePartner(@Req() req: any, @Param('id') programId: string, @Body() dto: InvitePartnerDto) {
    return this.affiliateService.invitePartner(this.getUserId(req), programId, dto);
  }

  @Get('partners')
  @ApiOperation({ summary: 'List partners across programs' })
  async getPartners(@Req() req: any, @Query('programId') programId?: string) {
    return this.affiliateService.getCreatorPartners(this.getUserId(req), programId);
  }

  @Patch('partners/:id')
  @ApiOperation({ summary: 'Approve/reject/pause a partner' })
  async updatePartner(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.affiliateService.updatePartnerStatus(this.getUserId(req), id, dto.status);
  }

  // ── Links ──

  @Post('links')
  @ApiOperation({ summary: 'Create a share link for a partner' })
  async createLink(@Req() req: any, @Body() dto: CreateLinkDto) {
    return this.affiliateService.createLink(this.getUserId(req), dto);
  }

  // ── Stats ──

  @Get('stats')
  @ApiOperation({ summary: 'Creator affiliate stats (clicks, conversions, revenue, top partners)' })
  async getStats(@Req() req: any) {
    return this.affiliateService.getCreatorStats(this.getUserId(req));
  }
}
