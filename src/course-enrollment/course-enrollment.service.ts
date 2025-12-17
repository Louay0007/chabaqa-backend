import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CourseEnrollment, CourseEnrollmentDocument, CourseProgress } from '../schema/course.schema';
import { Cours, CoursDocument } from '../schema/course.schema';
import { User, UserDocument } from '../schema/user.schema';
import { StartChapterDto, StartChapterResponseDto } from '../dto-cours/start-chapter.dto';
import { CompleteSectionDto, CompleteSectionResponseDto } from '../dto-cours/complete-section.dto';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class CourseEnrollmentService {
  constructor(
    @InjectModel(CourseEnrollment.name) private courseEnrollmentModel: Model<CourseEnrollmentDocument>,
    @InjectModel(Cours.name) private coursModel: Model<CoursDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Démarrer un chapitre pour un utilisateur
   */
  async startChapter(
    userId: string,
    courseId: string,
    sectionId: string,
    chapterId: string,
    startChapterDto: StartChapterDto
  ): Promise<StartChapterResponseDto> {
    console.log(`🚀 [CourseEnrollmentService] Démarrage du chapitre ${chapterId} pour l'utilisateur ${userId}`);

    // Vérifier que l'utilisateur existe
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Vérifier que le cours existe
    const course = await this.coursModel.findById(courseId);
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Vérifier que la section existe dans le cours
    const section = course.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    // Vérifier que le chapitre existe dans la section
    const chapter = section.chapitres.find(c => c.id === chapterId);
    if (!chapter) {
      throw new NotFoundException('Chapitre non trouvé dans cette section');
    }

    // Vérifier si l'utilisateur est inscrit au cours
    let enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true
    });

    if (!enrollment) {
      throw new BadRequestException('Vous devez être inscrit au cours avant de démarrer un chapitre');
    }

    // Vérifier l'accès séquentiel si activé
    if (course.sequentialProgression) {
      console.log(`🔒 [CourseEnrollmentService] Vérification de l'accès séquentiel pour le chapitre ${chapterId}`);
      
      const accessCheck = course.verifierAccesChapitre(chapterId, enrollment.progression);
      
      if (!accessCheck.hasAccess) {
        console.log(`❌ [CourseEnrollmentService] Accès refusé - ${accessCheck.reason}`);
        
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
    let progress = enrollment.progression.find(p => p.chapterId === chapterId);

    if (!progress) {
      console.log(`📊 [CourseEnrollmentService] Création d'une nouvelle progression pour le chapitre ${chapterId}`);
      
      // Créer une nouvelle progression
      progress = {
        id: new Types.ObjectId().toString(),
        enrollmentId: enrollment._id,
        chapterId: chapterId,
        isCompleted: false,
        watchTime: startChapterDto.watchTime || 0,
        lastAccessedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      enrollment.progression.push(progress);
    } else {
      console.log(`📊 [CourseEnrollmentService] Mise à jour de la progression existante pour le chapitre ${chapterId}`);
      
      // Mettre à jour la progression existante
      progress.lastAccessedAt = new Date();
      if (startChapterDto.watchTime !== undefined) {
        progress.watchTime = startChapterDto.watchTime;
      }
      progress.updatedAt = new Date();
    }

    // Sauvegarder l'inscription
    await enrollment.save();

    console.log(`✅ [CourseEnrollmentService] Chapitre ${chapterId} démarré avec succès`);

    return {
      success: true,
      message: `Chapitre "${chapter.titre}" démarré avec succès`,
      enrollmentId: enrollment.id,
      chapterId: chapterId,
      progress: {
        isCompleted: progress.isCompleted,
        watchTime: progress.watchTime,
        lastAccessedAt: progress.lastAccessedAt
      }
    };
  }

  /**
   * Obtenir la progression d'un utilisateur pour un cours
   */
  async getUserCourseProgress(userId: string, courseId: string) {
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: new Types.ObjectId(courseId),
      isActive: true
    });

    if (!enrollment) {
      return {
        isEnrolled: false,
        progress: 0,
        chaptersCompleted: 0,
        totalChapters: 0
      };
    }

    const course = await this.coursModel.findById(courseId);
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    const totalChapters = course.obtenirNombreChapitres();
    const chaptersCompleted = enrollment.progression.filter(p => p.isCompleted).length;
    const progress = totalChapters > 0 ? (chaptersCompleted / totalChapters) * 100 : 0;

    return {
      isEnrolled: true,
      progress: Math.round(progress * 100) / 100,
      chaptersCompleted,
      totalChapters,
      enrollment: {
        id: enrollment.id,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        progression: enrollment.progression
      }
    };
  }

  /**
   * Marquer un chapitre comme terminé
   */
  async completeChapter(userId: string, courseId: string, chapterId: string) {
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: new Types.ObjectId(courseId),
      isActive: true
    });

    if (!enrollment) {
      throw new NotFoundException('Inscription au cours non trouvée');
    }

    // Vérifier que le cours existe pour accéder aux propriétés de progression séquentielle
    const course = await this.coursModel.findById(courseId);
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Vérifier l'accès séquentiel si activé
    if (course.sequentialProgression) {
      console.log(`🔒 [CourseEnrollmentService] Vérification de l'accès séquentiel pour compléter le chapitre ${chapterId}`);
      
      const accessCheck = course.verifierAccesChapitre(chapterId, enrollment.progression);
      
      if (!accessCheck.hasAccess) {
        console.log(`❌ [CourseEnrollmentService] Accès refusé pour compléter - ${accessCheck.reason}`);
        
        let errorMessage = 'Vous ne pouvez pas compléter ce chapitre.';
        
        if (accessCheck.requiredChapter) {
          errorMessage = `Vous devez compléter le chapitre "${accessCheck.requiredChapter.titre}" avant de pouvoir compléter ce chapitre.`;
        }
        
        if (course.unlockMessage) {
          errorMessage = course.unlockMessage;
        }
        
        throw new BadRequestException(errorMessage);
      }
      
      console.log(`✅ [CourseEnrollmentService] Accès séquentiel autorisé pour compléter`);
    }

    const progress = enrollment.progression.find(p => p.chapterId === chapterId);
    if (!progress) {
      throw new NotFoundException('Progression pour ce chapitre non trouvée');
    }

    progress.isCompleted = true;
    progress.completedAt = new Date();
    progress.updatedAt = new Date();

    await enrollment.save();

    return {
      success: true,
      message: 'Chapitre marqué comme terminé',
      chapterId: chapterId,
      completedAt: progress.completedAt
    };
  }

  /**
   * Mettre à jour le temps de visionnage d'un chapitre
   */
  async updateWatchTime(userId: string, courseId: string, chapterId: string, watchTime: number) {
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: new Types.ObjectId(courseId),
      isActive: true
    });

    if (!enrollment) {
      throw new NotFoundException('Inscription au cours non trouvée');
    }

    const progress = enrollment.progression.find(p => p.chapterId === chapterId);
    if (!progress) {
      throw new NotFoundException('Progression pour ce chapitre non trouvée');
    }

    progress.watchTime = watchTime;
    progress.lastAccessedAt = new Date();
    progress.updatedAt = new Date();

    await enrollment.save();

    return {
      success: true,
      message: 'Temps de visionnage mis à jour',
      chapterId: chapterId,
      watchTime: progress.watchTime,
      lastAccessedAt: progress.lastAccessedAt
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
    completeSectionDto: CompleteSectionDto
  ): Promise<CompleteSectionResponseDto> {
    console.log(`📚 [CourseEnrollmentService] Marquage de la section ${sectionId} comme complète`);
    console.log(`   👤 Utilisateur: ${userId}`);
    console.log(`   📚 Cours: ${courseId}`);

    // Vérifier que l'utilisateur existe
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Vérifier que le cours existe
    const course = await this.coursModel.findOne({ id: courseId });
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Vérifier que la section existe dans le cours
    const section = course.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    // Vérifier si l'utilisateur est inscrit au cours
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true
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

    // Vérifier la progression de chaque chapitre
    const chaptersProgress = sectionChapters.map(chapter => {
      const progress = enrollment.progression.find(p => p.chapterId === chapter.id);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.titre,
        isCompleted: progress ? progress.isCompleted : false,
        progress: progress
      };
    });

    const chaptersCompleted = chaptersProgress.filter(cp => cp.isCompleted).length;
    const completionPercentage = (chaptersCompleted / totalChapters) * 100;

    console.log(`   📊 Progression de la section:`);
    console.log(`      📄 Chapitres totaux: ${totalChapters}`);
    console.log(`      ✅ Chapitres terminés: ${chaptersCompleted}`);
    console.log(`      📈 Pourcentage: ${completionPercentage.toFixed(1)}%`);

    // Vérifier si tous les chapitres sont terminés
    const allChaptersCompleted = chaptersCompleted === totalChapters;
    const forceComplete = completeSectionDto.forceComplete || false;

    if (!allChaptersCompleted && !forceComplete) {
      console.log(`   ⚠️ Section non complète - tous les chapitres doivent être terminés`);
      
      // Retourner les détails de la progression
      return {
        success: false,
        message: `Section non complète. ${chaptersCompleted}/${totalChapters} chapitres terminés.`,
        sectionId: sectionId,
        courseId: courseId,
        isCompleted: false,
        chaptersCompleted: chaptersCompleted,
        totalChapters: totalChapters,
        completionPercentage: Math.round(completionPercentage * 100) / 100
      };
    }

    // Si on force la completion ou si tous les chapitres sont terminés
    if (forceComplete && !allChaptersCompleted) {
      console.log(`   🔧 Forçage de la completion de la section`);
      
      // Marquer tous les chapitres non terminés comme terminés
      for (const chapterProgress of chaptersProgress) {
        if (!chapterProgress.isCompleted) {
          let progress = enrollment.progression.find(p => p.chapterId === chapterProgress.chapterId);
          
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
              updatedAt: new Date()
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

    console.log(`   ✅ Section "${section.titre}" marquée comme complète`);

    return {
      success: true,
      message: `Section "${section.titre}" marquée comme complète`,
      sectionId: sectionId,
      courseId: courseId,
      isCompleted: true,
      chaptersCompleted: totalChapters,
      totalChapters: totalChapters,
      completionPercentage: 100,
      completedAt: new Date()
    };
  }

  /**
   * Obtenir la progression d'une section spécifique
   */
  async getSectionProgress(userId: string, courseId: string, sectionId: string) {
    console.log(`📊 [CourseEnrollmentService] Récupération de la progression de la section ${sectionId}`);

    // Vérifier que le cours existe
    const course = await this.coursModel.findOne({ id: courseId });
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Vérifier que la section existe dans le cours
    const section = course.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    // Vérifier si l'utilisateur est inscrit au cours
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true
    });

    if (!enrollment) {
      return {
        isEnrolled: false,
        sectionId: sectionId,
        sectionTitle: section.titre,
        chaptersCompleted: 0,
        totalChapters: section.chapitres.length,
        completionPercentage: 0,
        chapters: []
      };
    }

    // Analyser la progression de chaque chapitre
    const chaptersProgress = section.chapitres.map(chapter => {
      const progress = enrollment.progression.find(p => p.chapterId === chapter.id);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.titre,
        isCompleted: progress ? progress.isCompleted : false,
        watchTime: progress ? progress.watchTime : 0,
        lastAccessedAt: progress ? progress.lastAccessedAt : null,
        completedAt: progress ? progress.completedAt : null
      };
    });

    const chaptersCompleted = chaptersProgress.filter(cp => cp.isCompleted).length;
    const totalChapters = section.chapitres.length;
    const completionPercentage = totalChapters > 0 ? (chaptersCompleted / totalChapters) * 100 : 0;

    return {
      isEnrolled: true,
      sectionId: sectionId,
      sectionTitle: section.titre,
      chaptersCompleted: chaptersCompleted,
      totalChapters: totalChapters,
      completionPercentage: Math.round(completionPercentage * 100) / 100,
      chapters: chaptersProgress
    };
  }
  /**
 * Marquer un cours comme terminé
 */
