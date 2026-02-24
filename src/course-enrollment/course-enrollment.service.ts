import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { TrackableContentType } from '../schema/content-tracking.schema';
import {
  CourseEnrollment,
  CourseEnrollmentDocument,
  CourseProgress,
} from '../schema/course.schema';
import { AnalyticsDaily, AnalyticsDailyDocument } from '../schema/analytics-daily.schema';
import { Cours, CoursDocument } from '../schema/course.schema';
import { User, UserDocument } from '../schema/user.schema';
import {
  StartChapterDto,
  StartChapterResponseDto,
} from '../dto-cours/start-chapter.dto';
import {
  CompleteSectionDto,
  CompleteSectionResponseDto,
} from '../dto-cours/complete-section.dto';
import { NotificationService } from '../notification/notification.service';
import { AchievementService } from '../achievement/achievement.service';

@Injectable()
export class CourseEnrollmentService {
  // Auto-complete threshold (percent). Chapters watched this percent or higher are auto-completed.
  // Default: 90 (aligns with frontend ~90% behaviour)
  private readonly AUTO_COMPLETE_THRESHOLD = 90;

  constructor(
    @InjectModel(CourseEnrollment.name)
    private courseEnrollmentModel: Model<CourseEnrollmentDocument>,
    @InjectModel(Cours.name) private coursModel: Model<CoursDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AnalyticsDaily.name) private analyticsDailyModel: Model<AnalyticsDailyDocument>,
    private readonly notificationService: NotificationService,
    private readonly achievementService: AchievementService,
    private readonly trackingService: ContentTrackingService,
  ) {}

  private async resolveCourse(courseId: string): Promise<CoursDocument> {
    let course: CoursDocument | null = null;
    if (Types.ObjectId.isValid(courseId)) {
      course = await this.coursModel.findById(courseId);
    }
    if (!course) {
      course = await this.coursModel.findOne({ id: courseId });
    }
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }
    return course;
  }

  private getCourseTrackingId(course: CoursDocument): string {
    return course?.id ? String(course.id) : String(course._id);
  }

  private computeEnrollmentCourseProgress(
    course: CoursDocument,
    enrollment: CourseEnrollmentDocument,
  ): { totalChapters: number; completedChapters: number; progressPercent: number; isCompleted: boolean } {
    const totalChapters =
      course.sections?.reduce(
        (acc: number, section: any) => acc + (section?.chapitres?.length || 0),
        0,
      ) || 0;

    const completedChapters =
      enrollment.progression?.filter((p) => p?.isCompleted).length || 0;

    const progressPercent =
      totalChapters > 0
        ? Math.round((completedChapters / totalChapters) * 100)
        : 0;

    const isCompleted = totalChapters > 0 && completedChapters >= totalChapters;

    return { totalChapters, completedChapters, progressPercent, isCompleted };
  }

  private async syncEnrollmentTrackingProgress(
    userId: string,
    course: CoursDocument,
    enrollment: CourseEnrollmentDocument,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    try {
      const trackingId = this.getCourseTrackingId(course);
      const snapshot = this.computeEnrollmentCourseProgress(course, enrollment);

      await this.trackingService.syncProgressSnapshot(
        userId,
        trackingId,
        TrackableContentType.COURSE,
        {
          progressPercent: snapshot.progressPercent,
          watchTime: (enrollment.progression || []).reduce(
            (acc, p) => acc + Math.max(0, Number(p?.watchTime || 0)),
            0,
          ),
          isCompleted: snapshot.isCompleted || Boolean(enrollment.completedAt),
          completedAt: enrollment.completedAt || undefined,
          lastAccessedAt: enrollment.updatedAt || new Date(),
          metadata: {
            completedChapters: snapshot.completedChapters,
            totalChapters: snapshot.totalChapters,
            ...metadata,
          },
        },
      );
    } catch (error) {
      console.error(
        `⚠️ [CourseEnrollmentService] Failed to sync tracking progress for course ${course?.id || course?._id}:`,
        (error as any)?.message || error,
      );
    }
  }

  /**
   * Démarrer un chapitre pour un utilisateur
   */
  async startChapter(
    userId: string,
    courseId: string,
    sectionId: string,
    chapterId: string,
    startChapterDto: StartChapterDto,
  ): Promise<StartChapterResponseDto> {
    console.log(
      `🚀 [CourseEnrollmentService] Démarrage du chapitre ${chapterId} pour l'utilisateur ${userId}`,
    );

    // Vérifier que l'utilisateur existe
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Vérifier que le cours existe
    const course = await this.resolveCourse(courseId);

    // Vérifier que la section existe dans le cours
    const section = course.sections.find((s) => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    // Vérifier que le chapitre existe dans la section
    const chapter = section.chapitres.find((c) => c.id === chapterId);
    if (!chapter) {
      throw new NotFoundException('Chapitre non trouvé dans cette section');
    }

    // Vérifier si l'utilisateur est inscrit au cours
    let enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true,
    });

    if (!enrollment) {
      throw new BadRequestException(
        'Vous devez être inscrit au cours avant de démarrer un chapitre',
      );
    }

    // Vérifier l'accès séquentiel si activé
    if (course.sequentialProgression) {
      console.log(
        `🔒 [CourseEnrollmentService] Vérification de l'accès séquentiel pour le chapitre ${chapterId}`,
      );

      const accessCheck = course.verifierAccesChapitre(
        chapterId,
        enrollment.progression,
      );

      if (!accessCheck.hasAccess) {
        console.log(
          `❌ [CourseEnrollmentService] Accès refusé - ${accessCheck.reason}`,
        );

        let errorMessage = 'Vous ne pouvez pas accéder à ce chapitre.';

        if (accessCheck.requiredChapter) {
          errorMessage = `Vous devez compléter le chapitre "${accessCheck.requiredChapter.titre}" avant d'accéder à ce chapitre.`;
        }

        if (course.unlockMessage) {
          errorMessage = course.unlockMessage;
        }

        throw new BadRequestException(errorMessage);
      }

      console.log(`✅ [CourseEnrollmentService] Accès séquentiel autorisé`);
    }

    // Vérifier si une progression existe déjà pour ce chapitre
    const existingProgress = enrollment.progression.find(
      (p) => p.chapterId === chapterId,
    );
    const hadWatchBefore = Number(existingProgress?.watchTime ?? 0) > 0;
    const wasCompletedBefore = Boolean(existingProgress?.isCompleted);
    let progress = existingProgress;

    if (!progress) {
      console.log(
        `📊 [CourseEnrollmentService] Création d'une nouvelle progression pour le chapitre ${chapterId}`,
      );

      // Créer une nouvelle progression
      progress = {
        id: new Types.ObjectId().toString(),
        enrollmentId: enrollment._id,
        chapterId: chapterId,
        isCompleted: false,
        watchTime: startChapterDto.watchTime || 0,
        lastAccessedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      enrollment.progression.push(progress);
    } else {
      console.log(
        `📊 [CourseEnrollmentService] Mise à jour de la progression existante pour le chapitre ${chapterId}`,
      );

      // Mettre à jour la progression existante
      progress.lastAccessedAt = new Date();
      if (startChapterDto.watchTime !== undefined) {
        progress.watchTime = startChapterDto.watchTime;
      }
      progress.updatedAt = new Date();
    }

    // Sauvegarder l'inscription
    await enrollment.save();

    const trackingCourseId = this.getCourseTrackingId(course);
    const chapterWatchTime = Number(progress?.watchTime ?? 0);
    const chapterJustCompleted = !wasCompletedBefore && Boolean(progress?.isCompleted);

    if (!hadWatchBefore && chapterWatchTime > 0) {
      try {
        await this.trackingService.trackChapterStart(
          userId,
          trackingCourseId,
          chapterId,
          { source: 'chapter_start_endpoint' },
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Failed to track chapter start for ${chapterId}:`,
          (error as any)?.message || error,
        );
      }
    }

    if (chapterJustCompleted) {
      try {
        await this.trackingService.trackChapterComplete(
          userId,
          trackingCourseId,
          chapterId,
          { source: 'chapter_start_endpoint' },
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Failed to track chapter completion for ${chapterId}:`,
          (error as any)?.message || error,
        );
      }
    }

    await this.syncEnrollmentTrackingProgress(userId, course, enrollment, {
      lastChapterId: chapterId,
      source: 'chapter_start_endpoint',
    });

    console.log(
      `✅ [CourseEnrollmentService] Chapitre ${chapterId} démarré avec succès`,
    );

    return {
      success: true,
      message: `Chapitre "${chapter.titre}" démarré avec succès`,
      enrollmentId: enrollment.id,
      chapterId: chapterId,
      progress: {
        isCompleted: progress.isCompleted,
        watchTime: progress.watchTime,
        lastAccessedAt: progress.lastAccessedAt,
      },
    };
  }

  /**
   * Get all enrollments for a user
   */
  async getUserEnrollments(userId: string) {
    const enrollments = await this.courseEnrollmentModel
      .find({
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .populate('courseId')
      .exec();

    // Transform enrollments with progress data
    const result: any[] = [];
    for (const enrollment of enrollments) {
      const course = enrollment.courseId as any;
      if (!course) continue;

      // Calculate progress
      const totalChapters = course.obtenirNombreChapitres
        ? course.obtenirNombreChapitres()
        : course.sections?.reduce(
            (acc: number, section: any) =>
              acc + (section.chapitres?.length || 0),
            0,
          ) || 0;

      const chaptersCompleted =
        enrollment.progression?.filter((p) => p.isCompleted).length || 0;
      const progress =
        totalChapters > 0
          ? Math.round((chaptersCompleted / totalChapters) * 100)
          : 0;

      const courseIdValue = course.id || course._id.toString(); // Use custom id field if available

      result.push({
        id: enrollment._id.toString(),
        userId: enrollment.userId.toString(),
        courseId: courseIdValue,
        progress,
        totalChapters,
        isCompleted: totalChapters > 0 && chaptersCompleted >= totalChapters,
        completedChapters:
          enrollment.progression
            ?.filter((p) => p?.isCompleted)
            .map((p) => p.chapterId)
            .filter(Boolean) || [],
        enrolledAt: enrollment.enrolledAt,
        lastAccessedAt: enrollment.updatedAt || enrollment.enrolledAt,
      });

      console.log(
        `   ✅ Enrollment for course: ${course.titre} -> courseId: ${courseIdValue}`,
      );
    }

    return { enrollments: result };
  }

  /**
   * Obtenir la progression d'un utilisateur pour un cours
   */
  async getUserCourseProgress(userId: string, courseId: string) {
    let course: any = null;
    if (Types.ObjectId.isValid(courseId)) {
      course = await this.coursModel.findById(courseId);
    }
    if (!course) {
      course = await this.coursModel.findOne({ id: courseId });
    }
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true,
    });

    if (!enrollment) {
      const totalChapters = (course.sections || []).reduce(
        (acc, section) => acc + (section.chapitres?.length || 0),
        0,
      );
      return {
        isEnrolled: false,
        progress: 0,
        chaptersCompleted: 0,
        totalChapters,
      };
    }

    // Calculate progress based on watch time percentage for each chapter
    let totalWatchTimeProgress = 0;
    let totalChapters = 0;

    for (const section of course.sections) {
      for (const chapter of section.chapitres) {
        totalChapters++;
        const chapterProgress = enrollment.progression.find(
          (p) => p.chapterId === chapter.id,
        );

        if (chapterProgress) {
          if (chapterProgress.isCompleted) {
            // Completed chapters count as 100%
            totalWatchTimeProgress += 100;
          } else if (chapterProgress.watchTime > 0) {
            // Get chapter duration in seconds
            let chapterDurationSeconds = 0;

            // First, check if we have videoDuration stored in progress (most accurate)
            const progressAny = chapterProgress as any;
            if (progressAny.videoDuration && progressAny.videoDuration > 0) {
              chapterDurationSeconds = progressAny.videoDuration;
            } else if (chapter.duree && chapter.duree > 0) {
              // chapter.duree is stored in minutes, convert to seconds
              // Increase threshold to 1000 to support longer chapters (up to ~16 hours)
              if (chapter.duree > 1000) {
                // Likely stored in seconds (legacy data)
                chapterDurationSeconds = chapter.duree;
              } else {
                // Stored in minutes
                chapterDurationSeconds = chapter.duree * 60;
              }
            }

            if (chapterDurationSeconds > 0) {
              const watchPercentage = Math.min(
                (chapterProgress.watchTime / chapterDurationSeconds) * 100,
                100,
              );
              totalWatchTimeProgress += watchPercentage;

              console.log(
                `   📊 Chapter ${chapter.titre}: ${chapterProgress.watchTime}s / ${chapterDurationSeconds}s = ${watchPercentage.toFixed(1)}%`,
              );
            }
          }
          // If no watch time and not completed, contributes 0%
        }
      }
    }

    const progress =
      totalChapters > 0 ? totalWatchTimeProgress / totalChapters : 0;
    const chaptersCompleted = enrollment.progression.filter(
      (p) => p.isCompleted,
    ).length;

    console.log(
      `   📈 Total progress: ${progress.toFixed(2)}% (${chaptersCompleted}/${totalChapters} chapters completed)`,
    );

    return {
      isEnrolled: true,
      progress: Math.round(progress * 100) / 100,
      chaptersCompleted,
      totalChapters,
      enrollment: {
        id: enrollment.id,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        progression: enrollment.progression,
      },
    };
  }

  /**
   * Marquer un chapitre comme terminé
   */
  async completeChapter(userId: string, courseId: string, chapterId: string) {
    // Vérifier que le cours existe - support both custom id and MongoDB _id
    let course = await this.coursModel.findOne({ id: courseId });
    if (!course) {
      try {
        course = await this.coursModel.findById(courseId);
      } catch (e) {
        // Invalid ObjectId format, ignore
      }
    }
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Use the actual MongoDB _id for enrollment lookup
    const courseMongoId = course._id;

    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: courseMongoId,
      isActive: true,
    });

    if (!enrollment) {
      throw new NotFoundException('Inscription au cours non trouvée');
    }

    const chapterProgressBefore = new Map(
      (enrollment.progression || []).map((p) => [
        p.chapterId,
        {
          isCompleted: Boolean(p?.isCompleted),
          watchTime: Number(p?.watchTime || 0),
        },
      ]),
    );

    // Vérifier l'accès séquentiel si activé
    if (course.sequentialProgression) {
      console.log(
        `🔒 [CourseEnrollmentService] Vérification de l'accès séquentiel pour compléter le chapitre ${chapterId}`,
      );

      const accessCheck = course.verifierAccesChapitre(
        chapterId,
        enrollment.progression,
      );

      if (!accessCheck.hasAccess) {
        console.log(
          `❌ [CourseEnrollmentService] Accès refusé pour compléter - ${accessCheck.reason}`,
        );

        let errorMessage = 'Vous ne pouvez pas compléter ce chapitre.';

        if (accessCheck.requiredChapter) {
          errorMessage = `Vous devez compléter le chapitre "${accessCheck.requiredChapter.titre}" avant de pouvoir compléter ce chapitre.`;
        }

        if (course.unlockMessage) {
          errorMessage = course.unlockMessage;
        }

        throw new BadRequestException(errorMessage);
      }

      console.log(
        `✅ [CourseEnrollmentService] Accès séquentiel autorisé pour compléter`,
      );
    }

    const existingProgress = enrollment.progression.find(
      (p) => p.chapterId === chapterId,
    );
    const hadWatchBefore = Number(existingProgress?.watchTime ?? 0) > 0;
    const wasCompletedBefore = Boolean(existingProgress?.isCompleted);
    let progress = existingProgress;
    if (!progress) {
      progress = {
        id: new Types.ObjectId().toString(),
        enrollmentId: enrollment._id,
        chapterId: chapterId,
        isCompleted: true,
        watchTime: 0,
        lastAccessedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
      };

      enrollment.progression.push(progress);
    } else {
      progress.isCompleted = true;
      progress.completedAt = new Date();
      progress.updatedAt = new Date();
    }

    await enrollment.save();

    const trackingCourseId = this.getCourseTrackingId(course);
    const chapterJustCompleted = !wasCompletedBefore && Boolean(progress?.isCompleted);

    if (!hadWatchBefore && chapterJustCompleted) {
      try {
        await this.trackingService.trackChapterStart(
          userId,
          trackingCourseId,
          chapterId,
          { source: 'manual_chapter_complete' },
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Failed to track implicit chapter start for ${chapterId}:`,
          (error as any)?.message || error,
        );
      }
    }

    if (chapterJustCompleted) {
      try {
        await this.trackingService.trackChapterComplete(
          userId,
          trackingCourseId,
          chapterId,
          { source: 'manual_chapter_complete' },
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Failed to track chapter completion for ${chapterId}:`,
          (error as any)?.message || error,
        );
      }
    }

    await this.syncEnrollmentTrackingProgress(userId, course, enrollment, {
      lastChapterId: chapterId,
      source: 'manual_chapter_complete',
    });

    // Check for achievements
    if (course.communityId) {
      try {
        console.log(
          `🏆 [CourseEnrollmentService] Checking achievements for user ${userId} in community ${course.communityId}`,
        );
        await this.achievementService.checkAchievements(
          userId,
          course.communityId,
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Error checking achievements: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      message: 'Chapitre marqué comme terminé',
      chapterId: chapterId,
      completedAt: progress.completedAt,
    };
  }

  /**
   * Mettre à jour le temps de visionnage d'un chapitre
   * @param userId User ID
   * @param courseId Course ID
   * @param chapterId Chapter ID
   * @param watchTime Watch time in seconds
   * @param videoDuration Optional video duration in seconds (from frontend)
   */
  async updateWatchTime(
    userId: string,
    courseId: string,
    chapterId: string,
    watchTime: number,
    videoDuration?: number,
  ) {
    if (!Number.isFinite(watchTime) || watchTime < 0) {
      throw new BadRequestException(
        'watchTime doit être un nombre positif (en secondes)',
      );
    }

    // Verify course exists - support both custom id and MongoDB _id
    let course = await this.coursModel.findOne({ id: courseId });
    if (!course) {
      // Try finding by MongoDB _id if not found by custom id
      try {
        course = await this.coursModel.findById(courseId);
      } catch (e) {
        // Invalid ObjectId format, ignore
      }
    }
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Use the actual MongoDB _id for enrollment lookup
    const courseMongoId = course._id;

    let enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: courseMongoId,
      isActive: true,
    });

    // Auto-create enrollment if it doesn't exist (for free courses or already purchased)
    if (!enrollment) {
      console.log(
        `📝 [CourseEnrollmentService] Auto-creating enrollment for user ${userId} in course ${courseId}`,
      );

      enrollment = new this.courseEnrollmentModel({
        id: new Types.ObjectId().toString(),
        userId: new Types.ObjectId(userId),
        courseId: courseMongoId,
        isActive: true,
        enrolledAt: new Date(),
        progression: [],
      });

      await enrollment.save();
      console.log(
        `✅ [CourseEnrollmentService] Enrollment auto-created successfully`,
      );
    }

    let progress = enrollment.progression.find(
      (p) => p.chapterId === chapterId,
    );

    // If progress doesn't exist, create it
    if (!progress) {
      console.log(
        `📊 [CourseEnrollmentService] Création d'une nouvelle progression pour le chapitre ${chapterId} lors de la mise à jour du temps`,
      );

      progress = {
        id: new Types.ObjectId().toString(),
        enrollmentId: enrollment._id,
        chapterId: chapterId,
        isCompleted: false,
        watchTime: 0,
        lastAccessedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      enrollment.progression.push(progress);
    }

    const hadWatchBefore = Number(progress.watchTime ?? 0) > 0;
    const wasCompletedBefore = Boolean(progress.isCompleted);

    const normalizedWatchTimeSeconds = Math.floor(watchTime);
    const currentProgression = Number(progress.watchTime ?? 0);
    
    // Only update if the new watch time is greater than what we already have saved
    // CRITICAL FIX: If already completed, DO NOT overwrite/revert progress unless explicitly forced.
    // However, if the user re-watches, we might want to track that, BUT NEVER unset isCompleted.
    // The High-Water Mark logic handles the `watchTime` value itself (line 567), but we must ensure `isCompleted` sticks.
    
    if (normalizedWatchTimeSeconds > currentProgression) {
      const deltaSeconds = normalizedWatchTimeSeconds - currentProgression;
      progress.watchTime = normalizedWatchTimeSeconds;
      console.log(`📈 [CourseEnrollmentService] Progress increased: ${currentProgression}s -> ${normalizedWatchTimeSeconds}s (delta: ${deltaSeconds}s)`);

      // Real-time rollup of watchTime into AnalyticsDaily
      if (deltaSeconds > 0 && course?.creatorId) {
        const todayUTC = new Date();
        const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));
        
        try {
          await this.analyticsDailyModel.updateOne(
            {
              creatorId: course.creatorId,
              contentType: 'course',
              contentId: String(course.id || courseId),
              communityId: course.communityId,
              date: dayStart
            },
            { $inc: { watchTime: deltaSeconds } },
            { upsert: true }
          );
        } catch (err) {
          console.error('⚠️ [CourseEnrollmentService] Failed real-time watchTime rollup:', err.message);
        }
      }
    } else {
      console.log(`ℹ️ [CourseEnrollmentService] Progress maintained at ${currentProgression}s (ignored smaller value ${normalizedWatchTimeSeconds}s)`);
    }

    // Auto-complete chapter if watch time reaches threshold
    let isAutoCompleted = false;

    progress.lastAccessedAt = new Date();
    progress.updatedAt = new Date();
    let watchPercentage = 0;

    // Get chapter duration for percentage calculation
    let chapterDurationSeconds: number | undefined = videoDuration;

    if (course) {
      // Find the chapter to get its stored duration or update it
      for (let sIdx = 0; sIdx < course.sections.length; sIdx++) {
        const section = course.sections[sIdx];
        const cIdx = section.chapitres.findIndex((c) => c.id === chapterId);
        if (cIdx !== -1) {
          const chapter = section.chapitres[cIdx];

          // If videoDuration was provided, update the chapter duration in DB if significantly different
          if (videoDuration && videoDuration > 0) {
            const durationInMinutes = Math.round(videoDuration / 60);
            if (
              !chapter.duree ||
              chapter.duree === 0 ||
              Math.abs(chapter.duree - (videoDuration > 1000 ? videoDuration : durationInMinutes)) > 2
            ) {
              console.log(
                `📝 [CourseEnrollmentService] Updating chapter ${chapterId} duration to ${videoDuration}s`,
              );
              // Store as seconds if > 1000, else minutes (following existing logic)
              course.sections[sIdx].chapitres[cIdx].duree = videoDuration > 1000 ? videoDuration : durationInMinutes;
              course.markModified('sections');
              await course.save();
            }
            chapterDurationSeconds = videoDuration;
          } else if (chapter.duree) {
            // Handle legacy data: if duree > 1000, it's likely in seconds
            if (chapter.duree > 1000) {
              chapterDurationSeconds = chapter.duree;
            } else {
              chapterDurationSeconds = chapter.duree * 60; // duree is in minutes
            }
          }
          break;
        }
      }
    }

    if (
      !progress.isCompleted &&
      chapterDurationSeconds &&
      chapterDurationSeconds > 0
    ) {
      watchPercentage = (progress.watchTime / chapterDurationSeconds) * 100;

      console.log(
        `   📊 Watch progress: ${progress.watchTime}s / ${chapterDurationSeconds}s = ${watchPercentage.toFixed(1)}%`,
      );

      // Auto-complete if watched >= configured threshold
      if (watchPercentage >= this.AUTO_COMPLETE_THRESHOLD) {
        progress.isCompleted = true;
        progress.completedAt = new Date();
        isAutoCompleted = true;
        console.log(
          `✅ [CourseEnrollmentService] Auto-completed chapter ${chapterId} (${Math.round(watchPercentage)}% watched)`,
        );
      }
    }

    await enrollment.save();
    const trackingCourseId = this.getCourseTrackingId(course);
    const chapterJustCompleted = !wasCompletedBefore && Boolean(progress.isCompleted);

    if (!hadWatchBefore && Number(progress.watchTime ?? 0) > 0) {
      try {
        await this.trackingService.trackChapterStart(
          userId,
          trackingCourseId,
          chapterId,
          { source: 'watch_time_update' },
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Failed to track chapter start for ${chapterId}:`,
          (error as any)?.message || error,
        );
      }
    }

    if (chapterJustCompleted) {
      try {
        await this.trackingService.trackChapterComplete(
          userId,
          trackingCourseId,
          chapterId,
          { source: isAutoCompleted ? 'watch_time_auto_complete' : 'watch_time_update' },
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Failed to track chapter completion for ${chapterId}:`,
          (error as any)?.message || error,
        );
      }
    }

    await this.syncEnrollmentTrackingProgress(userId, course, enrollment, {
      lastChapterId: chapterId,
      source: isAutoCompleted ? 'watch_time_auto_complete' : 'watch_time_update',
    });

    // Check for achievements if chapter was auto-completed
    if (chapterJustCompleted && course && course.communityId) {
      try {
        console.log(
          `🏆 [CourseEnrollmentService] Checking achievements for user ${userId} in community ${course.communityId}`,
        );
        await this.achievementService.checkAchievements(
          userId,
          course.communityId,
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Error checking achievements: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      message: isAutoCompleted
        ? 'Chapitre terminé automatiquement'
        : 'Temps de visionnage mis à jour',
      chapterId: chapterId,
      watchTime: progress.watchTime,
      watchPercentage: Math.round(watchPercentage * 100) / 100,
      isCompleted: progress.isCompleted,
      isAutoCompleted,
      lastAccessedAt: progress.lastAccessedAt,
    };
  }

  /**
   * Marquer une section comme complète
   * Une section est complète quand tous ses chapitres sont terminés
   */
  async completeSection(
    userId: string,
    courseId: string,
    sectionId: string,
    completeSectionDto: CompleteSectionDto,
  ): Promise<CompleteSectionResponseDto> {
    console.log(
      `📚 [CourseEnrollmentService] Marquage de la section ${sectionId} comme complète`,
    );
    console.log(`   👤 Utilisateur: ${userId}`);
    console.log(`   📚 Cours: ${courseId}`);

    // Vérifier que l'utilisateur existe
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Vérifier que le cours existe
    const course = await this.resolveCourse(courseId);

    // Vérifier que la section existe dans le cours
    const section = course.sections.find((s) => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    // Vérifier si l'utilisateur est inscrit au cours
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true,
    });

    if (!enrollment) {
      throw new NotFoundException('Inscription au cours non trouvée');
    }

    // Obtenir tous les chapitres de la section
    const sectionChapters = section.chapitres;
    const totalChapters = sectionChapters.length;

    if (totalChapters === 0) {
      throw new BadRequestException('Cette section ne contient aucun chapitre');
    }

    const chapterProgressBefore = new Map<
      string,
      { isCompleted: boolean; watchTime: number }
    >();
    for (const chapter of sectionChapters) {
      const previous = enrollment.progression.find((p) => p.chapterId === chapter.id);
      chapterProgressBefore.set(chapter.id, {
        isCompleted: Boolean(previous?.isCompleted),
        watchTime: Number(previous?.watchTime || 0),
      });
    }

    // Vérifier la progression de chaque chapitre
    const chaptersProgress = sectionChapters.map((chapter) => {
      const progress = enrollment.progression.find(
        (p) => p.chapterId === chapter.id,
      );
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.titre,
        isCompleted: progress ? progress.isCompleted : false,
        progress: progress,
      };
    });

    const chaptersCompleted = chaptersProgress.filter(
      (cp) => cp.isCompleted,
    ).length;
    const completionPercentage = (chaptersCompleted / totalChapters) * 100;

    console.log(`   📊 Progression de la section:`);
    console.log(`      📄 Chapitres totaux: ${totalChapters}`);
    console.log(`      ✅ Chapitres terminés: ${chaptersCompleted}`);
    console.log(`      📈 Pourcentage: ${completionPercentage.toFixed(1)}%`);

    // Vérifier si tous les chapitres sont terminés
    const allChaptersCompleted = chaptersCompleted === totalChapters;
    const forceComplete = completeSectionDto.forceComplete || false;

    if (!allChaptersCompleted && !forceComplete) {
      console.log(
        `   ⚠️ Section non complète - tous les chapitres doivent être terminés`,
      );

      // Retourner les détails de la progression
      return {
        success: false,
        message: `Section non complète. ${chaptersCompleted}/${totalChapters} chapitres terminés.`,
        sectionId: sectionId,
        courseId: courseId,
        isCompleted: false,
        chaptersCompleted: chaptersCompleted,
        totalChapters: totalChapters,
        completionPercentage: Math.round(completionPercentage * 100) / 100,
      };
    }

    // Si on force la completion ou si tous les chapitres sont terminés
    if (forceComplete && !allChaptersCompleted) {
      console.log(`   🔧 Forçage de la completion de la section`);

      // Marquer tous les chapitres non terminés comme terminés
      for (const chapterProgress of chaptersProgress) {
        if (!chapterProgress.isCompleted) {
          let progress = enrollment.progression.find(
            (p) => p.chapterId === chapterProgress.chapterId,
          );

          if (!progress) {
            // Créer une nouvelle progression pour ce chapitre
            progress = {
              id: new Types.ObjectId().toString(),
              enrollmentId: enrollment._id,
              chapterId: chapterProgress.chapterId,
              isCompleted: true,
              watchTime: 0,
              lastAccessedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            enrollment.progression.push(progress);
          } else {
            // Marquer la progression existante comme terminée
            progress.isCompleted = true;
            progress.completedAt = new Date();
            progress.updatedAt = new Date();
          }
        }
      }
    }

    // Sauvegarder l'inscription
    await enrollment.save();

    const trackingCourseId = this.getCourseTrackingId(course);
    for (const chapter of sectionChapters) {
      const before = chapterProgressBefore.get(chapter.id);
      const current = enrollment.progression.find((p) => p.chapterId === chapter.id);
      const becameCompleted = !Boolean(before?.isCompleted) && Boolean(current?.isCompleted);

      if (!becameCompleted) continue;

      if (!before || Number(before.watchTime || 0) <= 0) {
        try {
          await this.trackingService.trackChapterStart(
            userId,
            trackingCourseId,
            chapter.id,
            { source: 'section_complete' },
          );
        } catch (error) {
          console.error(
            `⚠️ [CourseEnrollmentService] Failed to track implicit chapter start for ${chapter.id}:`,
            (error as any)?.message || error,
          );
        }
      }

      try {
        await this.trackingService.trackChapterComplete(
          userId,
          trackingCourseId,
          chapter.id,
          { source: 'section_complete' },
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Failed to track chapter completion for ${chapter.id}:`,
          (error as any)?.message || error,
        );
      }
    }

    await this.syncEnrollmentTrackingProgress(userId, course, enrollment, {
      sectionId,
      source: 'section_complete',
    });

    console.log(`   ✅ Section "${section.titre}" marquée comme complète`);

    // Check for achievements
    if (course.communityId) {
      try {
        console.log(
          `🏆 [CourseEnrollmentService] Checking achievements for user ${userId} in community ${course.communityId}`,
        );
        await this.achievementService.checkAchievements(
          userId,
          course.communityId,
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Error checking achievements: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      message: `Section "${section.titre}" marquée comme complète`,
      sectionId: sectionId,
      courseId: courseId,
      isCompleted: true,
      chaptersCompleted: totalChapters,
      totalChapters: totalChapters,
      completionPercentage: 100,
      completedAt: new Date(),
    };
  }

  /**
   * Obtenir la progression d'une section spécifique
   */
  async getSectionProgress(
    userId: string,
    courseId: string,
    sectionId: string,
  ) {
    console.log(
      `📊 [CourseEnrollmentService] Récupération de la progression de la section ${sectionId}`,
    );

    // Vérifier que le cours existe
    const course = await this.resolveCourse(courseId);

    // Vérifier que la section existe dans le cours
    const section = course.sections.find((s) => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    // Vérifier si l'utilisateur est inscrit au cours
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true,
    });

    if (!enrollment) {
      return {
        isEnrolled: false,
        sectionId: sectionId,
        sectionTitle: section.titre,
        chaptersCompleted: 0,
        totalChapters: section.chapitres.length,
        completionPercentage: 0,
        chapters: [],
      };
    }

    // Analyser la progression de chaque chapitre
    const chaptersProgress = section.chapitres.map((chapter) => {
      const progress = enrollment.progression.find(
        (p) => p.chapterId === chapter.id,
      );
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.titre,
        isCompleted: progress ? progress.isCompleted : false,
        watchTime: progress ? progress.watchTime : 0,
        lastAccessedAt: progress ? progress.lastAccessedAt : null,
        completedAt: progress ? progress.completedAt : null,
      };
    });

    const chaptersCompleted = chaptersProgress.filter(
      (cp) => cp.isCompleted,
    ).length;
    const totalChapters = section.chapitres.length;
    const completionPercentage =
      totalChapters > 0 ? (chaptersCompleted / totalChapters) * 100 : 0;

    return {
      isEnrolled: true,
      sectionId: sectionId,
      sectionTitle: section.titre,
      chaptersCompleted: chaptersCompleted,
      totalChapters: totalChapters,
      completionPercentage: Math.round(completionPercentage * 100) / 100,
      chapters: chaptersProgress,
    };
  }
  /**
   * Marquer un cours comme terminé
   */
  async completeCourse(userId: string, courseId: string) {
    console.log(
      `🎓 [CourseEnrollmentService] Marquage du cours ${courseId} comme terminé`,
    );
    console.log(`   👤 Utilisateur: ${userId}`);

    // Vérifier que le cours existe - support both custom id and MongoDB _id
    let course = await this.coursModel.findOne({ id: courseId });
    if (!course) {
      try {
        course = await this.coursModel.findById(courseId);
      } catch (e) {
        // Invalid ObjectId format, ignore
      }
    }
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Use the actual MongoDB _id for enrollment lookup
    const courseMongoId = course._id;

    // Vérifier que l'utilisateur est inscrit
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: courseMongoId,
      isActive: true,
    });

    if (!enrollment) {
      throw new NotFoundException('Inscription au cours non trouvée');
    }

    // Récupérer tous les chapitres du cours
    const allChapters = course.sections.flatMap((section) => section.chapitres);
    const totalChapters = allChapters.length;

    if (totalChapters === 0) {
      throw new BadRequestException('Ce cours ne contient aucun chapitre');
    }

    // Le cours est considéré terminé uniquement si tous les chapitres sont terminés.
    const incompleteChapters = allChapters.filter((chapter) => {
      const progress = enrollment.progression.find(
        (p) => p.chapterId === chapter.id,
      );
      return !progress?.isCompleted;
    });

    if (incompleteChapters.length > 0) {
      throw new BadRequestException(
        'Vous devez terminer tous les chapitres avant de terminer le cours',
      );
    }

    // Marquer l'inscription comme complète
    enrollment.completedAt = new Date();

    await enrollment.save();

    console.log(
      `✅ [CourseEnrollmentService] Cours "${course.titre}" marqué comme terminé`,
    );

    // Authoritative analytics tracking: emit course COMPLETE only after full validation succeeds
    // Use the course custom id (course.id) so analytics rollups can $lookup into cours.id
    try {
      await this.trackingService.trackComplete(
        userId,
        this.getCourseTrackingId(course),
        TrackableContentType.COURSE,
        {},
      );
    } catch (e) {
      // Tracking should not break completion
      console.error('⚠️ [CourseEnrollmentService] Failed to track course completion:', (e as any)?.message || e);
    }

    await this.syncEnrollmentTrackingProgress(userId, course, enrollment, {
      source: 'course_complete',
    });

    // Check for achievements
    if (course.communityId) {
      try {
        console.log(
          `🏆 [CourseEnrollmentService] Checking achievements for user ${userId} in community ${course.communityId}`,
        );
        await this.achievementService.checkAchievements(
          userId,
          course.communityId,
        );
      } catch (error) {
        console.error(
          `⚠️ [CourseEnrollmentService] Error checking achievements: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      message: `Cours "${course.titre}" marqué comme terminé`,
      courseId: courseId,
      totalChapters,
      completedAt: enrollment.completedAt,
    };
  }
}
