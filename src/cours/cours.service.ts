import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cours, CoursDocument, CourseEnrollment, CourseEnrollmentDocument, CourseProgress, CourseProgressDocument } from '../schema/course.schema';
import { UserCourseNote, UserCourseNoteDocument } from '../schema/user-course-note.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreateCoursDto } from '../dto-cours/create-cours.dto';
import { CreateUserNoteDto, UpdateUserNoteDto } from '../dto-cours/user-note.dto';

import { CoursResponseDto, ChapitreResponseDto } from '../dto-cours/cours-response.dto';
import { AddSectionDto } from '../dto-cours/add-section.dto';
import { AddChapitreToSectionDto } from '../dto-cours/add-chapitre-to-section.dto';
import { UpdateCoursDto, UpdateSectionDto, UpdateChapitreDto } from '../dto-cours/update-cours.dto';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { PolicyService } from '../common/services/policy.service';
import { TrackableContentType, ContentProgress, ContentProgressDocument } from '../schema/content-tracking.schema';
import { FeeService } from '../common/services/fee.service';
import { PromoService } from '../common/services/promo.service';
import { NotificationService } from '../notification/notification.service';
import { AchievementService } from '../achievement/achievement.service';
import { UploadService } from '../upload/upload.service';
import { MediaPurpose } from '../media/media.types';
import { CacheService } from '../common/services/cache.service';
import { ChapterAccessService } from '../common/services/chapter-access.service';
import { CourseSessionDto } from '../common/dto/course-session.dto';
import {
  isSupportedChapterVideoUrl,
  normalizeChapterVideoUrl,
} from './utils/chapter-video-source.util';

@Injectable()

export class CoursService {
  constructor(
    @InjectModel('Cours') private coursModel: Model<CoursDocument>,
    @InjectModel('CourseEnrollment') private courseEnrollmentModel: Model<CourseEnrollmentDocument>,
    @InjectModel('CourseProgress') private courseProgressModel: Model<CourseProgressDocument>,
    @InjectModel(UserCourseNote.name) private userCourseNoteModel: Model<UserCourseNoteDocument>,
    @InjectModel('Community') private communityModel: Model<CommunityDocument>,
    @InjectModel('User') private userModel: Model<UserDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    @InjectModel('ContentProgress') private contentProgressModel: Model<ContentProgressDocument>,
    private readonly trackingService: ContentTrackingService,
    private readonly policyService: PolicyService,
    private readonly feeService: FeeService,
    private readonly promoService: PromoService,
    private readonly notificationService: NotificationService,
    private readonly achievementService: AchievementService,
    private readonly uploadService: UploadService,
    private readonly cacheService: CacheService,
    @Optional() private readonly chapterAccessService?: ChapterAccessService,
  ) { }

  private async invalidateCourseCaches(creatorId?: string): Promise<void> {
    const patterns = ['http:/api/cours*', 'http:/api/communities*'];
    if (creatorId) {
      patterns.push(`creator-analytics:${creatorId}:*`);
    }

    await Promise.allSettled(
      patterns.map((pattern) => this.cacheService.deletePattern(pattern)),
    );
  }

  private isPaidOrderRequired(): boolean {
    return String(process.env.PAYMENTS_REQUIRE_PAID_ORDER || '').toLowerCase() === 'true';
  }