async completeCourse(userId: string, courseId: string) {
  console.log(`🎓 [CourseEnrollmentService] Marquage du cours ${courseId} comme terminé`);
  console.log(`   👤 Utilisateur: ${userId}`);

  // Vérifier que l'utilisateur est inscrit
  const enrollment = await this.courseEnrollmentModel.findOne({
    userId: new Types.ObjectId(userId),
    courseId: new Types.ObjectId(courseId),
    isActive: true
  });

  if (!enrollment) {
    throw new NotFoundException('Inscription au cours non trouvée');
  }

  // Vérifier que le cours existe
  const course = await this.coursModel.findById(courseId);
  if (!course) {
    throw new NotFoundException('Cours non trouvé');
  }

  // Récupérer tous les chapitres du cours
  const allChapters = course.sections.flatMap(section => section.chapitres);
  const totalChapters = allChapters.length;

  if (totalChapters === 0) {
    throw new BadRequestException('Ce cours ne contient aucun chapitre');
  }

  // Vérifier la progression de chaque chapitre
  for (const chapter of allChapters) {
    let progress = enrollment.progression.find(p => p.chapterId === chapter.id);

    if (!progress) {
      // Créer une nouvelle progression et marquer comme terminé
      progress = {
        id: new Types.ObjectId().toString(),
        enrollmentId: enrollment._id,
        chapterId: chapter.id,
        isCompleted: true,
        watchTime: 0,
        lastAccessedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date()
      };
      enrollment.progression.push(progress);
    } else {
      // Marquer la progression existante comme terminée
      progress.isCompleted = true;
      progress.completedAt = new Date();
      progress.updatedAt = new Date();
    }
  }

  // Marquer l'inscription comme complète
  enrollment.completedAt = new Date();
  enrollment.isActive = false;

  await enrollment.save();

  console.log(`✅ [CourseEnrollmentService] Cours "${course.titre}" marqué comme terminé`);

  return {
    success: true,
    message: `Cours "${course.titre}" marqué comme terminé`,
    courseId: courseId,
    totalChapters,
    completedAt: enrollment.completedAt
  };
}

}
