import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { GeoService } from './geo.service';
import {
  AskGeoQuestionDto,
  GenerateQuizDto,
  SubmitQuizDto,
  GetExplanationDto,
  UpdateDifficultyDto,
} from './dto/geo.dto';

@Controller('ai/geo')
@UseGuards(AuthGuard('jwt'))
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  /**
   * Ask Geo a question about a chapter (supports image upload)
   * POST /ai/geo/courses/:courseId/chapters/:chapterId/ask
   */
  @Post('courses/:courseId/chapters/:chapterId/ask')
  @UseInterceptors(FileInterceptor('image'))
  async askGeo(
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Body() body: AskGeoQuestionDto,
    @Request() req: any,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const imageBase64 = image ? image.buffer.toString('base64') : undefined;
    return this.geoService.askGeoQuestion(
      courseId,
      chapterId,
      body.question,
      req?.user?._id,
      {
        difficultyLevel: body.difficultyLevel,
        imageBase64,
      },
    );
  }

  /**
   * Get Geo conversation history for a chapter
   * GET /ai/geo/courses/:courseId/chapters/:chapterId/history
   */
  @Get('courses/:courseId/chapters/:chapterId/history')
  async getHistory(
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Request() req: any,
  ) {
    return this.geoService.getGeoHistory(courseId, chapterId, req?.user?._id);
  }

  /**
   * Generate a quiz for a chapter
   * POST /ai/geo/courses/:courseId/chapters/:chapterId/quiz/generate
   */
  @Post('courses/:courseId/chapters/:chapterId/quiz/generate')
  async generateQuiz(
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Body() body: GenerateQuizDto,
    @Request() req: any,
  ) {
    return this.geoService.generateQuiz(courseId, chapterId, req?.user?._id, {
      difficultyLevel: body.difficultyLevel,
      questionCount: body.questionCount,
      questionTypes: body.questionTypes,
    });
  }

  /**
   * Submit quiz answers and get results
   * POST /ai/geo/quiz/:quizId/submit
   */
  @Post('quiz/:quizId/submit')
  async submitQuiz(
    @Param('quizId') quizId: string,
    @Body() body: SubmitQuizDto,
    @Request() req: any,
  ) {
    return this.geoService.submitQuizAnswers(quizId, req?.user?._id, body.answers);
  }

  /**
   * Get a detailed explanation for a topic
   * POST /ai/geo/courses/:courseId/chapters/:chapterId/explain
   */
  @Post('courses/:courseId/chapters/:chapterId/explain')
  async getExplanation(
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Body() body: GetExplanationDto,
    @Request() req: any,
  ) {
    return this.geoService.getExplanation(
      courseId,
      chapterId,
      body.topic,
      req?.user?._id,
      body.difficultyLevel,
    );
  }

  /**
   * Get the user's Geo profile (points, streak, achievements)
   * GET /ai/geo/profile
   */
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.geoService.getGeoProfile(req?.user?._id);
  }

  /**
   * Update the user's preferred difficulty level
   * PATCH /ai/geo/profile/difficulty
   */
  @Patch('profile/difficulty')
  async updateDifficulty(
    @Body() body: UpdateDifficultyDto,
    @Request() req: any,
  ) {
    return this.geoService.updateDifficultyPreference(req?.user?._id, body.difficultyLevel);
  }

  /**
   * Get all available Geo achievements
   * GET /ai/geo/achievements
   */
  @Get('achievements')
  async getAchievements() {
    return this.geoService.getAllAchievements();
  }
}
