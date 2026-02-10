import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('ai')
@UseGuards(AuthGuard('jwt'))
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('courses/:courseId/chapters/:chapterId/ask')
  async askQuestion(
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Body() body: { question: string },
  ) {
    return this.aiService.askChapterQuestion(courseId, chapterId, body.question);
  }
}
