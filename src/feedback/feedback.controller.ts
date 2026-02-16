
import { Controller, Post, Body, Get, Param, UseGuards, Req, Put, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from '../dto-feedback/create-feedback.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedbackResponseDto } from '../dto-feedback/feedback-response.dto';
import { Request } from 'express';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';
import { CacheTTL, CacheDuration } from '../common/decorators/cache-ttl.decorator';

@ApiTags('feedback')
@Controller('feedback')
@UseInterceptors(HttpCacheInterceptor)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create feedback' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'The feedback has been successfully created.', type: FeedbackResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 409, description: 'Conflict. Feedback already exists.' })
  create(@Body() createFeedbackDto: CreateFeedbackDto, @Req() req: Request & { user: any }) {
    const userId = req.user._id || req.user.userId;
    return this.feedbackService.create(createFeedbackDto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Update feedback' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'The feedback has been successfully updated.', type: FeedbackResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found.' })
  update(
    @Param('id') id: string,
    @Body() body: { rating: number; comment?: string },
    @Req() req: Request & { user: any },
  ) {
    const userId = req.user._id || req.user.userId;
    return this.feedbackService.update(id, userId, body.rating, body.comment);
  }

  @Get('/:relatedModel/:relatedTo')
  @ApiOperation({ summary: 'Find feedback by related item' })
  @ApiResponse({ status: 200, description: 'The found records.', type: [FeedbackResponseDto] })
  @ApiResponse({ status: 404, description: 'Not Found.' })
  findByRelated(@Param('relatedModel') relatedModel: string, @Param('relatedTo') relatedTo: string) {
    return this.feedbackService.findByRelated(relatedModel, relatedTo);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/:relatedModel/:relatedTo/my')
  @ApiOperation({ summary: 'Get current user feedback for an item' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'The user feedback or null.' })
  getMyFeedback(
    @Param('relatedModel') relatedModel: string,
    @Param('relatedTo') relatedTo: string,
    @Req() req: Request & { user: any },
  ) {
    const userId = req.user._id || req.user.userId;
    return this.feedbackService.findUserFeedback(relatedModel, relatedTo, userId);
  }

  @Get('/:relatedModel/:relatedTo/stats')
  @CacheTTL(CacheDuration.FIVE_MINUTES)
  @ApiOperation({ summary: 'Get feedback statistics for an item' })
  @ApiResponse({ status: 200, description: 'The feedback statistics.' })
  getStats(@Param('relatedModel') relatedModel: string, @Param('relatedTo') relatedTo: string) {
    return this.feedbackService.getStats(relatedModel, relatedTo);
  }
}