  private buildPaymentRequiredException(params: {
    contentType: TrackableContentType;
    contentId: string;
    amount: number;
    message: string;
    initEndpoint: string;
    currency?: string;
  }): HttpException {
    return new HttpException(
      {
        code: 'PAYMENT_REQUIRED',
        contentType: params.contentType,
        contentId: params.contentId,
        amount: params.amount,
        currency: params.currency || 'TND',
        initEndpoint: params.initEndpoint,
        message: params.message,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private async resolveCourseDocument(courseId: string): Promise<CoursDocument> {
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(courseId)) {
      cours = await this.coursModel.findById(courseId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: courseId });
    }
    if (!cours) {
      throw new NotFoundException('Cours non trouvé');
    }
    return cours;
  }

  private resolvePaidChapterPrice(
    chapterInput: { isPaid?: boolean; prix?: number },
    coursePrice: number,
  ): number {
    const isPaid = Boolean(chapterInput?.isPaid);
    if (!isPaid) return 0;

    const explicitPrice = Number(chapterInput?.prix);
    if (Number.isFinite(explicitPrice) && explicitPrice > 0) {
      return explicitPrice;
    }

    const fallbackCoursePrice = Number(coursePrice || 0);
    if (Number.isFinite(fallbackCoursePrice) && fallbackCoursePrice > 0) {
      return fallbackCoursePrice;
    }

    throw new BadRequestException(
      'Le prix du chapitre payant est requis (ou le cours doit avoir un prix > 0)',
    );
  }

  private normalizeChapterContent(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private assertChapterHasContentOrVideo(
    description: unknown,
    videoUrl: unknown,
  ): void {
    const normalizedDescription = this.normalizeChapterContent(description);
    const normalizedVideoUrl = normalizeChapterVideoUrl(videoUrl);

    if (!normalizedDescription && !normalizedVideoUrl) {
      throw new BadRequestException(
        'Un chapitre doit contenir une description ou une URL vidéo.',
      );
    }
  }

  private assertSupportedChapterVideoSource(url: string): void {
    if (!isSupportedChapterVideoUrl(url)) {
      throw new BadRequestException(
        "URL video invalide. Utilisez un lien YouTube ou une URL d'upload /uploads/.",
      );
    }
  }

  private isTransactionNotSupportedError(error: any): boolean {
    const message = String(
      error?.errorResponse?.errmsg ||
      error?.message ||
      error?.cause?.errorResponse?.errmsg ||
      error?.cause?.message ||
      '',
    ).toLowerCase();
    const code =
      error?.code ??
      error?.errorResponse?.code ??
      error?.cause?.code ??
      error?.cause?.errorResponse?.code;
    const codeName = String(
      error?.codeName ||
      error?.errorResponse?.codeName ||
      error?.cause?.codeName ||
      error?.cause?.errorResponse?.codeName ||
      '',
    ).toLowerCase();

    return (
      code === 20 ||
      codeName === 'illegaloperation' ||
      message.includes('transaction numbers are only allowed on a replica set member or mongos')
    );
  }

  private resolveChapterVideoUrlForCreate(rawVideoUrl: unknown): string {
    const normalizedVideoUrl = normalizeChapterVideoUrl(rawVideoUrl);
    if (!normalizedVideoUrl) return '';

    this.assertSupportedChapterVideoSource(normalizedVideoUrl);
    return normalizedVideoUrl;
  }

  private resolveChapterVideoUrlForUpdate(
    existingVideoUrl: unknown,
    incomingVideoUrl: unknown,
  ): string {
    const currentVideoUrl = normalizeChapterVideoUrl(existingVideoUrl);
    const nextVideoUrl = normalizeChapterVideoUrl(incomingVideoUrl);

    if (!nextVideoUrl) {
      return '';
    }

    if (nextVideoUrl !== currentVideoUrl) {
      this.assertSupportedChapterVideoSource(nextVideoUrl);
    }

    return nextVideoUrl;
  }

  private async hasPaidChapterOrder(
    userId: string,
    chapterId: string,
  ): Promise<boolean> {
    const paidOrder = await this.orderModel
      .findOne({
        buyerId: new Types.ObjectId(userId),
        contentType: { $in: [TrackableContentType.CHAPTER, 'chapter'] },
        contentId: chapterId,
        status: 'paid',
      })
      .lean()
      .exec();
    return Boolean(paidOrder);
  }

  private buildCommunityLookupConditions(communityIds: string[]): any[] {
    return communityIds
      .flatMap((communityId) => [
        { _id: Types.ObjectId.isValid(communityId) ? new Types.ObjectId(communityId) : null },
        { id: communityId },
        { slug: communityId },
      ])
      .filter((condition) => Object.values(condition)[0] !== null);
  }

  private async resolveCommunitiesByKeys(
    communityIds: string[],
  ): Promise<Map<string, CommunityDocument | null>> {
    const keys = [...new Set((communityIds || []).map((value) => String(value || '')).filter(Boolean))];
    const map = new Map<string, CommunityDocument | null>();
    if (keys.length === 0) return map;

    const communities = await this.communityModel.find({
      $or: this.buildCommunityLookupConditions(keys),
    });

    for (const key of keys) {
      const match = communities.find((community: any) =>
        community?._id?.toString() === key ||
        String((community as any)?.id || '') === key ||
        String(community?.slug || '') === key,
      );
      map.set(key, match || null);
    }

    return map;
  }

  private async hasPaidChapterEntitlement(
    userId: string,
    chapterId: string,
    enrollment?: CourseEnrollmentDocument | null,
  ): Promise<boolean> {
    if (Array.isArray(enrollment?.purchasedChapterIds)) {
      const purchasedSet = new Set(
        enrollment.purchasedChapterIds
          .map((value) => String(value))
          .filter(Boolean),
      );
      if (purchasedSet.has(chapterId)) {
        return true;
      }
    }

    const hasPaidOrder = await this.hasPaidChapterOrder(userId, chapterId);
    if (!hasPaidOrder) {
      return false;
    }

    // Self-heal legacy enrollments: if paid order exists but chapter entitlement was never persisted,
    // persist it now so chapter access remains unlocked across reloads.
    if (enrollment) {
      const purchasedSet = new Set(
        (Array.isArray(enrollment.purchasedChapterIds)
          ? enrollment.purchasedChapterIds
          : []
        )
          .map((value) => String(value))
          .filter(Boolean),
      );

      if (!purchasedSet.has(chapterId)) {
        purchasedSet.add(chapterId);
        enrollment.purchasedChapterIds = Array.from(purchasedSet);
        await enrollment.save();
      }
    }

    return true;
  }

  async ensureChapterPurchasedEntitlement(
    userId: string,
    courseIdOrDoc: string | CoursDocument,
    chapterId: string,
    session?: any,
  ): Promise<{ enrollmentId: string; granted: boolean }> {
    const course =
      typeof courseIdOrDoc === 'string'
        ? await this.resolveCourseDocument(courseIdOrDoc)
        : courseIdOrDoc;

    const userObjectId = new Types.ObjectId(userId);
    let enrollment = await this.courseEnrollmentModel
      .findOne({
        userId: userObjectId,
        courseId: course._id,
        isActive: true,
      })
      .session(session || null);

    if (!enrollment) {
      const created = await this.inscrireAuCours(
        course.id || course._id.toString(),
        userId,
        undefined,
        session,
      );
      enrollment = await this.courseEnrollmentModel
        .findOne({
          userId: userObjectId,
          courseId: course._id,
          isActive: true,
        })
        .session(session || null);

      if (!enrollment) {
        throw new BadRequestException(
          `Inscription introuvable après création pour le cours ${created?.enrollment?.courseId || course.id}`,
        );
      }
    }

    const alreadyPurchased = Array.isArray(enrollment.purchasedChapterIds)
      ? enrollment.purchasedChapterIds.includes(chapterId)
      : false;
    if (alreadyPurchased) {
      return { enrollmentId: enrollment.id, granted: false };
    }

    enrollment.purchasedChapterIds = [
      ...(Array.isArray(enrollment.purchasedChapterIds)
        ? enrollment.purchasedChapterIds
        : []),
      chapterId,
    ];
    await enrollment.save({ session });

    return { enrollmentId: enrollment.id, granted: true };
  }

  private async attachRatingStatsToCourses(
    coursDocs: CoursDocument[],
  ): Promise<void> {
    if (!coursDocs?.length) return;

    // Use MongoDB _id as the primary key for matching (ContentProgress.contentId stores MongoDB _id as string)
    const mongoIds = Array.from(
      new Set(
        coursDocs
          .map((c) => c?._id?.toString?.())
          .filter(Boolean),
      ),
    ) as string[];

    if (!mongoIds.length) return;

    console.log(`📊 [attachRatingStatsToCourses] Fetching ratings for ${mongoIds.length} courses`);

    const stats = await this.contentProgressModel
      .aggregate([
        {
          $match: {
            contentType: TrackableContentType.COURSE,
            contentId: { $in: mongoIds },
            rating: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: '$contentId',
            averageRating: { $avg: '$rating' },
            ratingCount: { $sum: 1 },
          },
        },
      ])
      .exec();

    console.log(`📊 [attachRatingStatsToCourses] Found ratings for ${stats.length} courses`);

    const map = new Map<string, { averageRating: number; ratingCount: number }>(
      (stats || []).map((s: any) => {
        const contentId = String(s._id);
        return [
          contentId,
          {
            averageRating: Number(s.averageRating || 0),
            ratingCount: Number(s.ratingCount || 0),
          },
        ];
      }),
    );

    // Patch docs in-memory for response - always use MongoDB _id for matching
    for (const c of coursDocs) {
      const mongoKey = c?._id?.toString?.();
      if (!mongoKey) continue;

      const stat = map.get(mongoKey);
      if (stat) {
        (c as any).averageRating = stat.averageRating;
        (c as any).ratingCount = stat.ratingCount;
        console.log(`✅ [attachRatingStatsToCourses] Course ${mongoKey}: rating=${stat.averageRating}, count=${stat.ratingCount}`);
      } else {
        // If no ratings found, ensure we use the stored values or default to 0
        if ((c as any).averageRating === undefined) {
          (c as any).averageRating = 0;
        }
        if ((c as any).ratingCount === undefined) {
          (c as any).ratingCount = 0;
        }
      }
    }

    // Best-effort persist to DB for fast future lists
    try {
      const ops = coursDocs
        .map((c) => {
          const key = c?._id?.toString?.();
          const stat = key ? map.get(key) : undefined;
          if (!key || !stat) return null;
          return {
            updateOne: {
              filter: { _id: new Types.ObjectId(key) },
              update: {
                $set: {
                  averageRating: stat.averageRating,
                  ratingCount: stat.ratingCount,
                },
              },
            },
          };
        })
        .filter(Boolean) as any[];

      if (ops.length) {
        await this.coursModel.bulkWrite(ops, { ordered: false });
        console.log(`💾 [attachRatingStatsToCourses] Persisted ratings for ${ops.length} courses`);
      }
    } catch (e) {
      // Do not fail the request if bulkWrite fails
      console.warn('⚠️ [CoursService] bulkWrite rating stats failed:', (e as any)?.message || e);
    }
  }

  async getCourses(page: number = 1, limit: number = 10, category?: string, niveau?: string, search?: string) {
    const query: any = { isPublished: true };

    if (category) {
      query.category = category;
    }

    if (niveau) {
      query.niveau = niveau;
    }

    if (search) {
      query.$or = [
        { titre: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.coursModel
        .find(query)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .populate('communityId', 'name slug')
        .select('-sections -learningObjectives -requirements')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.coursModel.countDocuments(query)
    ]);

    await this.attachRatingStatsToCourses(courses as any);

    const courseObjectIds = courses
      .map((course) => course?._id)
      .filter(Boolean);
    const enrollmentStats = courseObjectIds.length
      ? await this.courseEnrollmentModel
          .aggregate([
            {
              $match: {
                courseId: { $in: courseObjectIds },
                isActive: true,
              },
            },
            {
              $group: {
                _id: '$courseId',
                count: { $sum: 1 },
              },
            },
          ])
          .exec()
      : [];
    const enrollmentCountByCourseId = new Map<string, number>(
      (enrollmentStats || []).map((stat: any) => [
        String(stat?._id),
        Number(stat?.count || 0),
      ]),
    );

    // Log rating data after attachment for debugging
    if (courses.length > 0) {
      const sampleCourse = courses[0] as any;
      console.log(`   ⭐ [getCourses] Sample course after attachRatingStats:`, {
        courseId: sampleCourse._id?.toString(),
        titre: sampleCourse.titre,
        averageRating: sampleCourse.averageRating,
        ratingCount: sampleCourse.ratingCount,
      });
    }

    const transformedCourses = courses.map(course => {
      // Use attached rating values (from ContentProgress aggregation) if available
      // These are set by attachRatingStatsToCourses and are always fresh
      const attachedRating = (course as any).averageRating;
      const attachedCount = (course as any).ratingCount;

      const finalRating = attachedRating !== undefined ? Number(attachedRating) : Number(course.averageRating || 0);
      const finalCount = attachedCount !== undefined ? Number(attachedCount) : Number(course.ratingCount || 0);
      const enrollmentCount =
        enrollmentCountByCourseId.get(course._id.toString()) ??
        (Array.isArray((course as any).inscriptions)
          ? (course as any).inscriptions.length
          : 0);

      const community = (course as any).communityId;

      return {
        id: course._id.toString(),
        titre: course.titre,
        description: course.description,
        prix: course.prix,
        devise: course.devise,
        category: course.category,
        niveau: course.niveau,
        duree: course.duree,
        enrollmentCount,
        averageRating: finalRating,
        ratingCount: finalCount,
        communityName: community?.name || 'Unknown Community',
        communitySlug: community?.slug || course._id.toString(),
        creator: {
          name: (course.creatorId as any)?.name || 'Unknown',
          avatar: this.uploadService.ensureAbsoluteUrl((course.creatorId as any)?.profile_picture || (course.creatorId as any)?.photo_profil) || 'https://placehold.co/64x64?text=MM'
        },
        createdAt: course.createdAt,
        image: this.uploadService.ensureAbsoluteUrl(course.thumbnail) || 'https://placehold.co/400x300?text=Course',
        thumbnail: this.uploadService.ensureAbsoluteUrl(course.thumbnail) || 'https://placehold.co/400x300?text=Course'
      };
    });

    return {
      success: true,
      message: 'Cours récupérés avec succès',
      data: {
        courses: transformedCourses,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  /**
   * Vérifie si un utilisateur est admin d'une communauté
   * @param userId - L'ObjectId de l'utilisateur (string)
   * @param communityIdentifier - Le slug OU l'ObjectId de la communauté
   */
  private async verifierAdminCommunaute(userId: string, communityIdentifier: string): Promise<CommunityDocument> {
    console.log('🔍 DEBUG - verifierAdminCommunaute:');
    console.log('   userId:', userId, 'type:', typeof userId);
    console.log('   communityIdentifier:', communityIdentifier);

    // ÉTAPE 1: Trouver la communauté (par slug OU par _id)
    let community: CommunityDocument | null = null;

    if (Types.ObjectId.isValid(communityIdentifier)) {
      console.log('   → Recherche par _id (ObjectId valide)');
      community = await this.communityModel.findById(communityIdentifier);
    } else {
      console.log('   → Recherche par slug');
      community = await this.communityModel.findOne({ slug: communityIdentifier });
    }

    if (!community) {
      console.log('❌ DEBUG - Communauté non trouvée pour:', communityIdentifier);
      throw new NotFoundException('Communauté introuvable');
    }

    console.log('✅ DEBUG - Communauté trouvée:');
    console.log('   ID:', community._id.toString());
    console.log('   Nom:', community.name);
    console.log('   Slug:', community.slug);
    console.log('   Créateur ID:', community.createur?.toString());
    console.log('   Admins IDs:', community.admins?.map(id => id.toString()));

    // ÉTAPE 2: Convertir l'userId en ObjectId
    let userObjectId: Types.ObjectId;
    try {
      userObjectId = new Types.ObjectId(userId);
      console.log('   User ObjectId:', userObjectId.toString());
    } catch (error) {
      console.log('❌ DEBUG - Erreur conversion userId:', error.message);
      throw new BadRequestException('Format userId invalide');
    }

    // ÉTAPE 3: Vérifier les permissions dans CETTE communauté spécifique
    const estCreateur = community.createur?.equals(userObjectId);
    const estAdmin = community.admins?.some(adminId => adminId.equals(userObjectId));

    console.log('   → Est créateur:', estCreateur);
    console.log('   → Est admin:', estAdmin);

    // Debug comparaison des ObjectIds
    console.log('   → Comparaison détaillée:');
    console.log('     Créateur BD:', community.createur?.toString());
    console.log('     User actuel:', userObjectId.toString());
    console.log('     Match créateur:', community.createur?.toString() === userObjectId.toString());

    if (!estCreateur && !estAdmin) {
      console.log('❌ DEBUG - Utilisateur NON AUTORISÉ pour cette communauté');
      console.log('   Community ID:', community._id.toString());
      console.log('   Community slug:', community.slug);
      throw new ForbiddenException('Seuls les administrateurs de la communauté peuvent effectuer cette action');
    }

    console.log('✅ DEBUG - Utilisateur AUTORISÉ pour cette communauté');
    return community;
  }

  /**
   * Vérifie si un utilisateur est membre (ou admin) d'une communauté
   */
  private async verifierMembreCommunaute(userId: string, communitySlug: string): Promise<CommunityDocument> {
    const community = await this.communityModel.findOne({ slug: communitySlug });

    if (!community) {
      throw new NotFoundException('Communauté introuvable');
    }

    const userObjectId = new Types.ObjectId(userId);

    // Vérifier si l'utilisateur est le créateur, admin ou membre de la communauté
    const estCreateur = community.createur.equals(userObjectId);
    const estAdmin = community.admins.some(adminId => adminId.equals(userObjectId));
    const estMembre = community.members.some(memberId => memberId.equals(userObjectId));

    if (!estCreateur && !estAdmin && !estMembre) {
      throw new ForbiddenException('Seuls les membres de la communauté peuvent accéder à cette ressource');
    }

    return community;
  }

  /**
   * Créer un nouveau cours avec ses chapitres
   */
  async creerCours(createCoursDto: CreateCoursDto, userId: string): Promise<CoursResponseDto> {
    console.log('🚀 Création de cours avec sections');
    console.log('   userId:', userId);
    console.log('   Titre:', createCoursDto.titre);
    console.log('   DTO complet:', JSON.stringify(createCoursDto, null, 2));

    // Validation de sécurité
    if (!createCoursDto.sections) {
      console.log('⚠️ Aucune section fournie, initialisation avec tableau vide');
      createCoursDto.sections = [];
    }

    console.log('   Sections:', createCoursDto.sections.length);

    // Vérifier les permissions d'admin
    const community = await this.verifierAdminCommunaute(userId, createCoursDto.communitySlug);

    // Policy: limiter l'activation/création de cours par plan (count cours de ce créateur)
    const activeCoursesCount = await this.coursModel.countDocuments({ creatorId: new Types.ObjectId(userId) });
    const canCreate = await this.policyService.canActivateMoreCourses(userId, activeCoursesCount);
    if (!canCreate) {
      throw new ForbiddenException('Limite de cours atteinte pour votre plan. Veuillez mettre à niveau.');
    }

    // Vérifier que l'utilisateur existe
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Générer un ID unique pour le cours
    const coursId = new Types.ObjectId().toString();

    // Créer le cours avec le nouveau schéma  
    const nouveauCours = new this.coursModel({
      id: coursId,
      titre: createCoursDto.titre,
      description: createCoursDto.description,
      thumbnail: createCoursDto.thumbnail,
      prix: createCoursDto.prix,
      isPaidCourse: createCoursDto.prix > 0, // Auto-détermine si le cours est payant
      devise: createCoursDto.devise || 'TND',
      communityId: community._id.toString(),
      creatorId: new Types.ObjectId(userId),
      isPublished: createCoursDto.isPublished || false,
      category: createCoursDto.category,
      niveau: createCoursDto.niveau,
      duree: createCoursDto.duree,
      learningObjectives: createCoursDto.learningObjectives || [],
      requirements: createCoursDto.requirements || [],
      notes: createCoursDto.notes,
      sections: [], // Sera rempli avec les sections
      inscriptions: [],
      ressources: []
    });

    // Sauvegarder le cours
    const coursEnregistre = await nouveauCours.save();

    // Utiliser la méthode utilitaire pour convertir la durée

    // Créer les sections et chapitres directement
    console.log(`🏗️ Création directe de ${createCoursDto.sections.length} sections`);

    const sectionsCompletes = createCoursDto.sections.map((sectionDto, sectionIndex) => {
      console.log(`📁 Section ${sectionIndex + 1}: "${sectionDto.titre}" avec ${sectionDto.chapitres.length} chapitres`);

      // Créer tous les chapitres de cette section
      const chapitresSection = sectionDto.chapitres.map((chapitreDto, chapitreIndex) => {
        console.log(`   📄 Chapitre ${chapitreIndex + 1}: "${chapitreDto.titre}"`);
        console.log(`      🎬 Video URL received: "${chapitreDto.videoUrl || '(empty)'}"`);

        const normalizedContent = this.normalizeChapterContent(chapitreDto.description);
        const normalizedVideoUrl = this.resolveChapterVideoUrlForCreate(chapitreDto.videoUrl);
        this.assertChapterHasContentOrVideo(normalizedContent, normalizedVideoUrl);

        const dureeCalculee = chapitreDto.duree
          ? this.convertirDureeEnMinutes(chapitreDto.duree)
          : (normalizedVideoUrl ? 5 : 0); // Default 5 minutes for videos, 0 for text

        const chapter = {
          id: new Types.ObjectId().toString(),
          titre: chapitreDto.titre,
          contenu: normalizedContent,
          videoUrl: normalizedVideoUrl,
          isPreview: !chapitreDto.isPaid,
          ordre: chapitreDto.ordre,
          duree: dureeCalculee,
          prix: this.resolvePaidChapterPrice(
            { isPaid: chapitreDto.isPaid, prix: chapitreDto.prix },
            coursEnregistre.prix,
          ),
          isPaidChapter: chapitreDto.isPaid,
          notes: chapitreDto.notes || '',
          ressources: [],
          sectionId: '', // Sera défini après
          createdAt: new Date()
        };
        
        console.log(`      💾 Stored video URL: "${chapter.videoUrl}"`);
        return chapter;
      });

      // Créer la section avec ses chapitres
      const sectionId = new Types.ObjectId().toString();

      // Assigner l'ID de la section à tous ses chapitres
      chapitresSection.forEach(chapitre => {
        chapitre.sectionId = sectionId;
      });

      return {
        id: sectionId,
        titre: sectionDto.titre,
        description: sectionDto.description || '',
        courseId: coursEnregistre.id,
        ordre: sectionDto.ordre,
        chapitres: chapitresSection,
        createdAt: new Date()
      };
    });

    // Assigner toutes les sections au cours
    coursEnregistre.sections = sectionsCompletes;

    // Sauvegarder avec toutes les sections et chapitres
    await coursEnregistre.save();

    console.log('✅ Résultat final:');
    console.log(`   📚 Cours: "${coursEnregistre.titre}"`);
    console.log(`   📁 ${coursEnregistre.sections.length} sections créées`);
    coursEnregistre.sections.forEach((section, i) => {
      console.log(`      Section ${i + 1}: "${section.titre}" → ${section.chapitres.length} chapitres`);
      section.chapitres.forEach((chapitre, j) => {
        console.log(`         📄 ${j + 1}. "${chapitre.titre}"`);
      });
    });

    // Ajouter le cours à la communauté
    community.ajouterCours(coursEnregistre._id);
    await community.save();
    await this.invalidateCourseCaches(coursEnregistre.creatorId?.toString?.());

    return await this.transformerEnReponse(coursEnregistre);
  }



  /**
   * Obtenir un cours par ID
   */
  async obtenirCours(coursId: string, userId?: string): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - obtenirCours');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   👤 User ID: ${userId}`);

    let cours: CoursDocument | null = null;

    // Essayer de trouver par _id (MongoDB ID)
    if (Types.ObjectId.isValid(coursId)) {
      cours = await this.coursModel.findById(coursId)
        .populate('creatorId', 'name email profile_picture photo_profil bio')
        .exec();
    }

    // Si non trouvé, essayer de trouver par le champ 'id' personnalisé
    if (!cours) {
      console.log(`   ⚠️ Non trouvé par _id, recherche par champ 'id': ${coursId}`);
      cours = await this.coursModel.findOne({ id: coursId })
        .populate('creatorId', 'name email profile_picture photo_profil bio')
        .exec();
    }

    if (!cours) {
      console.log('   ❌ Cours non trouvé (ni par _id ni par id)');
      throw new NotFoundException('Cours introuvable');
    }

    console.log(`   ✅ Cours trouvé: ${cours.titre}`);
    console.log(`   🏢 Community ID: ${cours.communityId}`);
    console.log(`   📊 Sections: ${cours.sections?.length || 0}`);

    // Si un userId est fourni, vérifier que l'utilisateur est membre de la communauté
    if (userId) {
      // Récupérer la communauté pour obtenir son slug
      const community = await this.communityModel.findById(cours.communityId);
      if (!community) {
        throw new NotFoundException('Communauté du cours introuvable');
      }
      await this.verifierMembreCommunaute(userId, community.slug);
      console.log('   ✅ Utilisateur autorisé');
    }

    // Attach rating stats
    await this.attachRatingStatsToCourses([cours]);

    return await this.transformerEnReponse(cours);
  }

  /**
   * Obtenir tous les cours d'une communauté
   */
  async obtenirCoursParCommunaute(
    communitySlug: string,
    page: number = 1,
    limit: number = 10,
    seulementsPublies: boolean = true,
    userId?: string
  ) {
    const skip = (page - 1) * limit;

    console.log('🔧 DEBUG - obtenirCoursParCommunaute');
    console.log(`   🏢 Community Slug: ${communitySlug}`);
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📄 Page: ${page}, Limit: ${limit}`);
    console.log(`   📢 Seulement publiés: ${seulementsPublies}`);

    // 1. Récupérer la communauté par son slug pour obtenir son ID
    const community = await this.communityModel.findOne({ slug: communitySlug });
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    console.log(`   ✅ Communauté trouvée: ${community.name}`);
    console.log(`   🆔 Community ID: ${community._id}`);

    // 2. Si un userId est fourni, vérifier que l'utilisateur est membre de la communauté
    if (userId) {
      await this.verifierMembreCommunaute(userId, community.slug);
    }

    // 3. Construire les filtres avec l'ID de la communauté
    const filtres: any = { communityId: community._id.toString() };
    if (seulementsPublies) {
      filtres.isPublished = true;
    }

    console.log('   🔍 Filtres appliqués:', filtres);

    const [cours, total] = await Promise.all([
      this.coursModel
        .find(filtres)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.coursModel.countDocuments(filtres)
    ]);

    console.log(`   📊 Cours trouvés: ${cours.length}/${total}`);

    await this.attachRatingStatsToCourses(cours as any);

    return {
      cours: await Promise.all(cours.map(cours => this.transformerEnReponse(cours))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Obtenir les cours créés par un utilisateur
   */
  async obtenirCoursParCreateur(creatorId: string, page: number = 1, limit: number = 10, communityId?: string) {
    const skip = (page - 1) * limit;

    console.log('🔧 DEBUG - obtenirCoursParCreateur');
    console.log(`   👤 Creator ID: ${creatorId}`);
    console.log(`   📄 Page: ${page}, Limit: ${limit}`);
    if (communityId) {
      console.log(`   🏢 Community filter: ${communityId}`);
    }

    const baseFilter: any = { creatorId: new Types.ObjectId(creatorId) };
    if (communityId) {
      // Accept either ObjectId or string id
      baseFilter.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId).toString()
        : communityId;
    }

    const [cours, total] = await Promise.all([
      this.coursModel
        .find(baseFilter)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.coursModel.countDocuments(baseFilter)
    ]);

    console.log(`   📊 Cours trouvés: ${cours.length}/${total}`);

    await this.attachRatingStatsToCourses(cours as any);

    return {
      cours: await Promise.all(cours.map(cours => this.transformerEnReponse(cours))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Obtenir les cours auxquels un utilisateur est inscrit
   */
  async obtenirCoursInscrit(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    console.log('🔧 DEBUG - obtenirCoursInscrit');
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📄 Page: ${page}, Limit: ${limit}`);

    // 1. Trouver toutes les inscriptions de l'utilisateur
    const [inscriptions, totalInscriptions] = await Promise.all([
      this.courseEnrollmentModel
        .find({ userId: new Types.ObjectId(userId), isActive: true })
        .populate({
          path: 'courseId',
          populate: {
            path: 'creatorId',
            select: 'name email profile_picture'
          }
        })
        .sort({ enrolledAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.courseEnrollmentModel.countDocuments({ userId: new Types.ObjectId(userId), isActive: true })
    ]);

    console.log(`   📊 Inscriptions trouvées: ${inscriptions.length}/${totalInscriptions}`);

    // 2. Extraire les cours depuis les inscriptions
    const cours = inscriptions
      .filter(inscription => inscription.courseId) // Filtrer les inscriptions avec cours valides
      .map(inscription => inscription.courseId as any);

    await this.attachRatingStatsToCourses(cours as any);

    return {
      cours: await Promise.all(cours.map(cours => this.transformerEnReponse(cours))),
      total: totalInscriptions,
      page,
      limit,
      totalPages: Math.ceil(totalInscriptions / limit)
    };
  }

  /**
   * Obtenir les cours d'un utilisateur (inscrits + créés)
   */
  async obtenirCoursParUtilisateur(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type: 'enrolled' | 'created' | 'all' = 'all',
    visibilityScope: 'owner' | 'public' = 'owner',
  ) {
    console.log('🔧 DEBUG - obtenirCoursParUtilisateur');
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📄 Page: ${page}, Limit: ${limit}, Type: ${type}, Scope: ${visibilityScope}`);

    const skip = (page - 1) * limit;
    let allCourses: any[] = [];
    let totalCount = 0;
    const isOwnerView = visibilityScope === 'owner';

    // Get enrolled courses
    if (isOwnerView && (type === 'enrolled' || type === 'all')) {
      const enrollments = await this.courseEnrollmentModel
        .find({ userId: new Types.ObjectId(userId), isActive: true })
        .populate({
          path: 'courseId',
          populate: {
            path: 'creatorId',
            select: 'name email profile_picture'
          }
        })
        .sort({ enrolledAt: -1 })
        .exec();

      const enrolledCourses = enrollments
        .filter(enrollment => enrollment.courseId)
        .map(enrollment => {
          const course = enrollment.courseId as any;
          // Calculate progress
          const totalChapters = course.sections?.reduce((acc: number, section: any) =>
            acc + (section.chapitres?.length || 0), 0) || 0;
          const completedChapters = enrollment.progression?.filter((p: any) => p.isCompleted).length || 0;
          const progress = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

          // Unified Tracking Sync: ensure course progress is reflected globally without emitting START actions.
          const trackingCourseId = String(course.id || course._id);
          this.trackingService.syncProgressSnapshot(
            userId,
            trackingCourseId,
            TrackableContentType.COURSE,
            {
              progressPercent: progress,
              isCompleted: totalChapters > 0 && completedChapters >= totalChapters,
              metadata: { completedChapters, totalChapters },
            },
          ).catch(err => console.error('⚠️ [COURS-SERVICE] Sync failed:', err.message));

          return {
            id: course._id.toString(),
            titre: course.titre,
            description: course.description,
            thumbnail: course.thumbnail || 'https://placehold.co/400x300?text=Course',
            communityId: String(course.communityId || ''),
            progress,
            status: progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started',
            type: 'enrolled',
            enrolledAt: enrollment.enrolledAt,
            creator: {
              name: course.creatorId?.name || 'Unknown',
              avatar: course.creatorId?.profile_picture || 'https://placehold.co/64x64?text=MM'
            }
          };
        });

      allCourses = [...allCourses, ...enrolledCourses];
    }

    // Get created courses
    if (type === 'created' || type === 'all') {
      const createdCourseQuery: any = { creatorId: new Types.ObjectId(userId) };
      if (!isOwnerView) {
        createdCourseQuery.isPublished = true;
      }

      const createdCourses = await this.coursModel
        .find(createdCourseQuery)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .exec();

      const transformedCreated = createdCourses.map(course => ({
        id: course._id.toString(),
        titre: course.titre,
        description: course.description,
        thumbnail: course.thumbnail || 'https://placehold.co/400x300?text=Course',
        communityId: String(course.communityId || ''),
        progress: 100, // Creator has full access
        status: course.isPublished ? 'published' : 'draft',
        type: 'created',
        createdAt: course.createdAt,
        creator: {
          name: (course.creatorId as any)?.name || 'Unknown',
          avatar: (course.creatorId as any)?.profile_picture || 'https://placehold.co/64x64?text=MM'
        }
      }));

      allCourses = [...allCourses, ...transformedCreated];
    }

    const communityMap = await this.resolveCommunitiesByKeys(
      allCourses.map((course) => String(course.communityId || '')).filter(Boolean),
    );
    allCourses = allCourses.map((course) => {
      const community = communityMap.get(String(course.communityId || '')) || null;
      const communitySlug = community?.slug || null;
      return {
        ...course,
        community: community
          ? {
              id: String((community as any).id || community._id?.toString() || ''),
              name: community.name,
              slug: community.slug,
            }
          : null,
        communityName: community?.name || null,
        communitySlug,
        slug: communitySlug,
      };
    });

    // Sort by most recent activity
    allCourses.sort((a, b) => {
      const dateA = new Date(a.enrolledAt || a.createdAt || 0);
      const dateB = new Date(b.enrolledAt || b.createdAt || 0);
      return dateB.getTime() - dateA.getTime();
    });

    totalCount = allCourses.length;
    const paginatedCourses = allCourses.slice(skip, skip + limit);

    console.log(`   📊 Total courses found: ${totalCount}`);
    console.log(`   📄 Returning: ${paginatedCourses.length} courses`);

    return {
      success: true,
      message: 'User courses retrieved successfully',
      data: {
        courses: paginatedCourses,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    };
  }

  /**
   * Publier/dépublier un cours
   */
  async updateCours(coursId: string, dto: UpdateCoursDto, userId: string): Promise<CoursResponseDto> {
    const cours = await this.coursModel.findById(coursId);
    if (!cours) {
      throw new NotFoundException('Cours introuvable');
    }

    await this.verifierAdminCommunaute(userId, cours.communityId);

    if (dto.titre !== undefined) {
      cours.titre = dto.titre;
    }
    if (dto.description !== undefined) {
      cours.description = dto.description;
    }
    if (dto.thumbnail !== undefined) {
      cours.thumbnail = dto.thumbnail;
    }
    if (dto.devise !== undefined) {
      cours.devise = dto.devise;
    }
    if (dto.category !== undefined) {
      cours.category = dto.category;
    }
    if (dto.niveau !== undefined) {
      cours.niveau = dto.niveau;
    }
    if (dto.duree !== undefined) {
      cours.duree = dto.duree;
    }
    if (dto.learningObjectives !== undefined) {
      cours.learningObjectives = dto.learningObjectives;
    }
    if (dto.requirements !== undefined) {
      cours.requirements = dto.requirements;
    }
    if (dto.notes !== undefined) {
      cours.notes = dto.notes;
    }
    if (dto.prix !== undefined) {
      cours.prix = dto.prix;
    }
    if (dto.isPublished !== undefined) {
      cours.isPublished = dto.isPublished;
    }

    const saved = await cours.save();
    await this.invalidateCourseCaches(cours.creatorId?.toString?.());
    return await this.transformerEnReponse(saved);
  }

  async togglePublication(coursId: string, userId: string): Promise<CoursResponseDto> {
    const cours = await this.coursModel.findById(coursId);
    if (!cours) {
      throw new NotFoundException('Cours introuvable');
    }

    // Vérifier les permissions
    const community = await this.verifierAdminCommunaute(userId, cours.communityId);

    cours.togglePublication();
    await cours.save();
    await this.invalidateCourseCaches(cours.creatorId?.toString?.());

    // Send notification to community members when a course is published
    if (cours.isPublished) {
      const members = await this.userModel.find({ _id: { $in: community.members } });
      for (const member of members) {
        if (member._id.toString() !== userId) { // Don't notify the user who published the course
          this.notificationService.createNotification({
            recipient: member._id.toString(),
            type: 'new_course',
            title: 'New Course Published',
            body: `A new course "${cours.titre}" has been published in your community "${community.name}"`,
            data: { courseId: cours._id.toString(), communityId: community._id.toString() },
          });
        }
      }
    }

    return await this.transformerEnReponse(cours);
  }

  /**
   * Supprimer un cours
   */
  async supprimerCours(coursId: string, userId: string): Promise<{ message: string }> {
    const cours = await this.coursModel.findById(coursId);
    if (!cours) {
      throw new NotFoundException('Cours introuvable');
    }

    // Vérifier les permissions
    const community = await this.verifierAdminCommunaute(userId, cours.communityId);

    // Supprimer le cours de la communauté
    community.supprimerCours(cours._id);
    await community.save();

    // Supprimer le cours
    await this.coursModel.findByIdAndDelete(coursId);
    await this.invalidateCourseCaches(cours.creatorId?.toString?.());

    return {
      message: 'Cours supprimé avec succès'
    }

  }

  /**
   * Créer les sections et chapitres du cours
   */
  private async _creerSectionsEtChapitres(cours: CoursDocument, sections: any[]): Promise<void> {
    console.log('🚨🚨🚨 DEBUT _creerSectionsEtChapitres 🚨🚨🚨');
    console.log(`🏗️ Création de ${sections.length} sections`);
    console.log('📋 Sections reçues:', JSON.stringify(sections.map(s => ({ titre: s.titre, chapitres: s.chapitres?.length || 0 })), null, 2));

    for (let i = 0; i < sections.length; i++) {
      const sectionDto = sections[i];
      console.log(`📁 Section ${i + 1}: "${sectionDto.titre}" (${sectionDto.chapitres.length} chapitres)`);

      // Créer la section
      const nouvelleSection = {
        id: new Types.ObjectId().toString(),
        titre: sectionDto.titre,
        description: sectionDto.description || '',
        courseId: cours.id,
        ordre: sectionDto.ordre,
        chapitres: [],
        createdAt: new Date()
      };

      // Ajouter la section au cours
      cours.ajouterSection(nouvelleSection);

      // Créer et ajouter chaque chapitre à cette section
      for (let j = 0; j < sectionDto.chapitres.length; j++) {
        const chapitreDto = sectionDto.chapitres[j];
        console.log(`   📄 Chapitre ${j + 1}: "${chapitreDto.titre}"`);
        console.log(`      🔧 Données du chapitre:`, JSON.stringify(chapitreDto, null, 2));

        const normalizedContent = this.normalizeChapterContent(chapitreDto.description);
        const normalizedVideoUrl = this.resolveChapterVideoUrlForCreate(chapitreDto.videoUrl);
        this.assertChapterHasContentOrVideo(normalizedContent, normalizedVideoUrl);

        const nouveauChapitre = {
          id: new Types.ObjectId().toString(),
          titre: chapitreDto.titre,
          contenu: normalizedContent,
          videoUrl: normalizedVideoUrl,
          isPreview: !chapitreDto.isPaid,
          ordre: chapitreDto.ordre,
          duree: chapitreDto.duree,
          prix: this.resolvePaidChapterPrice(
            { isPaid: chapitreDto.isPaid, prix: chapitreDto.prix },
            cours.prix,
          ),
          isPaidChapter: chapitreDto.isPaid,
          notes: chapitreDto.notes || '',
          ressources: [],
          sectionId: nouvelleSection.id,
          createdAt: new Date()
        };

        console.log(`      🏗️  Chapitre créé:`, JSON.stringify({
          id: nouveauChapitre.id,
          titre: nouveauChapitre.titre,
          ordre: nouveauChapitre.ordre,
          sectionId: nouveauChapitre.sectionId
        }, null, 2));

        console.log(`      📎 Appel de ajouterChapitreASection avec sectionId: "${nouvelleSection.id}"`);

        // Ajouter le chapitre à la section
        try {
          cours.ajouterChapitreASection(nouvelleSection.id, nouveauChapitre);
          console.log(`      ✅ ajouterChapitreASection terminé sans erreur`);
        } catch (error) {
          console.log(`      ❌ ERREUR dans ajouterChapitreASection:`, error.message);
        }
      }
    }

    // Sauvegarder le cours avec toutes les sections et chapitres
    await cours.save();

    // Vérifier le résultat final
    console.log('📊 Résultat final:');
    console.log(`   ✅ ${cours.sections.length} sections créées`);
    cours.sections.forEach((section, index) => {
      console.log(`   📁 Section ${index + 1}: "${section.titre}" → ${section.chapitres.length} chapitres`);
    });
  }

  /**
   * Transformer un document cours en DTO de réponse
   */
  /**
   * Extract video storage key from a video URL for protected delivery.
   * Returns null for YouTube/Vimeo/external URLs (they don't need protection).
   */
  private extractVideoStorageKey(videoUrl: string | undefined): string | null {
    if (!videoUrl) return null;
    // Direct storage key format: "video/1234-uuid.mp4"
    if (/^video\//.test(videoUrl)) return videoUrl;
    // Relative path: "/uploads/video/1234-uuid.mp4"
    const relMatch = videoUrl.match(/\/?uploads\/(video\/[^\s?#]+)/i);
    if (relMatch) return relMatch[1];
    // Absolute URL: "https://api.chabaqa.io/uploads/video/1234-uuid.mp4"
    try {
      const url = new URL(videoUrl);
      const pathMatch = url.pathname.match(/\/?uploads\/(video\/[^\s?#]+)/i);
      if (pathMatch) return pathMatch[1];
    } catch { /* not a valid URL */ }
    return null;
  }

  /**
   * Determine which video fields to expose for a chapter.
   * Premium chapters with local video: strip videoUrl, expose videoStorageKey + hasProtectedVideo.
   * Preview/free chapters or YouTube/Vimeo: keep videoUrl as-is.
   */
  private resolveChapterVideoFields(chapitre: any): {
    videoUrl: string;
    videoStorageKey: string | null;
    hasProtectedVideo: boolean;
  } {
    const rawUrl = chapitre.videoUrl || '';
    const storageKey = this.extractVideoStorageKey(rawUrl);
    const isPremium = !chapitre.isPreview;

    // Premium chapter with local video → protect it
    if (isPremium && storageKey) {
      return {
        videoUrl: '', // Don't expose the direct URL
        videoStorageKey: storageKey,
        hasProtectedVideo: true,
      };
    }

    // Preview/free chapter or external embed (YouTube/Vimeo) → keep URL
    return {
      videoUrl: rawUrl ? this.uploadService.ensureAbsoluteUrl(rawUrl) : '',
      videoStorageKey: storageKey, // May be null for YouTube
      hasProtectedVideo: false,
    };
  }

  private async transformerEnReponse(cours: CoursDocument): Promise<CoursResponseDto> {
    try {
      // Récupérer la communauté pour avoir accès au slug (ID ou slug)
      let community: any = null;
      if (cours.communityId) {
        if (Types.ObjectId.isValid(cours.communityId as any)) {
          community = await this.communityModel.findById(cours.communityId);
        } else {
          community = await this.communityModel.findOne({ slug: cours.communityId });
        }
      }

      // Safely extract sections and chapters
      const sections = Array.isArray(cours.sections) ? cours.sections : [];
      const tousLesChapitres = sections.flatMap(section => {
        const chapitres = Array.isArray(section.chapitres) ? section.chapitres : [];
        return chapitres.map(chapitre => {
          const videoFields = this.resolveChapterVideoFields(chapitre);
          
          return {
            id: chapitre.id,
            titre: chapitre.titre,
            description: chapitre.contenu,
            videoUrl: videoFields.videoUrl,
            videoStorageKey: videoFields.videoStorageKey,
            hasProtectedVideo: videoFields.hasProtectedVideo,
            isPaid: !chapitre.isPreview, // Inverse de isPreview
            ordre: chapitre.ordre,
            duree: chapitre.duree?.toString(),
            courseId: section.courseId,
            sectionId: chapitre.sectionId,
            prix: chapitre.prix,
            price: chapitre.prix,
            notes: chapitre.notes,
            ressources: chapitre.ressources,
            createdAt: chapitre.createdAt
          };
        });
      });

      // Safely handle creator data
      let creator: { id: string; name: string; email: string; avatar?: string; bio?: string } | undefined = undefined;
      if (cours.creatorId) {
        const creatorData = cours.creatorId as any;
        if (typeof creatorData === 'object' && creatorData.name) {
          creator = {
            id: creatorData._id?.toString() || '',
            name: creatorData.name,
            email: creatorData.email,
            avatar: this.uploadService.ensureAbsoluteUrl(creatorData.profile_picture || creatorData.photo_profil),
            bio: creatorData.bio || ''
          };
        }
      }

      return {
        mongoId: cours._id.toString(),
        id: cours.id || cours._id.toString(),
        titre: cours.titre,
        description: cours.description,
        thumbnail: this.uploadService.ensureAbsoluteUrl(cours.thumbnail),
        isPaid: cours.prix > 0,
        prix: cours.prix,
        isPaidCourse: (cours as any).isPaidCourse || cours.prix > 0,
        devise: cours.devise,
        communitySlug: community?.slug || cours.communityId, // Slug pour rétrocompatibilité
        communityId: cours.communityId?.toString?.() || '', // Peut être un ObjectId ou un slug
        creatorId: cours.creatorId?.toString() || '',
        isPublished: cours.isPublished,
        enrollmentCount: Array.isArray(cours.inscriptions) ? cours.inscriptions.length : 0,
        // Use attached rating values if available (from attachRatingStatsToCourses), otherwise use stored values
        averageRating: (cours as any).averageRating !== undefined ? Number((cours as any).averageRating) : Number(cours.averageRating || 0),
        ratingCount: (cours as any).ratingCount !== undefined ? Number((cours as any).ratingCount) : Number(cours.ratingCount || 0),
        // Nouveaux champs du schéma - mapping correct des sections
        sections: sections.map(section => {
          const chapitres = Array.isArray(section.chapitres) ? section.chapitres : [];
          return {
            id: section.id,
            titre: section.titre,
            description: section.description,
            courseId: section.courseId,
            ordre: section.ordre,
            createdAt: section.createdAt,
            chapitres: chapitres.map(chapitre => {
              const videoFields = this.resolveChapterVideoFields(chapitre);
              
              return {
                id: chapitre.id,
                titre: chapitre.titre,
                description: chapitre.contenu,
                videoUrl: videoFields.videoUrl,
                videoStorageKey: videoFields.videoStorageKey,
                hasProtectedVideo: videoFields.hasProtectedVideo,
                isPaid: !chapitre.isPreview,
                isPreview: Boolean(chapitre.isPreview),
                ordre: chapitre.ordre,
                duree: chapitre.duree?.toString(),
                courseId: section.courseId,
                sectionId: chapitre.sectionId,
                prix: chapitre.prix,
                price: chapitre.prix,
                isPaidChapter: chapitre.isPaidChapter || !chapitre.isPreview,
                notes: chapitre.notes,
                ressources: Array.isArray(chapitre.ressources) ? chapitre.ressources.map(res => ({
                  id: res.id,
                  titre: res.titre,
                  type: res.type,
                  url: this.uploadService.ensureAbsoluteUrl(res.url),
                  description: res.description,
                  ordre: res.ordre
                })) : [],
                createdAt: chapitre.createdAt
              };
            })
          };
        }),
        category: cours.category,
        niveau: cours.niveau,
        duree: cours.duree,
        learningObjectives: Array.isArray(cours.learningObjectives) ? cours.learningObjectives : [],
        requirements: Array.isArray(cours.requirements) ? cours.requirements : [],
        notes: cours.notes,
        ressources: Array.isArray(cours.ressources) ? cours.ressources : [],
        createdAt: cours.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: cours.updatedAt?.toISOString() || new Date().toISOString(),
        creator
      };
    } catch (error) {
      console.error('Error transforming course response:', error);
      // Return a minimal response to prevent 500 errors
      return {
        mongoId: cours._id.toString(),
        id: cours.id || cours._id.toString(),
        titre: cours.titre || 'Unknown Course',
        description: cours.description || '',
        thumbnail: this.uploadService.ensureAbsoluteUrl(cours.thumbnail),
        isPaid: cours.prix > 0,
        prix: cours.prix || 0,
        isPaidCourse: (cours as any).isPaidCourse || cours.prix > 0,
        devise: cours.devise || 'TND',
        communitySlug: cours.communityId || '',
        communityId: cours.communityId || '',
        creatorId: cours.creatorId?.toString() || '',
        isPublished: cours.isPublished || false,
        enrollmentCount: 0,
        sections: [],
        category: cours.category,
        niveau: cours.niveau,
        duree: cours.duree,
        learningObjectives: [],
        requirements: [],
        notes: cours.notes,
        ressources: [],
        averageRating: cours.averageRating || 0,
        ratingCount: cours.ratingCount || 0,
        createdAt: cours.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: cours.updatedAt?.toISOString() || new Date().toISOString(),
        creator: undefined
      };
    }
  }

  async updateSection(
    coursId: string,
    sectionId: string,
    dto: UpdateSectionDto,
    userId: string,
  ): Promise<CoursResponseDto> {
    const cours = await this.coursModel.findById(coursId);
    if (!cours) {
      throw new NotFoundException('Cours non trouvé');
    }

    await this.verifierAdminCommunaute(userId, cours.communityId.toString());

    const section = cours.sections.find((s) => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    if (dto.titre !== undefined) {
      section.titre = dto.titre;
    }
    if (dto.description !== undefined) {
      section.description = dto.description;
    }
    if (dto.ordre !== undefined) {
      section.ordre = dto.ordre;
    }

    const saved = await cours.save();
    await this.invalidateCourseCaches(cours.creatorId?.toString?.());
    return await this.transformerEnReponse(saved);
  }

  async updateChapitre(
    coursId: string,
    sectionId: string,
    chapitreId: string,
    dto: UpdateChapitreDto,
    userId: string,
  ): Promise<CoursResponseDto> {
    const cours = await this.coursModel.findById(coursId);
    if (!cours) {
      throw new NotFoundException('Cours non trouvé');
    }

    await this.verifierAdminCommunaute(userId, cours.communityId.toString());

    const section = cours.sections.find((s) => s.id === sectionId);
    if (!section) {
      throw new NotFoundException('Section non trouvée dans ce cours');
    }

    const chapitre = section.chapitres.find((c: any) => c.id === chapitreId);
    if (!chapitre) {
      throw new NotFoundException('Chapitre non trouvé dans cette section');
    }

    const normalizedExistingContent = this.normalizeChapterContent(chapitre.contenu);
    const normalizedExistingVideoUrl = normalizeChapterVideoUrl(chapitre.videoUrl);
    const nextContent =
      dto.description !== undefined
        ? this.normalizeChapterContent(dto.description)
        : normalizedExistingContent;
    const nextVideoUrl =
      dto.videoUrl !== undefined
        ? this.resolveChapterVideoUrlForUpdate(normalizedExistingVideoUrl, dto.videoUrl)
        : normalizedExistingVideoUrl;

    this.assertChapterHasContentOrVideo(nextContent, nextVideoUrl);

    if (dto.titre !== undefined) {
      chapitre.titre = dto.titre;
    }
    if (dto.description !== undefined) {
      chapitre.contenu = nextContent;
    }
    if (dto.videoUrl !== undefined) {
      chapitre.videoUrl = nextVideoUrl;
    }
    if (dto.ordre !== undefined) {
      chapitre.ordre = dto.ordre;
    }
    if (dto.duree !== undefined) {
      chapitre.duree = dto.duree ? this.convertirDureeEnMinutes(dto.duree) : undefined;
    }
    if (dto.prix !== undefined) {
      chapitre.prix = dto.prix;
    }
    if (dto.notes !== undefined) {
      chapitre.notes = dto.notes;
    }
    if (dto.isPaid !== undefined) {
      const isPaid = Boolean(dto.isPaid);
      chapitre.isPaidChapter = isPaid;
      chapitre.isPreview = !isPaid;
      if (!isPaid) {
        chapitre.prix = 0;
      } else {
        chapitre.prix = this.resolvePaidChapterPrice(
          { isPaid: true, prix: chapitre.prix },
          cours.prix,
        );
      }
    }

    if (chapitre.isPaidChapter) {
      chapitre.prix = this.resolvePaidChapterPrice(
        { isPaid: true, prix: chapitre.prix },
        cours.prix,
      );
    } else {
      chapitre.prix = 0;
      chapitre.isPreview = true;
    }

    const saved = await cours.save();
    await this.invalidateCourseCaches(cours.creatorId?.toString?.());
    return await this.transformerEnReponse(saved);
  }

  async ajouterSection(coursId: string, addSectionDto: AddSectionDto, userId: string): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début ajouterSection');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      console.log(`   ✅ Cours trouvé: ${cours.titre}`);
      console.log(`   🏢 Community ID: ${cours.communityId}`);

      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      console.log('   ✅ Utilisateur autorisé');

      const nouvelleSection = {
        id: new Types.ObjectId().toString(),
        titre: addSectionDto.titre,
        description: addSectionDto.description || '',
        courseId: coursId,
        ordre: addSectionDto.ordre,
        chapitres: Array.isArray(addSectionDto.chapitres)
          ? addSectionDto.chapitres.map((chapitre) => {
            const normalizedContent = this.normalizeChapterContent(chapitre.description);
            const normalizedVideoUrl = this.resolveChapterVideoUrlForCreate(chapitre.videoUrl);
            this.assertChapterHasContentOrVideo(normalizedContent, normalizedVideoUrl);

            return {
              id: new Types.ObjectId().toString(),
              titre: chapitre.titre,
              contenu: normalizedContent,
              videoUrl: normalizedVideoUrl,
              duree: chapitre.duree ? this.convertirDureeEnMinutes(chapitre.duree) : undefined,
              sectionId: new Types.ObjectId().toString(),
              ordre: chapitre.ordre,
              isPreview: chapitre.isPaid === false,
              prix: this.resolvePaidChapterPrice(
                { isPaid: chapitre.isPaid, prix: chapitre.prix },
                cours.prix,
              ),
              notes: chapitre.notes,
              ressources: [],
              createdAt: new Date(),
            };
          })
          : [],
        createdAt: new Date(),
      };

      nouvelleSection.chapitres.forEach((chapitre) => {
        chapitre.sectionId = nouvelleSection.id;
      });

      cours.sections.push(nouvelleSection as any);
      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());
      return await this.transformerEnReponse(coursEnregistre);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      console.error('❌ Erreur lors de l\'ajout de la section:', error);
      throw new BadRequestException('Erreur lors de l\'ajout de la section');
    }
  }

  /**
   * Ajouter un chapitre à une section spécifique d'un cours
   * @param coursId ID du cours
   * @param sectionId ID de la section
   * @param addChapitreDto Données du chapitre à ajouter
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Cours mis à jour avec le nouveau chapitre
   */
  async ajouterChapitreASection(
    coursId: string,
    sectionId: string,
    addChapitreDto: AddChapitreToSectionDto,
    userId: string
  ): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début ajouterChapitreASection');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📑 Section ID: ${sectionId}`);
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📝 Chapitre à ajouter:`, addChapitreDto);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      console.log(`   ✅ Cours trouvé: ${cours.titre}`);
      console.log(`   🏢 Community ID: ${cours.communityId}`);

      // 2. Vérifier que l'utilisateur est admin de la communauté
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      console.log('   ✅ Utilisateur autorisé');

      // 3. Trouver la section dans le cours
      const section = cours.sections.find(s => s.id === sectionId);
      if (!section) {
        throw new NotFoundException('Section non trouvée dans ce cours');
      }

      console.log(`   ✅ Section trouvée: ${section.titre}`);
      console.log(`   📚 Chapitres actuels: ${section.chapitres?.length || 0}`);

      const normalizedContent = this.normalizeChapterContent(addChapitreDto.description);
      const normalizedVideoUrl = this.resolveChapterVideoUrlForCreate(addChapitreDto.videoUrl);
      this.assertChapterHasContentOrVideo(normalizedContent, normalizedVideoUrl);

      // 4. Construire le nouveau chapitre
      const nouveauChapitre = {
        id: new Types.ObjectId().toString(),
        titre: addChapitreDto.titre,
        contenu: normalizedContent,
        videoUrl: normalizedVideoUrl,
        duree: addChapitreDto.duree ? this.convertirDureeEnMinutes(addChapitreDto.duree) : (normalizedVideoUrl ? 5 : 0), // Default 5 minutes for videos, 0 for text
        sectionId: sectionId,
        ordre: addChapitreDto.ordre,
        isPreview: !addChapitreDto.isPaid,
        prix: this.resolvePaidChapterPrice(
          { isPaid: addChapitreDto.isPaid, prix: addChapitreDto.prix },
          cours.prix,
        ),
        isPaidChapter: addChapitreDto.isPaid,
        notes: addChapitreDto.notes,
        ressources: [],
        createdAt: new Date()
      };

      console.log('   🏗️ Nouveau chapitre construit:', {
        id: nouveauChapitre.id,
        titre: nouveauChapitre.titre,
        ordre: nouveauChapitre.ordre,
        duree: nouveauChapitre.duree,
        isPaid: addChapitreDto.isPaid
      });

      // 5. Ajouter le nouveau chapitre à la section
      if (!section.chapitres) {
        section.chapitres = [];
      }
      section.chapitres.push(nouveauChapitre as any);

      // 6. Sauvegarder le cours
      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log(`   ✅ Chapitre ajouté avec succès à la section`);
      console.log(`   📊 Nombre total de chapitres dans la section: ${section.chapitres.length}`);

      // 7. Retourner le cours mis à jour
      return await this.transformerEnReponse(coursEnregistre);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors de l\'ajout du chapitre:', error);
      throw new BadRequestException('Erreur lors de l\'ajout du chapitre');
    }
  }

  /**
   * Supprimer une section d'un cours
   * @param coursId ID du cours
   * @param sectionId ID de la section à supprimer
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Cours mis à jour sans la section supprimée
   */
  async supprimerSection(coursId: string, sectionId: string, userId: string): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début supprimerSection');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📑 Section ID: ${sectionId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      console.log(`   ✅ Cours trouvé: ${cours.titre}`);
      console.log(`   🏢 Community ID: ${cours.communityId}`);

      // 2. Vérifier que l'utilisateur est admin de la communauté
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      console.log('   ✅ Utilisateur autorisé');

      // 3. Trouver et supprimer la section
      const sectionIndex = cours.sections.findIndex(s => s.id === sectionId);
      if (sectionIndex === -1) {
        throw new NotFoundException('Section non trouvée dans ce cours');
      }

      const sectionSupprimee = cours.sections[sectionIndex];
      console.log(`   ✅ Section trouvée: ${sectionSupprimee.titre}`);
      console.log(`   📚 Chapitres à supprimer: ${sectionSupprimee.chapitres?.length || 0}`);

      // 4. Supprimer la section
      cours.sections.splice(sectionIndex, 1);

      // 5. Sauvegarder le cours
      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log(`   ✅ Section supprimée avec succès`);
      console.log(`   📊 Nombre total de sections restantes: ${coursEnregistre.sections.length}`);

      // 6. Retourner le cours mis à jour
      return await this.transformerEnReponse(coursEnregistre);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors de la suppression de la section:', error);
      throw new BadRequestException('Erreur lors de la suppression de la section');
    }
  }

  /**
   * Supprimer un chapitre d'une section spécifique d'un cours
   * @param coursId ID du cours
   * @param sectionId ID de la section
   * @param chapitreId ID du chapitre à supprimer
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Cours mis à jour sans le chapitre supprimé
   */
  async supprimerChapitre(
    coursId: string,
    sectionId: string,
    chapitreId: string,
    userId: string
  ): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début supprimerChapitre');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📑 Section ID: ${sectionId}`);
    console.log(`   📄 Chapitre ID: ${chapitreId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      console.log(`   ✅ Cours trouvé: ${cours.titre}`);
      console.log(`   🏢 Community ID: ${cours.communityId}`);

      // 2. Vérifier que l'utilisateur est admin de la communauté
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      console.log('   ✅ Utilisateur autorisé');

      // 3. Trouver la section dans le cours
      const section = cours.sections.find(s => s.id === sectionId);
      if (!section) {
        throw new NotFoundException('Section non trouvée dans ce cours');
      }

      console.log(`   ✅ Section trouvée: ${section.titre}`);
      console.log(`   📚 Chapitres actuels: ${section.chapitres?.length || 0}`);

      // 4. Trouver et supprimer le chapitre
      if (!section.chapitres) {
        throw new NotFoundException('Aucun chapitre dans cette section');
      }

      const chapitreIndex = section.chapitres.findIndex(c => c.id === chapitreId);
      if (chapitreIndex === -1) {
        throw new NotFoundException('Chapitre non trouvé dans cette section');
      }

      const chapitreSupprime = section.chapitres[chapitreIndex];
      console.log(`   ✅ Chapitre trouvé: ${chapitreSupprime.titre}`);

      // 5. Supprimer le chapitre
      section.chapitres.splice(chapitreIndex, 1);

      // 6. Sauvegarder le cours
      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log(`   ✅ Chapitre supprimé avec succès`);
      console.log(`   📊 Nombre total de chapitres restants dans la section: ${section.chapitres.length}`);

      // 7. Retourner le cours mis à jour
      return await this.transformerEnReponse(coursEnregistre);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors de la suppression du chapitre:', error);
      throw new BadRequestException('Erreur lors de la suppression du chapitre');
    }
  }

  /**
   * Fonction utilitaire pour convertir durée "HH:MM" en minutes
   * @param dureeStr Durée au format "HH:MM"
   * @returns Durée en minutes
   */
  private convertirDureeEnMinutes(dureeStr: string): number {
    if (!dureeStr) return 0;
    const parts = dureeStr.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      return minutes;
    }
    return parseInt(dureeStr) || 0;
  }
  /**
   * Mettre à jour le thumbnail d'un cours
   * @param coursId ID du cours
   * @param thumbnailUrl Nouvelle URL du thumbnail
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Cours mis à jour
   */
  async mettreAJourThumbnail(coursId: string, thumbnailUrl: string, userId: string): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début mettreAJourThumbnail');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   🖼️ Thumbnail URL: ${thumbnailUrl}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      // 2. Vérifier que l'utilisateur est admin de la communauté
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      // 3. Mettre à jour le thumbnail
      cours.thumbnail = thumbnailUrl;
      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log('   ✅ Thumbnail mis à jour avec succès');

      return await this.transformerEnReponse(coursEnregistre);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors de la mise à jour du thumbnail:', error);
      throw new BadRequestException('Erreur lors de la mise à jour du thumbnail');
    }
  }

  /**
   * Mettre à jour l'URL vidéo d'un chapitre
   * @param coursId ID du cours
   * @param sectionId ID de la section
   * @param chapitreId ID du chapitre
   * @param videoUrl Nouvelle URL de la vidéo
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Cours mis à jour
   */
  async mettreAJourVideoUrl(
    coursId: string,
    sectionId: string,
    chapitreId: string,
    videoUrl: string,
    userId: string
  ): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début mettreAJourVideoUrl');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📑 Section ID: ${sectionId}`);
    console.log(`   📄 Chapitre ID: ${chapitreId}`);
    console.log(`   🎥 Video URL: ${videoUrl}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      // 2. Vérifier que l'utilisateur est admin de la communauté
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      // 3. Trouver la section
      const section = cours.sections.find(s => s.id === sectionId);
      if (!section) {
        throw new NotFoundException('Section non trouvée dans ce cours');
      }

      // 4. Trouver le chapitre
      const chapitre = section.chapitres.find(c => c.id === chapitreId);
      if (!chapitre) {
        throw new NotFoundException('Chapitre non trouvé dans cette section');
      }

      const nextVideoUrl = this.resolveChapterVideoUrlForUpdate(
        chapitre.videoUrl,
        videoUrl,
      );
      this.assertChapterHasContentOrVideo(chapitre.contenu, nextVideoUrl);

      // 5. Mettre à jour l'URL vidéo
      chapitre.videoUrl = nextVideoUrl;
      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log('   ✅ URL vidéo mise à jour avec succès');

      return await this.transformerEnReponse(coursEnregistre);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors de la mise à jour de l\'URL vidéo:', error);
      throw new BadRequestException('Erreur lors de la mise à jour de l\'URL vidéo');
    }
  }

  /**
   * Upload video for a chapter directly
   */
  async uploadChapterVideo(
    coursId: string,
    sectionId: string,
    chapitreId: string,
    file: Express.Multer.File,
    userId: string
  ): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début uploadChapterVideo');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📑 Section ID: ${sectionId}`);
    console.log(`   📄 Chapitre ID: ${chapitreId}`);
    console.log(`   👤 User ID: ${userId}`);

    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    try {
      // 1. Process upload via UploadService to get URL and validate
      // This will throw if file is invalid
      const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
        userId,
        purpose: MediaPurpose.COURSE_VIDEO,
        entityType: 'chapter',
        entityId: chapitreId,
      });

      console.log(`   ✅ Video uploaded to: ${uploadResult.url}`);

      // 2. Update the chapter with the new URL
      return await this.mettreAJourVideoUrl(coursId, sectionId, chapitreId, uploadResult.url, userId);
    } catch (error) {
      console.error('❌ Error uploading chapter video:', error);
      throw error;
    }
  }

  /**
   * Ajouter une ressource à un chapitre
   * @param coursId ID du cours
   * @param sectionId ID de la section
   * @param chapitreId ID du chapitre
   * @param ressource Données de la ressource
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Cours mis à jour
   */
  async ajouterRessourceAChapitre(
    coursId: string,
    sectionId: string,
    chapitreId: string,
    ressource: any,
    userId: string
  ): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - Début ajouterRessourceAChapitre');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📑 Section ID: ${sectionId}`);
    console.log(`   📄 Chapitre ID: ${chapitreId}`);
    console.log(`   📎 Ressource:`, ressource);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      // 2. Vérifier que l'utilisateur est admin de la communauté
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      // 3. Trouver la section
      const section = cours.sections.find(s => s.id === sectionId);
      if (!section) {
        throw new NotFoundException('Section non trouvée dans ce cours');
      }

      // 4. Trouver le chapitre
      const chapitre = section.chapitres.find(c => c.id === chapitreId);
      if (!chapitre) {
        throw new NotFoundException('Chapitre non trouvé dans cette section');
      }

      // 5. Créer la nouvelle ressource
      const nouvelleRessource = {
        id: new Types.ObjectId().toString(),
        titre: ressource.titre,
        type: ressource.type,
        url: ressource.url,
        description: ressource.description,
        ordre: ressource.ordre
      };

      // 6. Ajouter la ressource au chapitre
      if (!chapitre.ressources) {
        chapitre.ressources = [];
      }
      chapitre.ressources.push(nouvelleRessource as any);

      // 7. Trier les ressources par ordre
      chapitre.ressources.sort((a, b) => a.ordre - b.ordre);

      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log('   ✅ Ressource ajoutée avec succès');

      return await this.transformerEnReponse(coursEnregistre);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors de l\'ajout de la ressource:', error);
      throw new BadRequestException('Erreur lors de l\'ajout de la ressource');
    }
  }

  /**
   * Vérifier les permissions pour un cours (utilisé pour la suppression de fichiers)
   * @param coursId ID du cours
   * @param userId ID de l'utilisateur
   * @returns True si autorisé
   */
  async verifierPermissionsCours(coursId: string, userId: string): Promise<boolean> {
    const cours = await this.coursModel.findById(coursId);
    if (!cours) {
      throw new NotFoundException('Cours non trouvé');
    }

    // Vérifier que l'utilisateur est admin de la communauté du cours
    await this.verifierAdminCommunaute(userId, cours.communityId.toString());

    return true;
  }

  /**
   * Créer un cours avec fichiers intégrés
   * @param createCoursDto Données du cours
   * @param uploadedFiles Fichiers uploadés traités
   * @param userId ID de l'utilisateur
   * @returns Cours créé avec fichiers
   */
  async creerCoursAvecFichiers(
    createCoursDto: CreateCoursDto,
    uploadedFiles: { thumbnail?: string; videos: any; ressources: any },
    userId: string
  ): Promise<CoursResponseDto> {
    console.log('🚀 Création de cours avec fichiers intégrés');
    console.log('   Thumbnail:', uploadedFiles.thumbnail);
    console.log('   Vidéos:', Object.keys(uploadedFiles.videos).length);
    console.log('   Ressources:', Object.keys(uploadedFiles.ressources).length);

    // Intégrer le thumbnail dans les données du cours
    const coursDataAvecThumbnail = {
      ...createCoursDto,
      thumbnail: uploadedFiles.thumbnail || createCoursDto.thumbnail
    };

    // Créer une map temporaire pour les ressources par chapitre
    const tempRessourcesMap = new Map<string, Array<{ url: string; titre: string; type: string }>>();

    // Intégrer les URLs des vidéos et ressources dans les chapitres
    if (coursDataAvecThumbnail.sections) {
      coursDataAvecThumbnail.sections.forEach((section, sIndex) => {
        section.chapitres.forEach((chapitre, cIndex) => {
          // Chercher une vidéo pour ce chapitre (index ou 'default')
          const videoKey = `${sIndex}-${cIndex}`;
          const videoUrl = uploadedFiles.videos[videoKey] || uploadedFiles.videos['default'];
          if (videoUrl) {
            chapitre.videoUrl = videoUrl;
            console.log(`📹 Vidéo assignée au chapitre ${cIndex} de la section ${sIndex}: ${videoUrl}`);
          }

          // Pour les ressources, on les stocke dans la map temporaire
          // NOTE: on NE FAIT PLUS de fallback vers 'default' ici afin d'éviter
          // la duplication des ressources "par défaut" sur chaque chapitre.
          // Les ressources "par défaut" seront ajoutées au niveau du cours.
          const ressourcesKey = `${sIndex}-${cIndex}`;
          const ressources = uploadedFiles.ressources[ressourcesKey];
          if (ressources && ressources.length > 0) {
            console.log(`📄 ${ressources.length} ressource(s) trouvée(s) pour chapitre ${cIndex} de section ${sIndex}`);
            const chapitreKey = `${sIndex}-${cIndex}`;
            tempRessourcesMap.set(chapitreKey, ressources);
          }
        });
      });
    }

    // Créer le cours de base
    const cours = await this.creerCours(coursDataAvecThumbnail, userId);

    // Ajouter les ressources aux chapitres après création
    await this.ajouterRessourcesAuxChapitres(cours, uploadedFiles.ressources);

    // Ajouter les ressources temporaires stockées dans la map
    for (const [sectionIndex, section] of cours.sections.entries()) {
      for (const [chapitreIndex, chapitre] of section.chapitres.entries()) {
        const chapitreKey = `${sectionIndex}-${chapitreIndex}`;
        const tempRessources = tempRessourcesMap.get(chapitreKey);

        if (tempRessources && tempRessources.length > 0) {
          console.log(`💾 Ajout de ${tempRessources.length} ressource(s) au chapitre ${chapitre.titre}`);

          for (const ressource of tempRessources) {
            const nouvellRessource = {
              titre: ressource.titre,
              description: ressource.titre, // Utiliser le titre comme description par défaut
              url: ressource.url,
              type: ressource.type,
              ordre: chapitre.ressources ? chapitre.ressources.length + 1 : 1
            };

            try {
              const coursUpdated = await this.ajouterRessourceAChapitre(
                cours.id,
                section.id,
                chapitre.id,
                nouvellRessource,
                userId
              );
              // Mettre à jour les ressources localement
              if (coursUpdated) {
                const updatedSection = coursUpdated.sections.find(s => s.id === section.id);
                const updatedChapitre = updatedSection?.chapitres.find(c => c.id === chapitre.id);
                if (updatedChapitre) {
                  chapitre.ressources = updatedChapitre.ressources;
                }
              }
            } catch (error) {
              console.error(`❌ Erreur ajout ressource ${ressource.titre}:`, error.message);
            }
          }
        }
      }
    }

    // Traiter les ressources "par défaut" comme ressources de COURS (niveau global)
    try {
      const courseLevelRessources = uploadedFiles.ressources?.course || uploadedFiles.ressources?.default;
      if (courseLevelRessources && courseLevelRessources.length > 0) {
        const coursDoc = await this.coursModel.findOne({ id: cours.id });
        if (coursDoc) {
          const ressourcesList: any[] = Array.isArray(coursDoc.ressources) ? (coursDoc.ressources as any[]) : [];
          const existingCount = ressourcesList.length;
          for (let i = 0; i < courseLevelRessources.length; i++) {
            const res = courseLevelRessources[i];
            ressourcesList.push({
              id: new Types.ObjectId().toString(),
              titre: res.titre,
              type: res.type,
              url: res.url,
              description: res.titre,
              ordre: existingCount + i + 1
            } as any);
          }
          (coursDoc as any).ressources = ressourcesList;
          await coursDoc.save();
        }
      }
    } catch (err) {
      console.error('❌ Erreur lors de l\'ajout des ressources de cours (niveau global):', err);
    }

    // Recharger et retourner la version finale complète du cours
    try {
      const finalDoc = await this.coursModel.findOne({ id: cours.id });
      if (finalDoc) {
        return await this.transformerEnReponse(finalDoc);
      }
    } catch (err) {
      console.error('❌ Erreur lors du rechargement du cours final:', err);
    }

    return cours;
  }

  /**
   * Ajouter un chapitre avec fichiers
   * @param coursId ID du cours
   * @param sectionId ID de la section
   * @param addChapitreDto Données du chapitre
   * @param uploadedFiles Fichiers uploadés
   * @param userId ID de l'utilisateur
   * @returns Cours mis à jour
   */
  async ajouterChapitreASectionAvecFichiers(
    coursId: string,
    sectionId: string,
    addChapitreDto: AddChapitreToSectionDto,
    uploadedFiles: { thumbnail?: string; videos: any; ressources: any },
    userId: string
  ): Promise<CoursResponseDto> {
    // Intégrer la vidéo dans les données du chapitre
    const chapitreAvecVideo = {
      ...addChapitreDto,
      videoUrl: uploadedFiles.videos['default'] || addChapitreDto.videoUrl
    };

    // Ajouter le chapitre de base
    const cours = await this.ajouterChapitreASection(coursId, sectionId, chapitreAvecVideo, userId);

    // Ajouter les ressources si présentes
    if (uploadedFiles.ressources['default']) {
      const section = cours.sections.find(s => s.id === sectionId);
      if (section) {
        const chapitre = section.chapitres[section.chapitres.length - 1]; // Dernier chapitre ajouté

        for (const ressource of uploadedFiles.ressources['default']) {
          await this.ajouterRessourceAChapitre(
            coursId,
            sectionId,
            chapitre.id,
            ressource,
            userId
          );
        }
      }
    }

    return cours;
  }

  /**
   * Ajouter une section avec fichiers
   * @param coursId ID du cours
   * @param addSectionDto Données de la section
   * @param uploadedFiles Fichiers uploadés
   * @param userId ID de l'utilisateur
   * @returns Cours mis à jour
   */
  async ajouterSectionAvecFichiers(
    coursId: string,
    addSectionDto: AddSectionDto,
    uploadedFiles: { thumbnail?: string; videos: any; ressources: any },
    userId: string
  ): Promise<CoursResponseDto> {
    // Intégrer les vidéos dans les chapitres de la section
    if (addSectionDto.chapitres) {
      addSectionDto.chapitres.forEach((chapitre, index) => {
        const videoKey = index.toString();
        if (uploadedFiles.videos[videoKey]) {
          chapitre.videoUrl = uploadedFiles.videos[videoKey];
        }
      });
    }

    // Ajouter la section de base
    const cours = await this.ajouterSection(coursId, addSectionDto, userId);

    // Ajouter les ressources aux chapitres
    if (addSectionDto.chapitres) {
      for (let i = 0; i < addSectionDto.chapitres.length; i++) {
        const ressourcesKey = i.toString();
        if (uploadedFiles.ressources[ressourcesKey]) {
          const section = cours.sections[cours.sections.length - 1]; // Dernière section ajoutée
          const chapitre = section.chapitres[i];

          for (const ressource of uploadedFiles.ressources[ressourcesKey]) {
            await this.ajouterRessourceAChapitre(
              coursId,
              section.id,
              chapitre.id,
              ressource,
              userId
            );
          }
        }
      }
    }

    return cours;
  }

  /**
   * Ajouter des ressources aux chapitres après création du cours
   */
  private async ajouterRessourcesAuxChapitres(
    cours: CoursResponseDto,
    ressources: { [key: string]: Array<{ url: string; titre: string; type: string }> }
  ): Promise<void> {
    for (const [key, ressourcesList] of Object.entries(ressources)) {
      const [sectionIndex, chapitreIndex] = key.split('-').map(Number);

      if (cours.sections[sectionIndex] && cours.sections[sectionIndex].chapitres[chapitreIndex]) {
        const section = cours.sections[sectionIndex];
        const chapitre = section.chapitres[chapitreIndex];

        for (const ressource of ressourcesList) {
          // Ici on pourrait appeler ajouterRessourceAChapitre si nécessaire
          // Pour l'instant on les intègre directement
        }
      }
    }
  }

  /**
   * Vérifier si un utilisateur peut accéder à un chapitre (gratuit ou payant)
   * @param coursId ID du cours
   * @param chapitreId ID du chapitre
   * @param userId ID de l'utilisateur
   * @returns Informations sur l'accès au chapitre
   */
  async verifierAccesChapitre(coursId: string, chapitreId: string, userId: string): Promise<{
    canAccess: boolean;
    lockCode?: string;
    reason?: string;
    isPaidChapter: boolean;
    chapterPrice?: number;
    needsPayment: boolean;
    hasCourseEnrollment: boolean;
    hasChapterPurchase: boolean;
  }> {
    console.log('🔧 DEBUG - verifierAccesChapitre');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📄 Chapitre ID: ${chapitreId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      if (!this.chapterAccessService) {
        throw new BadRequestException('Chapter access service indisponible');
      }

      const context = await this.chapterAccessService.buildAccessContext(
        userId,
        coursId,
      );
      const decision = this.chapterAccessService.evaluateChapterAccess(
        context,
        chapitreId,
      );

      if (decision.lockCode === 'chapter_not_found') {
        throw new NotFoundException('Chapitre non trouvé');
      }

      return {
        canAccess: decision.canAccess,
        lockCode: decision.lockCode,
        reason: decision.reason,
        isPaidChapter: decision.isPaidChapter,
        chapterPrice: decision.chapterPrice,
        needsPayment: decision.needsPayment,
        hasCourseEnrollment: decision.hasCourseEnrollment,
        hasChapterPurchase: decision.hasChapterPurchase,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Erreur lors de la vérification d\'accès au chapitre');
    }
  }

  /**
   * S'inscrire à un cours
   * @param coursId ID du cours
   * @param userId ID de l'utilisateur
   * @returns Message de confirmation
   */
  async inscrireAuCours(coursId: string, userId: string, promoCode?: string, session: any = null): Promise<{ message: string; enrollment: any }> {
    console.log('🔧 DEBUG - Début inscrireAuCours');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le cours existe et est publié
      let cours: CoursDocument | null = null;

      // Essayer par _id si c'est un ObjectId valide
      if (Types.ObjectId.isValid(coursId)) {
        cours = await this.coursModel.findById(coursId).session(session);
      }

      // Fallback: essayer par champ custom "id"
      if (!cours) {
        cours = await this.coursModel.findOne({ id: coursId }).session(session);
      }

      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      const courseObjectId = cours._id;

      if (!cours.isPublished) {
        throw new BadRequestException('Ce cours n\'est pas encore publié');
      }

      console.log(`   ✅ Cours trouvé: ${cours.titre}`);
      console.log(`   🏢 Community ID: ${cours.communityId}`);

      // 2. Standalone purchase: pas d'obligation d'appartenir à la communauté
      const userObjectId = new Types.ObjectId(userId);
      console.log('   ✅ Standalone enrollment autorisé (pas d\'exigence de membership)');

      // 3. Enrollment is independent from course-level payment.
      // Chapter-level access/payment is enforced separately by chapter entitlement checks.

      // 4. Vérifier si l'utilisateur n'est pas déjà inscrit
      const inscriptionExistante = await this.courseEnrollmentModel.findOne({
        userId: userObjectId,
        courseId: courseObjectId,
        isActive: true
      }).session(session);

      if (inscriptionExistante) {
        const existingEnrollmentResponse = {
          message: 'Vous êtes déjà inscrit à ce cours',
          enrollment: {
            id: inscriptionExistante.id,
            userId: inscriptionExistante.userId.toString(),
            courseId: cours.id, // Use custom id field
            enrolledAt: inscriptionExistante.enrolledAt,
            isActive: inscriptionExistante.isActive,
          },
        };

        console.log('   ⚠️ Already enrolled - returning existing enrollment');
        console.log('   📤 Enrollment response courseId:', existingEnrollmentResponse.enrollment.courseId);
        console.log('   📤 Course._id:', cours._id.toString());
        console.log('   📤 Course.id field:', cours.id);

        return existingEnrollmentResponse;
      }

      console.log('   ✅ Aucune inscription existante trouvée');

      // 5. Créer la nouvelle inscription
      const nouvelleInscription = new this.courseEnrollmentModel({
        id: new Types.ObjectId().toString(),
        userId: userObjectId,
        courseId: courseObjectId,
        enrolledAt: new Date(),
        isActive: true,
        progression: []
      });

      const inscriptionEnregistree = await nouvelleInscription.save({ session });

      console.log(`   ✅ Inscription créée: ${inscriptionEnregistree._id}`);

      // 6. Ajouter la référence de l'inscription au cours
      cours.ajouterInscription(inscriptionEnregistree._id);
      await cours.save({ session });
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log('   ✅ Référence ajoutée au cours');

      const enrollmentResponse = {
        message: 'Inscription au cours réussie',
        enrollment: {
          id: inscriptionEnregistree.id,
          userId: inscriptionEnregistree.userId.toString(),
          courseId: cours.id, // Use custom id field - frontend uses this for routing
          enrolledAt: inscriptionEnregistree.enrolledAt,
          isActive: inscriptionEnregistree.isActive,
        },
      };

      console.log('   📤 Enrollment response courseId:', enrollmentResponse.enrollment.courseId);
      console.log('   📤 Course._id:', cours._id.toString());
      console.log('   📤 Course.id field:', cours.id);

      return enrollmentResponse;

    } catch (error) {
      if (this.isTransactionNotSupportedError(error)) {
        throw error;
      }

      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }

      console.error('❌ Erreur lors de l\'inscription au cours:', error);
      throw new BadRequestException('Erreur lors de l\'inscription au cours');
    }
  }

  // ============ TRACKING METHODS ============

  private async resolveCourseTrackingId(coursId: string): Promise<{ trackingId: string; course: any | null }> {
    let course: any | null = null;
    if (Types.ObjectId.isValid(coursId)) {
      course = await this.coursModel.findById(coursId);
    }
    if (!course) {
      course = await this.coursModel.findOne({ id: coursId });
    }
    return { trackingId: course?.id ? String(course.id) : String(coursId), course };
  }

  private estimateCourseDurationSeconds(course: any | null): number | undefined {
    if (!course || !Array.isArray(course.sections)) {
      return undefined;
    }

    const totalMinutes = course.sections.reduce((sectionAcc: number, section: any) => {
      const chapterMinutes = Array.isArray(section?.chapitres)
        ? section.chapitres.reduce((chapterAcc: number, chapter: any) => {
          const rawMinutes = Number(chapter?.duree || 0);
          return chapterAcc + (Number.isFinite(rawMinutes) && rawMinutes > 0 ? rawMinutes : 0);
        }, 0)
        : 0;
      return sectionAcc + chapterMinutes;
    }, 0);

    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
      return undefined;
    }

    return Math.floor(totalMinutes * 60);
  }

  /**
   * Enregistrer une vue d'un cours
   */
  async trackCoursView(coursId: string, userId: string, metadata?: any) {
    const { trackingId } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.trackView(userId, trackingId, TrackableContentType.COURSE, metadata);
  }

  /**
   * Démarrer un cours
   */
  async trackCoursStart(coursId: string, userId: string, metadata?: any) {
    const { trackingId } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.trackStart(userId, trackingId, TrackableContentType.COURSE, metadata);
  }

  /**
   * Marquer un cours comme terminé
   */
  async trackCoursComplete(coursId: string, userId: string, metadata?: any) {
    const { trackingId, course } = await this.resolveCourseTrackingId(coursId);

    // Guardrail: only allow completion tracking when the user has truly completed the course
    // (all chapters completed in the active enrollment). This prevents premature COMPLETE events
    // being sent directly from the client.
    if (course?._id) {
      const enrollment = await this.courseEnrollmentModel.findOne({
        userId: new Types.ObjectId(userId),
        courseId: course._id,
        isActive: true,
      }).lean();

      if (!enrollment) {
        throw new BadRequestException('Inscription au cours non trouvée');
      }

      const allChapters = Array.isArray((course as any).sections)
        ? (course as any).sections.flatMap((section: any) => Array.isArray(section?.chapitres) ? section.chapitres : [])
        : [];

      if (allChapters.length > 0) {
        const incompleteChapters = allChapters.filter((chapter: any) => {
          const progress = (enrollment as any).progression?.find((p: any) => p?.chapterId === chapter?.id);
          return !progress?.isCompleted;
        });

        if (incompleteChapters.length > 0) {
          throw new BadRequestException('Vous devez terminer tous les chapitres avant de terminer le cours');
        }
      }
    }

    const result = await this.trackingService.trackComplete(userId, trackingId, TrackableContentType.COURSE, metadata);

    // Check for achievements after completing a course
    try {
      if (course) {
        await this.achievementService.checkAchievements(userId, course.communityId);
      }
    } catch (error) {
      console.error('Error checking achievements after course completion:', error);
      // Don't fail the tracking if achievement check fails
    }

    return result;
  }

  /**
   * Mettre à jour le temps de visionnage d'un cours
   */
  async updateCoursWatchTime(coursId: string, userId: string, additionalTime: number) {
    const { trackingId, course } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.updateWatchTime(
      userId,
      trackingId,
      TrackableContentType.COURSE,
      additionalTime,
      { maxDurationSeconds: this.estimateCourseDurationSeconds(course) },
    );
  }

  /**
   * Enregistrer un like sur un cours
   */
  async trackCoursLike(coursId: string, userId: string, metadata: Record<string, any> = {}) {
    const { trackingId } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.trackLike(userId, trackingId, TrackableContentType.COURSE, metadata);
  }

  /**
   * Enregistrer un partage d'un cours
   */
  async trackCoursShare(coursId: string, userId: string, metadata: Record<string, any> = {}) {
    const { trackingId } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.trackShare(userId, trackingId, TrackableContentType.COURSE, metadata);
  }

  /**
   * Enregistrer un téléchargement d'un cours
   */
  async trackCoursDownload(coursId: string, userId: string, metadata: Record<string, any> = {}) {
    const { trackingId } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.trackDownload(userId, trackingId, TrackableContentType.COURSE, metadata);
  }

  /**
   * Ajouter un bookmark d'un cours
   */
  async addCoursBookmark(coursId: string, userId: string, bookmarkId: string) {
    const { trackingId } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.addBookmark(userId, trackingId, TrackableContentType.COURSE, bookmarkId);
  }

  /**
   * Retirer un bookmark d'un cours
   */
  async removeCoursBookmark(coursId: string, userId: string, bookmarkId: string) {
    const { trackingId } = await this.resolveCourseTrackingId(coursId);
    return await this.trackingService.removeBookmark(userId, trackingId, TrackableContentType.COURSE, bookmarkId);
  }

  /**
   * Ajouter une note/évaluation d'un cours
   */
  async addCoursRating(coursId: string, userId: string, rating: number, review?: string) {
    // Normalize tracking contentId to MongoDB _id string
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(coursId)) {
      cours = await this.coursModel.findById(coursId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: coursId });
    }
    if (!cours) {
      throw new NotFoundException('Cours non trouvé');
    }

    const contentId = cours._id.toString();
    const progress = await this.trackingService.addRating(
      userId,
      contentId,
      TrackableContentType.COURSE,
      rating,
      review,
    );

    // Persist rating summary on course document for fast listing/cards
    const stats = await this.trackingService.getContentStats(
      contentId,
      TrackableContentType.COURSE,
    );
    cours.averageRating = Number(stats.averageRating || 0);
    cours.ratingCount = Number(stats.totalRatings || 0);
    await cours.save();

    return progress;
  }

  /**
   * Obtenir la progression d'un utilisateur pour un cours
   */
  async getCoursProgress(coursId: string, userId: string) {
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(coursId)) {
      cours = await this.coursModel.findById(coursId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: coursId });
    }
    if (!cours) {
      throw new NotFoundException('Cours non trouvé');
    }

    const courseObjectId = cours._id;
    const userObjectId = new Types.ObjectId(userId);

    // 1. Check for official enrollment in CourseEnrollment collection
    const enrollment = await this.courseEnrollmentModel.findOne({
      userId: userObjectId,
      courseId: courseObjectId,
      isActive: true
    });

    // 2. Get content tracking progress (views, watch time, etc.)
    const trackingId = String(cours.id || courseObjectId.toString());
    let contentProgress = await this.trackingService.getProgress(
      userId,
      trackingId,
      TrackableContentType.COURSE,
    );

    // Legacy fallback for progress rows tracked with Mongo _id.
    if (!contentProgress && trackingId !== courseObjectId.toString()) {
      contentProgress = await this.trackingService.getProgress(
        userId,
        courseObjectId.toString(),
        TrackableContentType.COURSE,
      );
    }

    // 3. Calculate calculated progress percentage
    let progressPercentage = 0;
    if (enrollment && enrollment.progression) {
      const totalChapters = cours.sections?.reduce((acc: number, section: any) =>
        acc + (section.chapitres?.length || 0), 0) || 0;
      const completedChapters = enrollment.progression.filter(p => p.isCompleted).length;
      progressPercentage = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
    } else if (contentProgress) {
      progressPercentage = contentProgress.calculerProgression ? contentProgress.calculerProgression() : 0;
    }

    // 4. Return combined data structure expected by frontend
    if (enrollment) {
      return {
        enrollment: {
          id: enrollment._id.toString(),
          userId: enrollment.userId.toString(),
          courseId: cours.id, // Return custom ID for frontend routing
          enrolledAt: enrollment.enrolledAt,
          isActive: enrollment.isActive,
          progression: enrollment.progression || []
        },
        progress: progressPercentage,
        lastAccessedAt: contentProgress?.lastAccessedAt || enrollment.updatedAt || new Date(),
        contentProgress: contentProgress // Include raw content progress if needed
      };
    }

    // If no enrollment, return just the content tracking info (e.g. for previews)
    return {
      enrollment: null,
      progress: progressPercentage,
      contentProgress: contentProgress
    };
  }

  /**
   * Obtenir les statistiques d'un cours
   */
  async getCoursStats(coursId: string) {
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(coursId)) {
      cours = await this.coursModel.findById(coursId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: coursId });
    }
    if (!cours) {
      throw new NotFoundException('Cours non trouvé');
    }

    const contentId = cours._id.toString();
    return await this.trackingService.getContentStats(
      contentId,
      TrackableContentType.COURSE,
    );
  }

  /**
   * Obtenir tous les avis (reviews) d'un cours
   */
  async getCoursReviews(coursId: string) {
    console.log('🔍 [CoursService] Getting reviews for course:', coursId);

    // Find course to get MongoDB _id
    let course: CoursDocument | null = null;
    if (Types.ObjectId.isValid(coursId)) {
      course = await this.coursModel.findById(coursId);
    }
    if (!course) {
      course = await this.coursModel.findOne({ id: coursId });
    }
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    const contentId = course._id.toString();

    // Get all reviews (ContentProgress with rating)
    const docs = await this.contentProgressModel
      .find({
        contentType: TrackableContentType.COURSE,
        contentId,
        rating: { $gte: 1, $lte: 5 },
      })
      .populate('userId', 'name email profile_picture photo_profil avatar')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    const reviews = (docs || []).map((d: any) => ({
      id: d.id || d._id?.toString(),
      user: {
        id: d.userId?._id?.toString() || d.userId?.toString(),
        name: d.userId?.name || 'Anonymous',
        email: d.userId?.email || '',
        avatar: this.uploadService.ensureAbsoluteUrl(
          d.userId?.avatar ||
          d.userId?.profile_picture ||
          d.userId?.photo_profil ||
          ''
        ),
      },
      rating: d.rating || 0,
      review: d.review || '',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    // Get rating summary
    const stats = await this.trackingService.getContentStats(contentId, TrackableContentType.COURSE);

    console.log(`✅ [CoursService] Found ${reviews.length} reviews`);

    return {
      success: true,
      reviews,
      averageRating: stats.averageRating || 0,
      totalRatings: stats.totalRatings || 0,
    };
  }

  /**
   * Obtenir les progressions d'un utilisateur pour tous ses cours
   */
  async getUserCoursProgress(userId: string, page: number = 1, limit: number = 10) {
    return await this.trackingService.getUserProgressByType(userId, TrackableContentType.COURSE, page, limit);
  }

  /**
   * Obtenir les actions récentes d'un utilisateur sur les cours
   */
  async getUserCoursRecentActions(userId: string, limit: number = 20): Promise<any[]> {
    return await this.trackingService.getUserRecentActions(userId, TrackableContentType.COURSE, limit);
  }

  // ============ SEQUENTIAL PROGRESSION METHODS ============

  /**
   * Activer ou désactiver la progression séquentielle d'un cours
   * @param coursId ID du cours
   * @param enabled Activer ou désactiver
   * @param unlockMessage Message personnalisé pour les chapitres verrouillés
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Cours mis à jour
   */
  async updateSequentialProgression(
    coursId: string,
    enabled: boolean,
    unlockMessage: string | undefined,
    userId: string
  ): Promise<CoursResponseDto> {
    console.log('🔧 DEBUG - updateSequentialProgression');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   🔒 Enabled: ${enabled}`);
    console.log(`   💬 Unlock Message: ${unlockMessage}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.coursModel.findById(coursId);
      if (!cours) {
        throw new NotFoundException('Cours non trouvé');
      }

      // 2. Vérifier que l'utilisateur est admin de la communauté
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());

      // 3. Mettre à jour la progression séquentielle
      if (enabled) {
        cours.activerProgressionSequentielle(unlockMessage);
      } else {
        cours.desactiverProgressionSequentielle();
      }

      const coursEnregistre = await cours.save();
      await this.invalidateCourseCaches(cours.creatorId?.toString?.());

      console.log('   ✅ Progression séquentielle mise à jour avec succès');
      console.log(`   🔒 Sequential Progression: ${coursEnregistre.sequentialProgression}`);

      return await this.transformerEnReponse(coursEnregistre);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors de la mise à jour de la progression séquentielle:', error);
      throw new BadRequestException('Erreur lors de la mise à jour de la progression séquentielle');
    }
  }

  /**
   * Vérifier l'accès à un chapitre avec la progression séquentielle
   * @param coursId ID du cours
   * @param chapitreId ID du chapitre
   * @param userId ID de l'utilisateur
   * @returns Informations sur l'accès au chapitre
   */
  async checkChapterAccessWithSequential(
    coursId: string,
    chapitreId: string,
    userId: string
  ): Promise<{
    hasAccess: boolean;
    canAccess: boolean; // Alias for frontend compatibility
    lockCode?: string;
    reason: string;
    isPaidChapter?: boolean;
    chapterPrice?: number;
    needsPayment?: boolean;
    hasCourseEnrollment?: boolean;
    hasChapterPurchase?: boolean;
    requiredChapter?: {
      id: string;
      titre: string;
      ordre: number;
      sectionId: string;
    };
    unlockMessage?: string;
    nextChapter?: {
      id: string;
      titre: string;
      ordre: number;
      sectionId: string;
    };
  }> {
    console.log('🔧 DEBUG - checkChapterAccessWithSequential');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📄 Chapitre ID: ${chapitreId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      if (!this.chapterAccessService) {
        throw new BadRequestException('Chapter access service indisponible');
      }

      // 1. Récupérer le cours
      const cours = await this.resolveCourseDocument(coursId);

      // 2. Vérifier les permissions spéciales (Admin/Créateur)
      try {
        await this.verifierAdminCommunaute(userId, cours.communityId.toString());
        console.log('   ✅ Accès Admin/Créateur autorisé');
        return {
          hasAccess: true,
          canAccess: true,
          lockCode: 'allowed',
          reason: 'Admin access',
          unlockMessage: undefined
        };
      } catch (e) {
        // Pas admin, continuer
      }

      const context = await this.chapterAccessService.buildAccessContext(
        userId,
        cours,
      );
      const decision = this.chapterAccessService.evaluateChapterAccess(
        context,
        chapitreId,
      );

      if (decision.lockCode === 'chapter_not_found') {
        throw new NotFoundException('Chapitre non trouvé');
      }

      return {
        hasAccess: decision.canAccess,
        canAccess: decision.canAccess,
        lockCode: decision.lockCode,
        reason: decision.reason,
        isPaidChapter: decision.isPaidChapter,
        chapterPrice: decision.chapterPrice,
        needsPayment: decision.needsPayment,
        hasCourseEnrollment: decision.hasCourseEnrollment,
        hasChapterPurchase: decision.hasChapterPurchase,
        requiredChapter: decision.requiredChapter ? {
          id: decision.requiredChapter.id,
          titre: decision.requiredChapter.titre,
          ordre: decision.requiredChapter.ordre,
          sectionId: decision.requiredChapter.sectionId,
        } : undefined,
        unlockMessage: cours.unlockMessage,
        nextChapter: decision.nextChapter ? {
          id: decision.nextChapter.id,
          titre: decision.nextChapter.titre,
          ordre: decision.nextChapter.ordre,
          sectionId: decision.nextChapter.sectionId,
        } : undefined,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('❌ Erreur lors de la vérification d\'accès au chapitre:', error);
      throw new BadRequestException('Erreur lors de la vérification d\'accès au chapitre');
    }
  }

  /**
   * Obtenir les chapitres déverrouillés pour un utilisateur
   * @param coursId ID du cours
   * @param userId ID de l'utilisateur
   * @returns Liste des chapitres déverrouillés
   */
  async getUnlockedChapters(coursId: string, userId: string): Promise<{
    unlockedChapters: Array<{
      id: string;
      titre: string;
      ordre: number;
      sectionId: string;
      sectionTitre: string;
      isCompleted: boolean;
      isUnlocked: boolean;
    }>;
    sequentialProgressionEnabled: boolean;
    unlockMessage?: string;
  }> {
    console.log('🔧 DEBUG - getUnlockedChapters');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      if (!this.chapterAccessService) {
        throw new BadRequestException('Chapter access service indisponible');
      }

      // 1. Récupérer le cours
      const cours = await this.resolveCourseDocument(coursId);

      // 2. Vérifier si l'utilisateur est admin/créateur
      let isAdmin = false;
      try {
        await this.verifierAdminCommunaute(userId, cours.communityId.toString());
        isAdmin = true;
      } catch (e) {
        // Not admin
      }

      const context = await this.chapterAccessService.buildAccessContext(
        userId,
        cours,
      );

      // 4. Construire la liste des chapitres avec leur statut
      const unlockedChapters: Array<{
        id: string;
        titre: string;
        ordre: number;
        sectionId: string;
        sectionTitre: string;
        isCompleted: boolean;
        isUnlocked: boolean;
      }> = [];
      for (const descriptor of context.orderedChapters) {
        const chapterId = String(descriptor.chapter?.id || '');
        const decision = isAdmin
          ? {
              canAccess: true,
            }
          : this.chapterAccessService.evaluateChapterAccess(context, chapterId);

        const progress = context.progressMap.get(chapterId);
        unlockedChapters.push({
          id: chapterId,
          titre: String(descriptor.chapter?.titre || ''),
          ordre: Number(descriptor.chapter?.ordre || 0),
          sectionId: String(descriptor.section?.id || ''),
          sectionTitre: String(descriptor.section?.titre || ''),
          isCompleted: Boolean(progress?.isCompleted),
          isUnlocked: Boolean(decision.canAccess),
        });
      }

      console.log(`   ✅ ${unlockedChapters.length} chapitres analysés`);
      console.log(`   🔓 ${unlockedChapters.filter(c => c.isUnlocked).length} chapitres déverrouillés`);

      return {
        unlockedChapters,
        sequentialProgressionEnabled: Boolean(cours.sequentialProgression),
        unlockMessage: cours.unlockMessage
      };

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('❌ Erreur lors de la récupération des chapitres déverrouillés:', error);
      throw new BadRequestException('Erreur lors de la récupération des chapitres déverrouillés');
    }
  }

  /**
   * Returns a normalized course session covering chapter access, progression,
   * and next-chapter action in a single backend-authoritative response.
   */
  async getCourseSession(
    coursId: string,
    userId: string,
    currentChapterId?: string,
  ): Promise<CourseSessionDto> {
    if (!this.chapterAccessService) {
      throw new BadRequestException('Chapter access service indisponible');
    }

    const cours = await this.resolveCourseDocument(coursId);

    // Admin/Creator bypass
    let isAdmin = false;
    try {
      await this.verifierAdminCommunaute(userId, cours.communityId.toString());
      isAdmin = true;
    } catch {
      // Not admin
    }

    const context = await this.chapterAccessService.buildAccessContext(userId, cours);
    const allChapterAccess = isAdmin
      ? context.orderedChapters.map((descriptor) => {
          const chapterId = String(descriptor.chapter?.id || '');
          const progress = context.progressMap.get(chapterId);
          return {
            chapterId,
            chapterTitle: String(descriptor.chapter?.titre || ''),
            sectionId: String(descriptor.section?.id || ''),
            sectionTitle: String(descriptor.section?.titre || ''),
            index: descriptor.index,
            isPreview: Boolean(descriptor.chapter?.isPreview),
            isPaidChapter: Boolean(descriptor.chapter?.isPaidChapter) && !descriptor.chapter?.isPreview,
            isCompleted: Boolean(progress?.isCompleted),
            watchTime: Number(progress?.watchTime || 0),
            videoDuration: Number((progress as any)?.videoDuration || 0),
            access: {
              canAccess: true,
              lockCode: 'allowed' as const,
              reason: 'admin_access',
              hasCourseEnrollment: true,
              hasChapterPurchase: true,
              isPaidChapter: false,
              needsPayment: false,
            },
          };
        })
      : this.chapterAccessService.computeAllChapterAccess(context);

    const chapters = allChapterAccess.map((entry) => ({
      chapterId: entry.chapterId,
      chapterTitle: entry.chapterTitle,
      sectionId: entry.sectionId,
      sectionTitle: entry.sectionTitle,
      index: entry.index,
      isPreview: entry.isPreview,
      isPaidChapter: entry.isPaidChapter,
      isCompleted: entry.isCompleted,
      watchTime: entry.watchTime,
      videoDuration: entry.videoDuration,
      canAccess: entry.access.canAccess,
      lockCode: entry.access.lockCode,
      lockReason: entry.access.canAccess ? undefined : entry.access.reason,
      needsPayment: entry.access.needsPayment || undefined,
      chapterPrice: entry.access.chapterPrice,
      requiredChapterId: entry.access.requiredChapter?.id,
    }));

    const completedChapters = chapters.filter((c) => c.isCompleted).length;
    const totalChapters = chapters.length;
    const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

    // Determine current chapter for next-action resolution
    const effectiveCurrentChapterId =
      currentChapterId ||
      (chapters.find((c) => !c.isCompleted && c.canAccess)?.chapterId ?? chapters[0]?.chapterId);

    let nextChapterAction: CourseSessionDto['nextChapterAction'] | undefined;
    if (effectiveCurrentChapterId && !isAdmin) {
      const action = this.chapterAccessService.resolveNextChapterAction(context, effectiveCurrentChapterId);
      nextChapterAction = {
        action: action.action,
        chapterId: action.chapterId,
        chapterTitle: action.chapterTitle,
        sectionId: action.sectionId,
        lockCode: action.lockCode,
        reason: action.reason,
        needsPayment: action.needsPayment,
        chapterPrice: action.chapterPrice,
        requiredChapterId: action.requiredChapter?.id,
      };
    }

    return {
      courseId: String(cours.id || cours._id),
      isEnrolled: Boolean(context.enrollment),
      sequentialProgressionEnabled: Boolean(cours.sequentialProgression),
      unlockMessage: cours.unlockMessage,
      progressPercent,
      completedChapters,
      totalChapters,
      chapters,
      nextChapterAction,
    };
  }

  /**
   * Déverrouiller manuellement un chapitre (pour les créateurs/admins)
   * @param coursId ID du cours
   * @param chapitreId ID du chapitre à déverrouiller
   * @param userId ID de l'utilisateur cible
   * @param creatorId ID du créateur/admin qui effectue l'action
   * @returns Message de confirmation
   */
  async unlockChapterManually(
    coursId: string,
    chapitreId: string,
    userId: string,
    creatorId: string
  ): Promise<{ message: string }> {
    console.log('🔧 DEBUG - unlockChapterManually');
    console.log(`   📋 Cours ID: ${coursId}`);
    console.log(`   📄 Chapitre ID: ${chapitreId}`);
    console.log(`   👤 Target User ID: ${userId}`);
    console.log(`   👨‍💼 Creator ID: ${creatorId}`);

    try {
      // 1. Vérifier que le cours existe
      const cours = await this.resolveCourseDocument(coursId);

      // 2. Vérifier que le créateur est admin de la communauté
      await this.verifierAdminCommunaute(creatorId, cours.communityId.toString());

      // 3. Récupérer l'inscription de l'utilisateur
      const enrollment = await this.courseEnrollmentModel.findOne({
        userId: new Types.ObjectId(userId),
        courseId: cours._id,
        isActive: true
      });

      if (!enrollment) {
        throw new NotFoundException('Utilisateur non inscrit à ce cours');
      }

      // 4. Créer ou mettre à jour la progression pour ce chapitre
      let progression = enrollment.progression.find(p => p.chapterId === chapitreId);

      if (!progression) {
        progression = {
          id: new Types.ObjectId().toString(),
          enrollmentId: enrollment._id,
          chapterId: chapitreId,
          isCompleted: false,
          watchTime: 0,
          lastAccessedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        enrollment.progression.push(progression as any);
      }

      // 5. Marquer le chapitre comme accessible (mais pas forcément complété)
      progression.lastAccessedAt = new Date();
      progression.updatedAt = new Date();
      await enrollment.save();

      console.log('   ✅ Chapitre déverrouillé manuellement avec succès');

      return {
        message: 'Chapitre déverrouillé avec succès'
      };

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ Erreur lors du déverrouillage manuel du chapitre:', error);
      throw new BadRequestException('Erreur lors du déverrouillage manuel du chapitre');
    }
  }

  // ============ USER NOTES METHODS ============

  /**
   * Créer une note utilisateur
   */
  async createUserNote(userId: string, courseId: string, createDto: CreateUserNoteDto) {
    // Resolve courseId (string or ObjectId) to ObjectId
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

    const newNote = new this.userCourseNoteModel({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      chapterId: createDto.chapterId,
      content: createDto.content,
      timestamp: createDto.timestamp,
    });

    return await newNote.save();
  }

  /**
   * Récupérer les notes d'un utilisateur pour un cours
   */
  async getUserNotes(userId: string, courseId: string) {
    // Resolve courseId
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

    return await this.userCourseNoteModel.find({
      userId: new Types.ObjectId(userId),
      courseId: course._id
    }).sort({ createdAt: -1 });
  }

  /**
   * Mettre à jour une note utilisateur
   */
  async updateUserNote(userId: string, noteId: string, updateDto: UpdateUserNoteDto) {
    const note = await this.userCourseNoteModel.findOne({
      _id: noteId,
      userId: new Types.ObjectId(userId)
    });

    if (!note) {
      throw new NotFoundException('Note non trouvée');
    }

    if (updateDto.content) note.content = updateDto.content;
    if (updateDto.timestamp !== undefined) note.timestamp = updateDto.timestamp;

    note.updatedAt = new Date();
    return await note.save();
  }

  /**
   * Supprimer une note utilisateur
   */
  async deleteUserNote(userId: string, noteId: string) {
    const result = await this.userCourseNoteModel.deleteOne({
      _id: noteId,
      userId: new Types.ObjectId(userId)
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Note non trouvée');
    }

    return { success: true };
  }
}
