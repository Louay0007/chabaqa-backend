import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LearningPathService } from './learning-path.service';
import { LearningPathRequestDto } from './dto/learning-path-request.dto';

@ApiTags('Learning Path')
@Controller('learning-path')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LearningPathController {
  constructor(private readonly learningPathService: LearningPathService) {}

  @Post('recommendations')
  @ApiOperation({ summary: 'Get personalized learning path recommendations' })
  async getRecommendations(@Request() req: any, @Body() body: LearningPathRequestDto) {
    const userId = req?.user?._id || req?.user?.userId || req?.user?.id;
    return this.learningPathService.getRecommendations(userId, body);
  }
}
