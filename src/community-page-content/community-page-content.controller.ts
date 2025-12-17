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
  HttpStatus
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam,
  ApiBearerAuth
} from '@nestjs/swagger';
import { CommunityPageContentService } from './community-page-content.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { 
  UpdateCommunityPageContentDto,
  PublishContentDto,
  AddTestimonialDto,
  CommunityPageContentResponseDto
} from '../dto-community/community-page-content.dto';

@ApiTags('Community Page Content')
@Controller('community-page-content')
export class CommunityPageContentController {
  constructor(
    private readonly pageContentService: CommunityPageContentService
  ) {}

  /**
   * Get page content for editing (creator only)
   */
  @Get(':communityId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get page content for editing',
    description: 'Get community page content for editing. Only accessible by community creator. Includes draft content.'
  })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Content retrieved successfully',
    type: CommunityPageContentResponseDto
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only the community creator can access this content'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async getContentForEditing(
    @Param('communityId') communityId: string,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.pageContentService.getContentForEditing(communityId, userId);
  }

  /**
   * Update page content sections
   */
  @Patch(':communityId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update page content',
    description: 'Update any section of the community page content. Supports partial updates. Only accessible by community creator.'
  })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Content updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Content updated successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          communityId: '507f1f77bcf86cd799439012',
          hero: {},
          overview: {},
          benefits: {},
          testimonials: {},
          cta: {},
          isPublished: false,
          version: 2
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only the community creator can edit page content'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async updateContent(
    @Param('communityId') communityId: string,
    @Body() updateDto: UpdateCommunityPageContentDto,
    @Request() req
  ) {
    const userId = req.user.id;
    const result = await this.pageContentService.updateContent(
      communityId, 
      userId, 
      updateDto
    );

    return {
      success: true,
      message: 'Content updated successfully',
      data: result
    };
  }

  /**
   * Publish or unpublish content
   */
  @Post(':communityId/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish or unpublish content',
    description: 'Publish or unpublish the community page content. Only published content is visible to the public.'
  })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Content publish state updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Content published successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          isPublished: true,
          version: 3
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only the community creator can publish content'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found or no content to publish'
  })
  async publishContent(
    @Param('communityId') communityId: string,
    @Body() publishDto: PublishContentDto,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.pageContentService.publishContent(
      communityId, 
      userId, 
      publishDto
    );
  }

  /**
   * Add a testimonial with avatar upload
   */
  @Post(':communityId/testimonials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add testimonial',
    description: 'Add a new testimonial to the community page with avatar image upload (base64).'
  })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Testimonial added successfully',
    schema: {
      example: {
        success: true,
        message: 'Testimonial added successfully',
        data: {
          testimonial: {
            id: 'uuid-123',
            name: 'Sarah Kim',
            role: 'Product Manager',
            avatar: 'http://localhost:3000/uploads/testimonials/123.jpg',
            rating: 5,
            content: 'Amazing community!',
            order: 0,
            visible: true
          },
          testimonials: {
            title: 'What Members Are Saying',
            testimonials: []
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only the community creator can add testimonials'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Failed to upload avatar image'
  })
  async addTestimonial(
    @Param('communityId') communityId: string,
    @Body() testimonialDto: AddTestimonialDto,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.pageContentService.addTestimonial(
      communityId, 
      userId, 
      testimonialDto
    );
  }

  /**
   * Delete a testimonial
   */
  @Delete(':communityId/testimonials/:testimonialId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete testimonial',
    description: 'Delete a testimonial from the community page.'
  })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiParam({ name: 'testimonialId', description: 'Testimonial ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Testimonial deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Testimonial deleted successfully',
        data: {
          testimonials: {
            title: 'What Members Are Saying',
            testimonials: []
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only the community creator can delete testimonials'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Testimonial not found'
  })
  async deleteTestimonial(
    @Param('communityId') communityId: string,
    @Param('testimonialId') testimonialId: string,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.pageContentService.deleteTestimonial(
      communityId, 
      userId, 
      testimonialId
    );
  }
}
