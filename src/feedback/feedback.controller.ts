
import { Controller, Post, Body, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from '../dto-feedback/create-feedback.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedbackResponseDto } from '../dto-feedback/feedback-response.dto';

@ApiTags('feedback')
@Controller('feedback')
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
  create(@Body() createFeedbackDto: CreateFeedbackDto, @Req() req) {
    return this.feedbackService.create(createFeedbackDto, req.user.userId);
  }

  @Get('/:relatedModel/:relatedTo')
  @ApiOperation({ summary: 'Find feedback by related item' })
  @ApiResponse({ status: 200, description: 'The found records.', type: [FeedbackResponseDto] })
  @ApiResponse({ status: 404, description: 'Not Found.' })
  findByRelated(@Param('relatedModel') relatedModel: string, @Param('relatedTo') relatedTo: string) {
    return this.feedbackService.findByRelated(relatedModel, relatedTo);
  }
}
