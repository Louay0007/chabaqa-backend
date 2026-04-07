import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { ContactProfileService } from './contact-profile.service';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

class UpdateContactProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  leadScore?: number;
}

@ApiTags('Contact Profiles')
@Controller('contact-profiles')
@UseGuards(JwtAuthGuard)
export class ContactProfileController {
  constructor(private readonly profileService: ContactProfileService) {}

  @Get(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'List contact profiles with filters' })
  list(
    @Param('communityId') communityId: string,
    @Query('tags') tags?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.profileService.list(communityId, {
      tags: tags ? tags.split(',') : undefined,
      minScore: minScore !== undefined ? parseInt(minScore, 10) : undefined,
      maxScore: maxScore !== undefined ? parseInt(maxScore, 10) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':communityId/:userId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get single contact profile' })
  findOne(@Param('communityId') communityId: string, @Param('userId') userId: string) {
    return this.profileService.findOne(communityId, userId);
  }

  @Patch(':communityId/:userId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Update contact tags/notes/customFields' })
  update(
    @Param('communityId') communityId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateContactProfileDto,
  ) {
    return this.profileService.upsert(communityId, userId, dto);
  }

  @Post(':communityId/:userId/recalculate-score')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Recalculate lead score for a contact' })
  async recalculate(@Param('communityId') communityId: string, @Param('userId') userId: string) {
    const score = await this.profileService.recalculateScore(communityId, userId);
    return { score };
  }
}
