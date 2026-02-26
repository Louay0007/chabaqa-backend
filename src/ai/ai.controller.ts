import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '@nestjs/passport';
import { AskQuestionDto } from './dto/ask-question.dto';

@Controller('ai')
@UseGuards(AuthGuard('jwt'))
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('courses/:courseId/chapters/:chapterId/ask')
  async askQuestion(
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Body() body: AskQuestionDto,
    @Request() req: any,
  ) {
    return this.aiService.askChapterQuestion(
      courseId,
      chapterId,
      body.question,
      req?.user?._id,
    );
  }

  @Get('courses/:courseId/chapters/:chapterId/history')
  async getChapterHistory(
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Request() req: any,
  ) {
    return this.aiService.getChapterHistory(courseId, chapterId, req?.user?._id);
  }
}
