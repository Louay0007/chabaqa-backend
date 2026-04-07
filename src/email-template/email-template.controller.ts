import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateCategory } from '../schema/email-template.schema';

class CreateEmailTemplateDto {
  @IsString()
  communityId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(EmailTemplateCategory)
  category?: EmailTemplateCategory;

  @IsString()
  subject: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}

class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(EmailTemplateCategory)
  category?: EmailTemplateCategory;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}

@ApiTags('Email Templates')
@Controller('email-templates')
@UseGuards(JwtAuthGuard)
export class EmailTemplateController {
  constructor(private readonly templateService: EmailTemplateService) {}

  @Post()
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Create email template' })
  create(@Request() req, @Body() dto: CreateEmailTemplateDto) {
    return this.templateService.create(req.user._id, dto);
  }

  @Get(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'List templates for community (own + global)' })
  list(@Param('communityId') communityId: string) {
    return this.templateService.list(communityId);
  }

  @Get(':communityId/:id')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get single template' })
  findOne(@Param('communityId') communityId: string, @Param('id') id: string) {
    return this.templateService.findOne(communityId, id);
  }

  @Put(':id')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Update email template' })
  update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.templateService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Delete email template' })
  async delete(@Param('id') id: string) {
    await this.templateService.delete(id);
    return { success: true };
  }

  @Post(':id/use')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Increment usage count and return template' })
  use(@Param('id') id: string) {
    return this.templateService.incrementUsage(id);
  }
}
