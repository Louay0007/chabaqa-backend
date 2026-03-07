import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { CourseEnrollmentService } from './course-enrollment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StartChapterDto, StartChapterResponseDto } from '../dto-cours/start-chapter.dto';
import { CompleteSectionDto, CompleteSectionResponseDto } from '../dto-cours/complete-section.dto';
import { UpdateTotalWatchTimeDto } from '../common/dto/update-watch-time.dto';

// Interface pour typer l'objet req.user
interface AuthenticatedUser {
  _id: string;
  email: string;
  name: string;
  role: string;
  isAdmin: boolean;
}

@Controller('course-enrollment')
@UseGuards(JwtAuthGuard)
@ApiTags('Course Enrollment (User)')
@ApiBearerAuth('JWT-auth')
export class CourseEnrollmentController {
  constructor(private readonly courseEnrollmentService: CourseEnrollmentService) { }

  /**
   * Get all user enrollments
   * GET /course-enrollment/my-enrollments
   */
  @Get('my-enrollments')
  @ApiOperation({
    summary: 'Get My Enrollments',
    description: 'Get all enrollments for the current user.',
    tags: ['Course Enrollment (User)']
  })
  @ApiResponse({ status: 200, description: 'Enrollments retrieved successfully' })
  async getMyEnrollments(
    @Request() req: { user: AuthenticatedUser }
  ) {
    const userId = req.user._id != null ? String(req.user._id) : '';
    return await this.courseEnrollmentService.getUserEnrollments(userId);
  }

