import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { AudienceSegmentService } from './audience-segment.service';
import { SegmentFilter } from '../schema/audience-segment.schema';

class CreateAudienceSegmentDto {
  @IsString()
  communityId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentFilter)
  filters: SegmentFilter[];
}

@ApiTags('Audience Segments')
@Controller('audience-segments')
@UseGuards(JwtAuthGuard)
export class AudienceSegmentController {
  constructor(private readonly segmentService: AudienceSegmentService) {}

  @Post()
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Create an audience segment' })
  create(@Request() req, @Body() dto: CreateAudienceSegmentDto) {
    return this.segmentService.create(req.user._id, dto);
  }

  @Get(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'List segments for a community' })
  list(@Param('communityId') communityId: string) {
    return this.segmentService.list(communityId);
  }

  @Post(':id/evaluate')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AudienceSegment', paramName: 'id' })
  @ApiOperation({ summary: 'Evaluate segment and return matching count + sample' })
  async evaluate(@Param('id') id: string) {
    const userIds = await this.segmentService.evaluate(id);
    await this.segmentService.refreshSize(id);
    return { count: userIds.length, sample: userIds.slice(0, 10) };
  }

  @Delete(':id')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'AudienceSegment', paramName: 'id' })
  @ApiOperation({ summary: 'Delete an audience segment' })
  async delete(@Param('id') id: string) {
    await this.segmentService.delete(id);
    return { success: true };
  }
}