  /**
   * Démarrer un chapitre
   * POST /course-enrollment/:courseId/sections/:sectionId/chapters/:chapterId/start
   */
  @Post(':courseId/sections/:sectionId/chapters/:chapterId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start Chapter (User)',
    description: 'Start a chapter and track progress. User function.',
    tags: ['Course Enrollment (User)']
  })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiParam({ name: 'sectionId', description: 'Section ID' })
  @ApiParam({ name: 'chapterId', description: 'Chapter ID' })
  @ApiBody({ type: StartChapterDto })
  @ApiResponse({ status: 200, description: 'Chapter started successfully' })
  async startChapter(
    @Request() req: { user: AuthenticatedUser },
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('chapterId') chapterId: string,
    @Body() startChapterDto: StartChapterDto
  ): Promise<StartChapterResponseDto> {
    console.log(`🎯 [CourseEnrollmentController] Démarrage du chapitre ${chapterId}`);
    console.log(`   👤 Utilisateur: ${req.user._id}`);
    console.log(`   📚 Cours: ${courseId}`);
    console.log(`   📖 Section: ${sectionId}`);
    console.log(`   📄 Chapitre: ${chapterId}`);

    return await this.courseEnrollmentService.startChapter(
      req.user._id,
      courseId,
      sectionId,
      chapterId,
      startChapterDto
    );
  }

  /**
   * Obtenir la progression d'un utilisateur pour un cours
   * GET /course-enrollment/:courseId/progress
   */
  @Get(':courseId/progress')
  @ApiOperation({
    summary: 'Get Course Progress (User)',
    description: 'Get user progress for a specific course. User function.',
    tags: ['Course Enrollment (User)']
  })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiResponse({ status: 200, description: 'Course progress retrieved successfully' })
  async getUserCourseProgress(
    @Request() req: { user: AuthenticatedUser },
    @Param('courseId') courseId: string
  ) {
    console.log(`📊 [CourseEnrollmentController] Récupération de la progression pour le cours ${courseId}`);
    console.log(`   👤 Utilisateur: ${req.user._id}`);

    return await this.courseEnrollmentService.getUserCourseProgress(
      req.user._id,
      courseId
    );
  }

  /**
   * Marquer un chapitre comme terminé
   * PUT /course-enrollment/:courseId/chapters/:chapterId/complete
   */
  @Put(':courseId/chapters/:chapterId/complete')
  @ApiOperation({
    summary: 'Complete Chapter (User)',
    description: 'Mark a chapter as completed. User function.',
    tags: ['Course Enrollment (User)']
  })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiParam({ name: 'chapterId', description: 'Chapter ID' })
  @ApiResponse({ status: 200, description: 'Chapter completed successfully' })
  async completeChapter(
    @Request() req: { user: AuthenticatedUser },
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string
  ) {
    console.log(`✅ [CourseEnrollmentController] Marquage du chapitre ${chapterId} comme terminé`);
    console.log(`   👤 Utilisateur: ${req.user._id}`);
    console.log(`   📚 Cours: ${courseId}`);

    return await this.courseEnrollmentService.completeChapter(
      req.user._id,
      courseId,
      chapterId
    );
  }

  /**
   * Mettre à jour le temps de visionnage d'un chapitre
   * PUT /course-enrollment/:courseId/chapters/:chapterId/watch-time
   */
  @Put(':courseId/chapters/:chapterId/watch-time')
  @ApiOperation({
    summary: 'Update Watch Time (User)',
    description: 'Update watch time for a chapter. User function.',
    tags: ['Course Enrollment (User)']
  })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiParam({ name: 'chapterId', description: 'Chapter ID' })
  @ApiBody({
    type: UpdateTotalWatchTimeDto,
  })
  @ApiResponse({ status: 200, description: 'Watch time updated successfully' })
  async updateWatchTime(
    @Request() req: { user: AuthenticatedUser },
    @Param('courseId') courseId: string,
    @Param('chapterId') chapterId: string,
    @Body() body: UpdateTotalWatchTimeDto
  ) {
    console.log(`⏱️ [CourseEnrollmentController] Mise à jour du temps de visionnage pour le chapitre ${chapterId}`);
    console.log(`   👤 Utilisateur: ${req.user._id}`);
    console.log(`   📚 Cours: ${courseId}`);
    console.log(`   ⏰ Temps: ${body.watchTime} secondes`);
    if (body.videoDuration) {
      console.log(`   📐 Durée vidéo: ${body.videoDuration} secondes`);
    }

    return await this.courseEnrollmentService.updateWatchTime(
      req.user._id,
      courseId,
      chapterId,
      body.watchTime,
      body.videoDuration
    );
  }

  /**
   * Marquer une section comme complète
   * PUT /course-enrollment/:courseId/sections/:sectionId/complete
   */
  @Put(':courseId/sections/:sectionId/complete')
  @ApiOperation({
    summary: 'Complete Section (User)',
    description: 'Mark a section as completed. User function.',
    tags: ['Course Enrollment (User)']
  })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiParam({ name: 'sectionId', description: 'Section ID' })
  @ApiBody({ type: CompleteSectionDto })
  @ApiResponse({ status: 200, description: 'Section completed successfully' })
  async completeSection(
    @Request() req: { user: AuthenticatedUser },
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() completeSectionDto: CompleteSectionDto
  ): Promise<CompleteSectionResponseDto> {
    console.log(`📚 [CourseEnrollmentController] Marquage de la section ${sectionId} comme complète`);
    console.log(`   👤 Utilisateur: ${req.user._id}`);
    console.log(`   📚 Cours: ${courseId}`);
    console.log(`   📖 Section: ${sectionId}`);

    return await this.courseEnrollmentService.completeSection(
      req.user._id,
      courseId,
      sectionId,
      completeSectionDto
    );
  }

  /**
   * Obtenir la progression d'une section spécifique
   * GET /course-enrollment/:courseId/sections/:sectionId/progress
   */
  @Get(':courseId/sections/:sectionId/progress')
  @ApiOperation({
    summary: 'Get Section Progress (User)',
    description: 'Get user progress for a specific section. User function.',
    tags: ['Course Enrollment (User)']
  })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiParam({ name: 'sectionId', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section progress retrieved successfully' })
  async getSectionProgress(
    @Request() req: { user: AuthenticatedUser },
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string
  ) {
    console.log(`📊 [CourseEnrollmentController] Récupération de la progression de la section ${sectionId}`);
    console.log(`   👤 Utilisateur: ${req.user._id}`);
    console.log(`   📚 Cours: ${courseId}`);

    return await this.courseEnrollmentService.getSectionProgress(
      req.user._id,
      courseId,
      sectionId
    );
  }
  /**
   * Marquer un cours comme terminé
   * PUT /course-enrollment/:courseId/complete
   */
  @Put(':courseId/complete')
  @ApiOperation({
    summary: 'Complete Course (User)',
    description: 'Mark a course as completed. User function.',
    tags: ['Course Enrollment (User)']
  })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiResponse({ status: 200, description: 'Course completed successfully' })
  async completeCourse(
    @Request() req: { user: AuthenticatedUser },
    @Param('courseId') courseId: string
  ) {
    console.log(`🎓 [CourseEnrollmentController] Marquage du cours ${courseId} comme terminé`);
    console.log(`   👤 Utilisateur: ${req.user._id}`);

    return await this.courseEnrollmentService.completeCourse(
      req.user._id,
      courseId
    );
  }

}
