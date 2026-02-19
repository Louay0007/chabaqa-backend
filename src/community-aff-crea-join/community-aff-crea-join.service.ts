import { Injectable, ConflictException, NotFoundException, InternalServerErrorException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument, UserRole } from '../schema/user.schema';
import { CreateCommunityDto } from '../dto-community/create-community.dto';
import { JoinCommunityDto, JoinByInviteDto, GenerateInviteDto } from '../dto-community/join-community.dto';
import { UpdateCommunityCustomizationDto } from '../dto-community/update-community-customization.dto';
import { UploadService } from '../upload/upload.service';
import { PolicyService } from '../common/services/policy.service';
import { PromoService } from '../common/services/promo.service';
import { FeeService } from '../common/services/fee.service';
import { TrackableContentType, ContentProgressDocument } from '../schema/content-tracking.schema';
import { NotificationService } from '../notification/notification.service';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@Injectable()
export class CommunityAffCreaJoinService {
  constructor(
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    @InjectModel('ContentProgress') private contentProgressModel: Model<ContentProgressDocument>,
    private readonly uploadService: UploadService,
    private readonly policyService: PolicyService,
    private readonly promoService: PromoService,
    private readonly feeService: FeeService,
    private readonly notificationService: NotificationService,
    private readonly trackingService: ContentTrackingService,
  ) { }

  private getModelIfRegistered<T = any>(connection: Connection, modelName: string): Model<T> | null {
    return connection.modelNames().includes(modelName) ? (connection.model(modelName) as Model<T>) : null;
  }

  /**
   * Créer une nouvelle communauté
   * @param createCommunityDto - Données de la communauté à créer selon l'interface CommunityFormData
   * @param uploadedFiles - Fichiers uploadés traités
   * @param userId - ID de l'utilisateur créateur
   * @returns La communauté créée et l'utilisateur mis à jour
   */
  async createCommunity(createCommunityDto: CreateCommunityDto, uploadedFiles: { logo?: string }, userId: string): Promise<{ community: any, user: UserDocument }> {
    try {
      // Debug: Log de l'ID utilisateur reçu
      console.log('🔍 Debug - ID utilisateur reçu:', userId, 'Type:', typeof userId);
      console.log('🚀 Création de communauté avec logo intégré');
      console.log('   Logo:', uploadedFiles.logo);
      console.log('   Cover Image from DTO:', createCommunityDto.coverImage);

      // Intégrer le logo dans les données de la communauté (même pattern que le thumbnail)
      const communityDataAvecLogo = {
        ...createCommunityDto,
        logo: uploadedFiles.logo || createCommunityDto.logo
      };
      
      console.log('🖼️ [CREATE COMMUNITY] Cover image URL:', communityDataAvecLogo.coverImage);

      // Vérifier si l'utilisateur existe
      const user = await this.userModel.findById(userId);
      console.log('🔍 Debug - Utilisateur trouvé:', user ? 'Oui' : 'Non');

      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      // Vérifier les quotas: nombre de communautés du créateur
      const createdCount = await this.communityModel.countDocuments({ createur: new Types.ObjectId(userId) });
      const canCreate = await this.policyService.canCreateAnotherCommunity(userId, createdCount);
      if (!canCreate) {
        throw new ForbiddenException('Limite de communautés atteinte pour votre plan. Veuillez mettre à niveau.');
      }

      // Vérifier si une communauté avec ce nom existe déjà
      const existingCommunity = await this.communityModel.findOne({ name: communityDataAvecLogo.name });
      if (existingCommunity) {
        throw new ConflictException('Une communauté avec ce nom existe déjà');
      }

      // Validation des liens sociaux - au moins un lien requis
      const socialLinks = communityDataAvecLogo.socialLinks || {};
      console.log('🔍 [SERVICE] Social links:', JSON.stringify(socialLinks, null, 2));

      const hasAtLeastOneLink = Object.values(socialLinks).some(link => link && link.trim() !== '');

      if (!hasAtLeastOneLink) {
        throw new BadRequestException('Au moins un lien social est requis pour créer une communauté');
      }

      // Générer un slug unique à partir du nom
      const slug = communityDataAvecLogo.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      // Vérifier l'unicité du slug
      let uniqueSlug = slug;
      let counter = 1;
      while (await this.communityModel.findOne({ slug: uniqueSlug })) {
        uniqueSlug = `${slug}-${counter}`;
        counter++;
      }

      // Parser le montant en nombre
      const feeAmount = parseFloat(communityDataAvecLogo.feeAmount) || 0;

      // Mapper les données de CommunityFormData vers le schéma Community - 100% compatible frontend
      const communityData = {
        name: communityDataAvecLogo.name,
        slug: uniqueSlug,
        short_description: communityDataAvecLogo.bio || `Communauté ${communityDataAvecLogo.name}`,
        country: communityDataAvecLogo.country,

        // Mappage des paramètres d'accès
        isPrivate: communityDataAvecLogo.status === 'private',
        fees_of_join: communityDataAvecLogo.joinFee === 'paid' ? feeAmount : 0,
        currency: communityDataAvecLogo.currency,

        // Liens sociaux dans les settings - tous les champs frontend
        settings: {
          socialLinks: {
            instagram: socialLinks.instagram || '',
            tiktok: socialLinks.tiktok || '',
            facebook: socialLinks.facebook || '',
            youtube: socialLinks.youtube || '',
            linkedin: socialLinks.linkedin || '',
            website: socialLinks.website || '',
            twitter: socialLinks.twitter || '',
            discord: socialLinks.discord || '',
            behance: socialLinks.behance || '',
            github: socialLinks.github || '',
          },
          // Settings par défaut pour compatibilité frontend
          primaryColor: '#3b82f6',
          secondaryColor: '#1e40af',
          welcomeMessage: `Bienvenue dans ${communityDataAvecLogo.name} !`,
          features: ['Cours exclusifs', 'Support communautaire', 'Ressources premium'],
          benefits: ['Accès complet', 'Support prioritaire', 'Ressources exclusives'],
          template: 'modern',
          fontFamily: 'Inter',
          borderRadius: 12,
          backgroundStyle: 'gradient',
          heroLayout: 'centered',
          headerStyle: 'default',
          contentWidth: 'normal',
          showStats: true,
          showHero: true,
          showFeatures: true,
          showBenefits: true,
          showTestimonials: true,
          showPosts: true,
          showFAQ: true,
          enableAnimations: true,
          enableParallax: false,
          logo: this.uploadService.ensureAbsoluteUrl(
            communityDataAvecLogo.logo || 'https://via.placeholder.com/150'
          ),
          heroBackground: 'https://via.placeholder.com/1200x600',
          gallery: [],
          videoUrl: '',
          customSections: [],
          metaTitle: `${communityDataAvecLogo.name} - Communauté`,
          metaDescription: communityDataAvecLogo.bio || `Rejoignez ${communityDataAvecLogo.name} pour apprendre et partager.`,
          customDomain: '',
          headerScripts: '',
        },

        // Relations utilisateur
        createur: new Types.ObjectId(userId),
        members: [new Types.ObjectId(userId)],
        admins: [new Types.ObjectId(userId)],
        membersCount: 1,

        // Valeurs par défaut pour les champs requis du schéma avec URLs absolues
        logo: this.uploadService.ensureAbsoluteUrl(
          communityDataAvecLogo.logo || socialLinks.website || socialLinks.instagram || socialLinks.facebook || 'https://via.placeholder.com/150'
        ),
        photo_de_couverture: communityDataAvecLogo.coverImage && communityDataAvecLogo.coverImage.trim() 
          ? this.uploadService.ensureAbsoluteUrl(communityDataAvecLogo.coverImage)
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(communityDataAvecLogo.name)}&size=600&background=8e78fb&color=ffffff&format=png`,
        creatorAvatar: this.uploadService.ensureAbsoluteUrl(
          user.profile_picture || 'https://via.placeholder.com/100'
        ),
        category: communityDataAvecLogo.category || 'Général',
        priceType: communityDataAvecLogo.pricing?.priceType || (communityDataAvecLogo.joinFee === 'paid' ? 'one-time' : 'free'),
        image: this.uploadService.ensureAbsoluteUrl(
          communityDataAvecLogo.image || 'https://via.placeholder.com/600x400'
        ),
        tags: communityDataAvecLogo.tags || [communityDataAvecLogo.country],
        featured: false,

        // Valeurs par défaut système
        long_description: [],
        rank: 0,
        isActive: true,
        isVerified: false,
        cours: [],

        // ============ Champs supplémentaires pour compatibilité frontend ============
        longDescription: communityDataAvecLogo.longDescription || communityDataAvecLogo.bio || `Bienvenue dans ${communityDataAvecLogo.name}, une communauté dédiée à l'apprentissage et au partage.`,
        coverImage: communityDataAvecLogo.coverImage && communityDataAvecLogo.coverImage.trim() 
          ? this.uploadService.ensureAbsoluteUrl(communityDataAvecLogo.coverImage)
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(communityDataAvecLogo.name)}&size=600&background=8e78fb&color=ffffff&format=png`,
        rating: 0,
        price: communityDataAvecLogo.joinFee === 'paid' ? feeAmount : 0,
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };

      const community = new this.communityModel(communityData);

      // Générer automatiquement un inviteCode unique pour éviter les conflits
      community.inviteCode = community.generateInviteCode();

      // Si la communauté est privée, générer un lien d'invitation par défaut
      if (community.isPrivate) {
        // Use a default base URL if not available, will be updated when generated properly via API
        const baseUrl = process.env.FRONTEND_URL || 'https://chabaqa.com';
        community.inviteLink = `${baseUrl}/invite/${community.inviteCode}`;
      }

      const savedCommunity = await community.save();

      // Log de confirmation si le logo a été intégré
      if (uploadedFiles.logo) {
        console.log(`✅ Logo intégré avec succès: ${uploadedFiles.logo}`);
      }

      // Mettre à jour l'utilisateur avec la nouvelle communauté et changer son rôle en creator
      console.log('🔄 Mise à jour du rôle utilisateur vers CREATOR...');

      const updateData: any = {
        $addToSet: {
          createdCommunities: savedCommunity._id,
          joinedCommunities: savedCommunity._id,
          adminCommunities: savedCommunity._id,
        }
      };

      // Only upgrade role to CREATOR if the user is currently a regular USER
      // This prevents overwriting other roles or downgrading special roles
      if (user.role === UserRole.USER) {
        updateData.role = UserRole.CREATOR;
      }

      const updatedUser = await this.userModel.findByIdAndUpdate(
        userId,
        updateData,
        { new: true }
      ).exec();

      if (!updatedUser) {
        throw new InternalServerErrorException('Erreur lors de la mise à jour de l\'utilisateur');
      }

      console.log('✅ Rôle utilisateur mis à jour:', {
        userId: updatedUser?._id,
        newRole: updatedUser?.role,
        createdCommunities: updatedUser?.createdCommunities?.length
      });

      // Retourner la communauté avec les relations peuplées
      const populatedCommunity = await this.communityModel
        .findById(savedCommunity._id)
        .populate('createur', 'name email profile_picture photo_profil avatar photo')
        .populate('members', 'name email profile_picture photo_profil avatar photo')
        .populate('admins', 'name email profile_picture photo_profil avatar photo')
        .exec();

      if (!populatedCommunity) {
        throw new InternalServerErrorException('Erreur lors de la récupération de la communauté créée');
      }

      // Recalculer les rangs après la création
      await this.updateCommunityRanks();

      // Transformer la réponse pour être 100% compatible avec le frontend
      const transformedCommunity = this.transformCommunityForFrontend(populatedCommunity);
      
      return {
        community: transformedCommunity,
        user: updatedUser
      };

    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      console.error('Erreur lors de la création de la communauté:', error);
      throw new InternalServerErrorException('Erreur lors de la création de la communauté');
    }
  }

  /**
   * Transformer une communauté pour être 100% compatible avec le frontend
   * @param community - Communauté à transformer
   * @returns Communauté transformée pour le frontend
   */
  private normalizeStringList(
    value: unknown,
    maxItems: number,
    maxItemLength: number,
  ): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }
      const trimmed = item.trim();
      if (!trimmed) {
        continue;
      }

      const normalized = trimmed.slice(0, maxItemLength);
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(normalized);

      if (result.length >= maxItems) {
        break;
      }
    }

    return result;
  }

  private normalizeCommunitySettings(communityName: string, rawSettings: any = {}) {
    const settings = rawSettings || {};
    const primaryColor = typeof settings.primaryColor === 'string' ? settings.primaryColor : '#3b82f6';
    const secondaryColor =
      typeof settings.secondaryColor === 'string' ? settings.secondaryColor : '#1e40af';
    const normalizedDomain =
      typeof settings.customDomain === 'string'
        ? settings.customDomain.trim().toLowerCase()
        : '';

    return {
      primaryColor,
      secondaryColor,
      welcomeMessage:
        typeof settings.welcomeMessage === 'string' && settings.welcomeMessage.trim()
          ? settings.welcomeMessage.trim().slice(0, 1000)
          : `Bienvenue dans ${communityName} !`,
      features: this.normalizeStringList(settings.features, 20, 160),
      benefits: this.normalizeStringList(settings.benefits, 20, 220),
      template: settings.template || 'modern',
      fontFamily: settings.fontFamily || 'Inter',
      borderRadius: typeof settings.borderRadius === 'number' ? settings.borderRadius : 12,
      backgroundStyle: settings.backgroundStyle || 'gradient',
      heroLayout: settings.heroLayout || 'centered',
      headerStyle: settings.headerStyle || 'default',
      contentWidth: settings.contentWidth || 'normal',
      showStats: settings.showStats ?? true,
      showHero: settings.showHero ?? true,
      showFeatures: settings.showFeatures ?? true,
      showBenefits: settings.showBenefits ?? true,
      showTestimonials: settings.showTestimonials ?? true,
      showPosts: settings.showPosts ?? true,
      showFAQ: settings.showFAQ ?? true,
      enableAnimations: settings.enableAnimations ?? true,
      enableParallax: settings.enableParallax ?? false,
      logo:
        typeof settings.logo === 'string' && settings.logo.trim()
          ? this.uploadService.ensureAbsoluteUrl(settings.logo)
          : '',
      heroBackground:
        typeof settings.heroBackground === 'string' && settings.heroBackground.trim()
          ? this.uploadService.ensureAbsoluteUrl(settings.heroBackground)
          : '',
      gallery: Array.isArray(settings.gallery)
        ? settings.gallery
            .filter((url: any) => typeof url === 'string' && url.trim() !== '')
            .map((url: string) => this.uploadService.ensureAbsoluteUrl(url))
        : [],
      videoUrl: typeof settings.videoUrl === 'string' ? settings.videoUrl : '',
      socialLinks: {
        twitter: settings.socialLinks?.twitter || '',
        instagram: settings.socialLinks?.instagram || '',
        linkedin: settings.socialLinks?.linkedin || '',
        discord: settings.socialLinks?.discord || '',
        behance: settings.socialLinks?.behance || '',
        github: settings.socialLinks?.github || '',
        facebook: settings.socialLinks?.facebook || '',
        youtube: settings.socialLinks?.youtube || '',
        tiktok: settings.socialLinks?.tiktok || '',
        website: settings.socialLinks?.website || '',
      },
      customSections: Array.isArray(settings.customSections) ? settings.customSections : [],
      metaTitle:
        typeof settings.metaTitle === 'string' && settings.metaTitle.trim()
          ? settings.metaTitle
          : `${communityName} - Communauté`,
      metaDescription:
        typeof settings.metaDescription === 'string' && settings.metaDescription.trim()
          ? settings.metaDescription
          : '',
      customDomain: normalizedDomain,
      headerScripts: typeof settings.headerScripts === 'string' ? settings.headerScripts : '',
    };
  }

  private transformCommunityForFrontend(community: CommunityDocument): any {
    const normalizedSettings = this.normalizeCommunitySettings(community.name, community.settings || {});
    const membersArrayCount = Array.isArray((community as any).members)
      ? (community as any).members.length
      : 0;
    const storedMembersCount =
      typeof (community as any).membersCount === 'number' ? (community as any).membersCount : 0;
    const membersCount = Math.max(storedMembersCount, membersArrayCount, 0);
    const averageRatingValue =
      typeof (community as any).averageRating === 'number'
        ? (community as any).averageRating
        : typeof (community as any).rating === 'number'
          ? (community as any).rating
          : 0;
    const ratingCountValue =
      typeof (community as any).ratingCount === 'number' ? (community as any).ratingCount : 0;

    // Extract logo with proper fallback chain and ensure absolute URL
    const logoUrl = this.uploadService.ensureAbsoluteUrl(
      normalizedSettings.logo ||
      community.logo ||
      'https://via.placeholder.com/150?text=Community'
    );

    // DEBUG: Log the raw creator data
    console.log('🔍 [TRANSFORM] Processing community:', community.name);
    console.log('🔍 [TRANSFORM] Raw createur object:', {
      id: (community.createur as any)?._id || community.createur,
      name: (community.createur as any)?.name,
      profile_picture: (community.createur as any)?.profile_picture,
      photo_profil: (community.createur as any)?.photo_profil,
    });
    console.log('🔍 [TRANSFORM] Stored creatorAvatar field:', community.creatorAvatar);

    // Get creator avatar with proper fallback chain
    const rawProfilePic = (community.createur as any)?.profile_picture;
    const rawPhotoProfil = (community.createur as any)?.photo_profil;
    const rawAvatar = (community.createur as any)?.avatar;
    const rawPhoto = (community.createur as any)?.photo;
    const rawCreatorAvatar = community.creatorAvatar;

    const selectedRawUrl = rawProfilePic || rawPhotoProfil || rawAvatar || rawPhoto || rawCreatorAvatar || '';
    console.log('🔍 [TRANSFORM] Selected raw URL:', selectedRawUrl);

    const creatorAvatarUrl = this.uploadService.ensureAbsoluteUrl(selectedRawUrl);
    console.log('🔍 [TRANSFORM] After ensureAbsoluteUrl:', creatorAvatarUrl);

    // Final avatar with fallback
    const finalAvatar = creatorAvatarUrl || 'https://placehold.co/64x64?text=U';
    console.log('🔍 [TRANSFORM] Final avatar URL:', finalAvatar);

    // Get cover image with proper fallback chain
    const rawCoverImage = community.photo_de_couverture || community.coverImage || normalizedSettings.heroBackground || '';
    let coverImageUrl = '';
    
    if (rawCoverImage && rawCoverImage.trim() !== '') {
      coverImageUrl = this.uploadService.ensureAbsoluteUrl(rawCoverImage);
    } else {
      // If no cover image, use creator avatar as fallback, or generate placeholder
      const creatorAvatar = (community.createur as any)?.profile_picture || (community.createur as any)?.photo_profil || community.creatorAvatar;
      if (creatorAvatar && creatorAvatar.trim() !== '') {
        coverImageUrl = this.uploadService.ensureAbsoluteUrl(creatorAvatar);
      } else {
        coverImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(community.name)}&size=600&background=8e78fb&color=ffffff&format=png`;
      }
    }
    
    console.log('🖼️ [TRANSFORM] Cover image debug:', {
      photo_de_couverture: community.photo_de_couverture,
      coverImage: community.coverImage,
      heroBackground: community.settings?.heroBackground,
      creatorAvatar: (community.createur as any)?.profile_picture,
      selectedRaw: rawCoverImage,
      finalUrl: coverImageUrl,
    });

    return {
      _id: community._id,
      id: community._id.toString(),
      slug: community.slug,
      name: community.name,
      logo: logoUrl, // ✨ Top-level logo field for easy access
      creator: {
        id: community.createur.toString(),
        name: (community.createur as any)?.name || 'Unknown Creator',
        avatar: finalAvatar,
        // Also include raw fields for mobile to try extracting
        profile_picture: creatorAvatarUrl,
        photo_profil: creatorAvatarUrl,
        verified: false, // TODO: Add verified status
      },
      creatorId: community.createur.toString(),
      creatorAvatar: finalAvatar,
      description: community.short_description,
      longDescription: community.longDescription || community.short_description,
      coverImage: coverImageUrl,
      photo_de_couverture: coverImageUrl,
      image: this.uploadService.ensureAbsoluteUrl(community.image),
      category: community.category,
      members: membersCount,
      membersCount,
      rating: averageRatingValue,
      averageRating: averageRatingValue,
      ratingCount: ratingCountValue,
      price: community.price || community.fees_of_join,
      priceType: community.priceType,
      tags: community.tags,
      featured: community.featured,
      verified: community.isVerified,
      createdDate: community.createdDate || community.createdAt.toISOString(),
      updatedDate: community.updatedDate || community.updatedAt.toISOString(),
      settings: {
        primaryColor: normalizedSettings.primaryColor,
        secondaryColor: normalizedSettings.secondaryColor,
        welcomeMessage: normalizedSettings.welcomeMessage,
        features: normalizedSettings.features,
        benefits: normalizedSettings.benefits,
        template: normalizedSettings.template,
        fontFamily: normalizedSettings.fontFamily,
        borderRadius: normalizedSettings.borderRadius,
        backgroundStyle: normalizedSettings.backgroundStyle,
        heroLayout: normalizedSettings.heroLayout,
        headerStyle: normalizedSettings.headerStyle,
        contentWidth: normalizedSettings.contentWidth,
        showStats: normalizedSettings.showStats,
        showHero: normalizedSettings.showHero,
        showFeatures: normalizedSettings.showFeatures,
        showBenefits: normalizedSettings.showBenefits,
        showTestimonials: normalizedSettings.showTestimonials,
        showPosts: normalizedSettings.showPosts,
        showFAQ: normalizedSettings.showFAQ,
        enableAnimations: normalizedSettings.enableAnimations,
        enableParallax: normalizedSettings.enableParallax,
        logo: logoUrl, // Use the same logo URL for consistency
        heroBackground: this.uploadService.ensureAbsoluteUrl(
          normalizedSettings.heroBackground || 'https://via.placeholder.com/1200x600'
        ),
        gallery: (normalizedSettings.gallery || []).map(url => this.uploadService.ensureAbsoluteUrl(url)),
        videoUrl: normalizedSettings.videoUrl || '',
        socialLinks: {
          twitter: normalizedSettings.socialLinks?.twitter || '',
          instagram: normalizedSettings.socialLinks?.instagram || '',
          linkedin: normalizedSettings.socialLinks?.linkedin || '',
          discord: normalizedSettings.socialLinks?.discord || '',
          behance: normalizedSettings.socialLinks?.behance || '',
          github: normalizedSettings.socialLinks?.github || '',
          facebook: normalizedSettings.socialLinks?.facebook || '',
          youtube: normalizedSettings.socialLinks?.youtube || '',
          tiktok: normalizedSettings.socialLinks?.tiktok || '',
          website: normalizedSettings.socialLinks?.website || '',
        },
        customSections: normalizedSettings.customSections || [],
        metaTitle: normalizedSettings.metaTitle || `${community.name} - Communauté`,
        metaDescription: normalizedSettings.metaDescription || community.short_description,
        customDomain: normalizedSettings.customDomain || '',
        headerScripts: normalizedSettings.headerScripts || '',
      },
      stats: {
        totalRevenue: community.stats?.totalRevenue || 0,
        monthlyGrowth: community.stats?.monthlyGrowth || 0,
        engagementRate: community.stats?.engagementRate || 0,
        retentionRate: community.stats?.retentionRate || 0,
      },
      // Champs système
      isActive: community.isActive,
      isPrivate: community.isPrivate,
      isVerified: community.isVerified,
      inviteCode: community.inviteCode,
      inviteLink: community.inviteLink,
      rank: community.rank,
      fees_of_join: community.fees_of_join,
      currency: community.currency,
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
    };
  }

  /**
   * Obtenir toutes les communautés (pour compatibilité frontend)
   * @returns Liste de toutes les communautés transformées pour le frontend
   */
  async getAllCommunities(): Promise<any[]> {
    try {
      const communities = await this.communityModel
        .find({ isActive: true })
        .populate('createur', 'name email profile_picture photo_profil avatar photo')
        .populate('members', 'name email profile_picture photo_profil avatar photo')
        .populate('admins', 'name email profile_picture photo_profil avatar photo')
        .sort({ createdAt: -1 })
        .exec();

      // Transformer toutes les communautés pour le frontend
      return communities.map(community => this.transformCommunityForFrontend(community));
    } catch (error) {
      console.error('Erreur lors de la récupération des communautés:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération des communautés');
    }
  }

  /**
   * Obtenir toutes les communautés créées par un utilisateur
   * @param userId - ID de l'utilisateur
   * @returns Liste des communautés créées
   */
  async getUserCreatedCommunities(userId: string): Promise<any[]> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      const communities = await this.communityModel
        .find({ createur: new Types.ObjectId(userId) })
        .populate('createur', 'name email profile_picture photo_profil')
        .populate('members', 'name email')
        .populate('admins', 'name email')
        .populate('moderateurs', 'name email')
        .sort({ createdAt: -1 })
        .exec();

      return communities.map(community => this.transformCommunityForFrontend(community));

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('Erreur lors de la récupération des communautés créées:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération des communautés');
    }
  }

  /**
   * Obtenir toutes les communautés dont un utilisateur est membre
   * @param userId - ID de l'utilisateur
   * @returns Liste des communautés où l'utilisateur est membre
   */
  async getUserJoinedCommunities(userId: string): Promise<any[]> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      const communities = await this.communityModel
        .find({ members: new Types.ObjectId(userId) })
        .populate('createur', 'name email profile_picture photo_profil')
        .populate('members', 'name email')
        .populate('admins', 'name email')
        .populate('moderateurs', 'name email')
        .sort({ createdAt: -1 })
        .exec();

      return communities.map(community => this.transformCommunityForFrontend(community));

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('Erreur lors de la récupération des communautés rejointes:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération des communautés');
    }
  }

  /**
   * Obtenir les communautés gérables par l'utilisateur (propriétaire ou admin)
   * @param userId - ID de l'utilisateur
   * @returns Liste des communautés où l'utilisateur est propriétaire ou admin
   */
  async getUserManageableCommunities(userId: string): Promise<any[]> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      const communities = await this.communityModel
        .find({
          $or: [
            { createur: new Types.ObjectId(userId) },
            { admins: new Types.ObjectId(userId) }
          ]
        })
        .populate('createur', 'name email profile_picture photo_profil')
        .populate('members', 'name email')
        .populate('admins', 'name email')
        .populate('moderateurs', 'name email')
        .sort({ createdAt: -1 })
        .exec();

      return communities.map(community => this.transformCommunityForFrontend(community));

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('Erreur lors de la récupération des communautés gérables:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération des communautés gérables');
    }
  }

  /**
   * Obtenir une communauté par son ID ou slug
   * @param idOrSlug - ID MongoDB ou slug de la communauté
   * @returns La communauté trouvée
   */
  async getCommunityById(idOrSlug: string): Promise<CommunityDocument> {
    try {
      let community;

      // Check if the input is a valid MongoDB ObjectId
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);

      if (isValidObjectId) {
        // Query by ID
        community = await this.communityModel
          .findById(idOrSlug)
          .populate('createur', 'name firstName lastName email profile_picture photo_profil avatar photo bio username')
          .populate('members', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('admins', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('moderateurs', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .exec();
      } else {
        // Query by slug
        community = await this.communityModel
          .findOne({ slug: idOrSlug })
          .populate('createur', 'name firstName lastName email profile_picture photo_profil avatar photo bio username')
          .populate('members', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('admins', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('moderateurs', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .exec();
      }

      if (!community) {
        throw new NotFoundException('Communauté non trouvée');
      }

      return community;

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('Erreur lors de la récupération de la communauté:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération de la communauté');
    }
  }

  /**
   * Update a community and its customization settings
   * Only the community creator can update customization
   */
  async updateCommunity(
    idOrSlug: string,
    requesterId: string,
    updateData: UpdateCommunityCustomizationDto,
  ): Promise<any> {
    try {
      if (!requesterId || !/^[0-9a-fA-F]{24}$/.test(requesterId)) {
        throw new ForbiddenException('Utilisateur non autorisé');
      }

      const community = await this.getCommunityById(idOrSlug);

      const requesterObjectId = new Types.ObjectId(requesterId);
      const getObjectId = (value: any): Types.ObjectId | null => {
        if (!value) return null;
        if (value instanceof Types.ObjectId) return value;
        if (value._id instanceof Types.ObjectId) return value._id;
        if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
          return new Types.ObjectId(value);
        }
        return null;
      };

      const creatorId = getObjectId(community.createur);
      const isCreator = !!creatorId && creatorId.equals(requesterObjectId);

      if (!isCreator) {
        throw new ForbiddenException('Seul le créateur peut personnaliser cette communauté');
      }

      // Update top-level fields used by frontend customize page
      if (typeof updateData.name === 'string') {
        community.name = updateData.name.trim() || community.name;
      }
      if (typeof updateData.description === 'string') {
        community.short_description = updateData.description;
      }
      if (typeof updateData.longDescription === 'string') {
        community.longDescription = updateData.longDescription;
      }
      if (typeof updateData.category === 'string') {
        community.category = updateData.category;
      }
      if (Array.isArray(updateData.tags)) {
        community.tags = updateData.tags.filter((tag) => typeof tag === 'string');
      }
      if (typeof updateData.coverImage === 'string') {
        const cover = updateData.coverImage.trim();
        if (cover) {
          const coverUrl = this.uploadService.ensureAbsoluteUrl(cover);
          community.coverImage = coverUrl;
          community.photo_de_couverture = coverUrl;
        }
      }
      if (typeof updateData.logo === 'string') {
        const logo = updateData.logo.trim();
        if (logo) {
          community.logo = this.uploadService.ensureAbsoluteUrl(logo);
        }
      }
      if (typeof updateData.price === 'number' && Number.isFinite(updateData.price)) {
        const normalizedPrice = Math.max(updateData.price, 0);
        community.price = normalizedPrice;
        community.fees_of_join = normalizedPrice;
        // Keep pricing object in sync
        if (!community.pricing) {
          (community as any).pricing = {
            price: normalizedPrice,
            currency: community.currency || 'TND',
            priceType: community.priceType || 'free',
            isRecurring: false,
            features: [],
            limits: { maxMembers: 1000, maxCourses: 50, maxPosts: 1000, storageLimit: '10GB' },
            paymentOptions: { allowInstallments: false }
          };
        } else {
          community.pricing.price = normalizedPrice;
        }
      }
      if (typeof updateData.priceType === 'string') {
        community.priceType = updateData.priceType;
        if (community.pricing) {
          community.pricing.priceType = updateData.priceType as any;
          community.pricing.isRecurring = ['monthly', 'yearly'].includes(updateData.priceType);
        }
      }
      if (typeof updateData.type === 'string') {
        (community as any).type = updateData.type;
      }

      // Merge settings object (design/layout/advanced options)
      if (updateData.settings && typeof updateData.settings === 'object') {
        const currentSettings = this.normalizeCommunitySettings(community.name, (community.settings || {}) as any);
        const incomingSettings = updateData.settings as any;
        const mergedSettings: any = {
          ...currentSettings,
          ...incomingSettings,
        };

        // Keep socialLinks safely merged
        if (incomingSettings.socialLinks && typeof incomingSettings.socialLinks === 'object') {
          mergedSettings.socialLinks = {
            ...(currentSettings.socialLinks || {}),
            ...incomingSettings.socialLinks,
          };
        }

        // Normalize URL-like settings fields
        if (typeof mergedSettings.logo === 'string' && mergedSettings.logo.trim()) {
          mergedSettings.logo = this.uploadService.ensureAbsoluteUrl(mergedSettings.logo);
          community.logo = mergedSettings.logo;
        }
        if (typeof mergedSettings.heroBackground === 'string' && mergedSettings.heroBackground.trim()) {
          mergedSettings.heroBackground = this.uploadService.ensureAbsoluteUrl(mergedSettings.heroBackground);
        }
        if (Array.isArray(mergedSettings.gallery)) {
          mergedSettings.gallery = mergedSettings.gallery
            .filter((url: any) => typeof url === 'string')
            .map((url: string) => this.uploadService.ensureAbsoluteUrl(url));
        }
        if (typeof mergedSettings.customDomain === 'string') {
          const normalizedDomain = mergedSettings.customDomain.trim().toLowerCase();
          mergedSettings.customDomain = normalizedDomain;
          if (normalizedDomain) {
            const existingDomain = await this.communityModel
              .findOne({
                _id: { $ne: community._id },
                'settings.customDomain': normalizedDomain,
              })
              .collation({ locale: 'en', strength: 2 })
              .select('_id name slug')
              .lean()
              .exec();
            if (existingDomain) {
              throw new ConflictException('Ce domaine personnalisé est déjà utilisé');
            }
          }
        }

        community.settings = this.normalizeCommunitySettings(community.name, mergedSettings);
      } else {
        // Auto-backfill defaults for older communities even when no settings update is sent
        community.settings = this.normalizeCommunitySettings(community.name, (community.settings || {}) as any);
      }

      // Keep pricing sub-document consistent when available
      if ((community as any).pricing && typeof (community as any).pricing === 'object') {
        const pricing = (community as any).pricing;
        if (typeof community.fees_of_join === 'number') {
          pricing.price = community.fees_of_join;
        }
        if (typeof community.currency === 'string') {
          pricing.currency = community.currency;
        }
        if (typeof community.priceType === 'string') {
          pricing.priceType = community.priceType;
        }
      }

      await community.save();

      const refreshed = await this.getCommunityById(community._id.toString());
      return this.transformCommunityForFrontend(refreshed);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Erreur lors de la mise à jour de la communauté:', error);
      throw new InternalServerErrorException('Erreur lors de la mise à jour de la communauté');
    }
  }

  async getCommunityMembers(
    communityIdOrSlug: string,
    requesterId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResponseDto<any>> {
    const community = await this.getCommunityById(communityIdOrSlug);

    const requesterObjectId = new Types.ObjectId(requesterId);
    if (!community.isMember(requesterObjectId)) {
      throw new ForbiddenException('Vous devez être membre de cette communauté');
    }

    const members = (community as any).members || [];
    const total = members.length;
    const start = (page - 1) * limit;
    const end = start + limit;

    const creatorId = (community as any).createur?._id ? (community as any).createur._id : (community as any).createur;
    const adminIds = ((community as any).admins || []).map((a: any) => (a?._id ? a._id : a));
    const moderatorIds = ((community as any).moderateurs || []).map((m: any) => (m?._id ? m._id : m));

    const items = members.slice(start, end).map((u: any) => {
      const userId = u?._id ? u._id : u;
      const isCreator = creatorId && userId && new Types.ObjectId(userId).equals(creatorId);
      const isAdmin = adminIds.some((a: any) => a && new Types.ObjectId(a).equals(userId));
      const isModerator = moderatorIds.some((m: any) => m && new Types.ObjectId(m).equals(userId));

      const role = isCreator || isAdmin ? 'admin' : isModerator ? 'moderator' : 'member';

      return {
        id: `${community._id.toString()}-${userId.toString()}`,
        userId: userId.toString(),
        communityId: community._id.toString(),
        role,
        joinedAt: community.createdAt ? new Date(community.createdAt).toISOString() : new Date().toISOString(),
        user: {
          id: userId.toString(),
          email: u?.email,
          username: (u as any)?.username,
          firstName: (u as any)?.firstName,
          lastName: (u as any)?.lastName,
          name: (u as any)?.name || ((u as any)?.firstName && (u as any)?.lastName ? `${(u as any).firstName} ${(u as any).lastName}` : (u as any)?.username),
          avatar: (u as any)?.avatar || (u as any)?.profile_picture || (u as any)?.photo_profil || (u as any)?.photo,
          bio: (u as any)?.bio,
          role: (u as any)?.role,
          verified: (u as any)?.verified,
          createdAt: (u as any)?.createdAt,
          updatedAt: (u as any)?.updatedAt,
        },
      };
    });

    return new PaginatedResponseDto(items, total, page, limit);
  }

  /**
   * Checkout pour adhésion à une communauté payante
   */
  async checkoutCommunityMembership(communityId: string, userId: string, promoCode?: string, isInviteValidated: boolean = false): Promise<{ message: string }> {
    const community = await this.communityModel.findById(communityId);
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    if (community.isPrivate && !isInviteValidated) {
      throw new ForbiddenException('Cette communauté est privée. Veuillez utiliser le lien d\'invitation pour rejoindre.');
    }

    if (community.members.includes(new Types.ObjectId(userId))) {
      return { message: 'Déjà membre de cette communauté' };
    }

    const price = community.fees_of_join || 0;
    if (price <= 0) {
      // Gratuit: ajouter directement
      community.addMember(new Types.ObjectId(userId));
      await community.save();
      await this.userModel.findByIdAndUpdate(userId, { $addToSet: { joinedCommunities: community._id } });
      return { message: 'Adhésion gratuite réussie' };
    }

    let effective = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COMMUNITY, community._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        effective = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(effective, community.createur.toString());
    await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: community.createur,
      contentType: TrackableContentType.COMMUNITY,
      contentId: community._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'paid'
    });

    community.addMember(new Types.ObjectId(userId));
    await community.save();
    await this.userModel.findByIdAndUpdate(userId, { $addToSet: { joinedCommunities: community._id } });

    return { message: 'Adhésion achetée avec succès' };
  }

  /**
   * Ajouter un administrateur à une communauté avec contrainte AdminsMax
   */
  async addAdmin(communityId: string, targetUserId: string, requesterId: string): Promise<{ message: string }> {
    const community = await this.communityModel.findById(communityId);
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    const isCreator = community.createur.equals(new Types.ObjectId(requesterId));
    const isAdmin = community.admins.includes(new Types.ObjectId(requesterId));
    if (!isCreator && !isAdmin) {
      throw new ForbiddenException('Seuls le créateur ou un administrateur peuvent ajouter un administrateur');
    }

    const target = await this.userModel.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('Utilisateur cible non trouvé');
    }

    // Enforce AdminsMax according to creator's plan
    const currentAdminsCount = community.admins.length + 1; // including creator implicitly
    const canAdd = await this.policyService.canAddAdmin(community.createur.toString(), currentAdminsCount);
    if (!canAdd) {
      throw new ForbiddenException('Limite d\'administrateurs atteinte pour le plan du créateur');
    }

    const targetId = new Types.ObjectId(targetUserId);
    if (!community.admins.some(a => a.equals(targetId))) {
      community.admins.push(targetId);
      await community.save();
    }

    await this.userModel.findByIdAndUpdate(targetId, { $addToSet: { adminCommunities: community._id } });

    return { message: 'Administrateur ajouté avec succès' };
  }

  /**
   * Retirer un administrateur d'une communauté
   */
  async removeAdmin(communityId: string, targetUserId: string, requesterId: string): Promise<{ message: string }> {
    const community = await this.communityModel.findById(communityId);
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    const isCreator = community.createur.equals(new Types.ObjectId(requesterId));
    if (!isCreator) {
      throw new ForbiddenException('Seul le créateur peut retirer un administrateur');
    }

    const targetId = new Types.ObjectId(targetUserId);
    community.admins = community.admins.filter(a => !a.equals(targetId));
    await community.save();

    await this.userModel.findByIdAndUpdate(targetId, { $pull: { adminCommunities: community._id } });

    return { message: 'Administrateur retiré avec succès' };
  }

  /**
   * Obtenir toutes les communautés publiques (pour affichage général)
   * @returns Liste des communautés publiques
   */
  async getPublicCommunities(): Promise<CommunityDocument[]> {
    try {
      return await this.communityModel
        .find({ isPrivate: false, isActive: true })
        .populate('createur', 'name email profile_picture photo_profil')
        .select('-members -admins -moderateurs') // Masquer les listes de membres pour l'affichage public
        .sort({ createdAt: -1 })
        .exec();

    } catch (error) {
      console.error('Erreur lors de la récupération des communautés publiques:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération des communautés');
    }
  }
  /**
   * Obtenir toutes les communautés (version complète avec populate)
   * @returns Liste de toutes les communautés actives
   */
  async getCommunities(): Promise<CommunityDocument[]> {
    try {
      return await this.communityModel
        .find({ isActive: true })
        .populate('createur', 'name email profile_picture photo_profil')
        .populate('members', 'name email')
        .populate('admins', 'name email')
        .populate('moderateurs', 'name email')
        .sort({ createdAt: -1 })
        .exec();

    } catch (error) {
      console.error('Erreur lors de la récupération des communautés:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération des communautés');
    }
  }

  /**
   * Mettre à jour les rangs de toutes les communautés basé sur le nombre de membres
   * Rang 1 = communauté avec le plus de membres
   */
  async updateCommunityRanks(): Promise<void> {
    try {
      // Récupérer toutes les communautés triées par nombre de membres (décroissant)
      const communities = await this.communityModel
        .find({ isActive: true })
        .sort({ membersCount: -1 })
        .exec();

      // Mettre à jour le rang de chaque communauté
      for (let i = 0; i < communities.length; i++) {
        const community = communities[i];
        const newRank = i + 1; // Rang commence à 1

        if (community.rank !== newRank) {
          await this.communityModel.findByIdAndUpdate(
            community._id,
            { rank: newRank },
            { new: true }
          );
        }
      }

      console.log(`✅ Rangs mis à jour pour ${communities.length} communautés`);

    } catch (error) {
      console.error('Erreur lors de la mise à jour des rangs:', error);
      // Ne pas faire échouer l'opération principale si la mise à jour des rangs échoue
    }
  }

  /**
   * Obtenir le classement des communautés par nombre de membres
   * @returns Liste des communautés triées par rang
   */
  async getCommunityRanking(): Promise<CommunityDocument[]> {
    try {
      return await this.communityModel
        .find({ isActive: true })
        .sort({ rank: 1 }) // Tri par rang croissant (1, 2, 3...)
        .populate('createur', 'name email profile_picture photo_profil')
        .select('name logo membersCount rank createur createdAt')
        .exec();

    } catch (error) {
      console.error('Erreur lors de la récupération du classement:', error);
      throw new InternalServerErrorException('Erreur lors de la récupération du classement');
    }
  }

  /**
   * Rejoindre une communauté directement par ID
   * @param joinData - Données de join avec ID de la communauté
   * @param userId - ID de l'utilisateur qui souhaite rejoindre
   * @returns La communauté mise à jour
   */
  async joinCommunity(joinData: JoinCommunityDto, userId: string): Promise<CommunityDocument> {
    try {
      // Vérifier si l'utilisateur existe
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      // Vérifier si la communauté existe
      const community = await this.communityModel.findById(joinData.communityId);
      if (!community) {
        throw new NotFoundException('Communauté non trouvée');
      }

      // Vérifier si la communauté est active
      if (!community.isActive) {
        throw new ForbiddenException('Cette communauté n\'est pas active');
      }

      // Enforcer MembersMax du créateur de la communauté
      const creatorId = community.createur;
      const currentMembers = community.membersCount || community.members.length;
      const canAdd = await this.policyService.canAddMember(creatorId.toString(), currentMembers);
      if (!canAdd) {
        throw new ForbiddenException('Limite de membres atteinte pour le plan du créateur.');
      }

      // Vérifier si l'utilisateur est déjà membre
      if (community.members.includes(new Types.ObjectId(userId))) {
        const populatedCommunity = await this.communityModel
          .findById(community._id)
          .populate('createur', 'name email profile_picture photo_profil')
          .populate('members', 'name email')
          .populate('admins', 'name email')
          .exec();

        if (!populatedCommunity) {
          throw new InternalServerErrorException('Erreur lors de la récupération de la communauté mise à jour');
        }

        return this.transformCommunityForFrontend(populatedCommunity);
      }

      // Vérifier si la communauté est privée (pour les communautés privées, seul le lien d'invitation fonctionne)
      if (community.isPrivate) {
        throw new ForbiddenException('Cette communauté est privée. Vous devez utiliser un lien d\'invitation pour la rejoindre.');
      }

      // Ajouter l'utilisateur à la communauté
      community.members.push(new Types.ObjectId(userId));
      community.membersCount = community.members.length;
      await community.save();

      // Ajouter la communauté à la liste des communautés rejointes de l'utilisateur
      await this.userModel.findByIdAndUpdate(
        userId,
        { $addToSet: { joinedCommunities: community._id } },
        { new: true }
      );

      // Recalculer les rangs
      await this.updateCommunityRanks();

      // Send notification to community creator
      this.notificationService.createNotification({
        recipient: community.createur.toString(),
        sender: userId,
        type: 'new_community_member',
        title: 'New Member',
        body: `${user.name} has joined your community ${community.name}`,
        data: { communityId: community._id.toString(), userId },
      });

      // Retourner la communauté avec les relations peuplées
      const populatedCommunity = await this.communityModel
        .findById(community._id)
        .populate('createur', 'name email profile_picture photo_profil')
        .populate('members', 'name email')
        .populate('admins', 'name email')
        .exec();

      if (!populatedCommunity) {
        throw new InternalServerErrorException('Erreur lors de la récupération de la communauté mise à jour');
      }

      // Transformer la réponse pour être 100% compatible avec le frontend
      return this.transformCommunityForFrontend(populatedCommunity);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('Erreur lors de la jonction à la communauté:', error);
      throw new InternalServerErrorException('Erreur lors de la jonction à la communauté');
    }
  }

  /**
   * Rejoindre une communauté via un lien d'invitation
   * @param joinData - Données de join avec le code d'invitation
   * @param userId - ID de l'utilisateur qui souhaite rejoindre
   * @returns La communauté mise à jour
   */
  async joinByInvite(joinData: JoinByInviteDto, userId: string): Promise<CommunityDocument> {
    try {
      // Vérifier si l'utilisateur existe
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      // Trouver la communauté par le code d'invitation
      const community = await this.communityModel.findOne({ inviteCode: joinData.inviteCode });
      if (!community) {
        throw new NotFoundException('Code d\'invitation invalide ou expiré');
      }

      // Vérifier si la communauté est active
      if (!community.isActive) {
        throw new ForbiddenException('Cette communauté n\'est pas active');
      }

      // Enforcer MembersMax du créateur de la communauté
      const creatorId2 = community.createur;
      const currentMembers2 = community.membersCount || community.members.length;
      const canAdd2 = await this.policyService.canAddMember(creatorId2.toString(), currentMembers2);
      if (!canAdd2) {
        throw new ForbiddenException('Limite de membres atteinte pour le plan du créateur.');
      }

      // Vérifier si l'utilisateur est déjà membre
      if (community.members.includes(new Types.ObjectId(userId))) {
        const populatedCommunity = await this.communityModel
          .findById(community._id)
          .populate('createur', 'name email profile_picture photo_profil')
          .populate('members', 'name email')
          .populate('admins', 'name email')
          .exec();

        if (!populatedCommunity) {
          throw new InternalServerErrorException('Erreur lors de la récupération de la communauté mise à jour');
        }

        return this.transformCommunityForFrontend(populatedCommunity);
      }

      // Ajouter l'utilisateur à la communauté
      community.members.push(new Types.ObjectId(userId));
      community.membersCount = community.members.length;
      await community.save();

      // Ajouter la communauté à la liste des communautés rejointes de l'utilisateur
      await this.userModel.findByIdAndUpdate(
        userId,
        { $addToSet: { joinedCommunities: community._id } },
        { new: true }
      );

      // Recalculer les rangs
      await this.updateCommunityRanks();

      // Send notification to community creator
      this.notificationService.createNotification({
        recipient: community.createur.toString(),
        sender: userId,
        type: 'new_community_member',
        title: 'New Member',
        body: `${user.name} has joined your community ${community.name}`,
        data: { communityId: community._id.toString(), userId },
      });

      // Retourner la communauté avec les relations peuplées
      const populatedCommunity = await this.communityModel
        .findById(community._id)
        .populate('createur', 'name email profile_picture photo_profil')
        .populate('members', 'name email')
        .populate('admins', 'name email')
        .exec();

      if (!populatedCommunity) {
        throw new InternalServerErrorException('Erreur lors de la récupération de la communauté mise à jour');
      }

      // Transformer la réponse pour être 100% compatible avec le frontend
      return this.transformCommunityForFrontend(populatedCommunity);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('Erreur lors de la jonction par invitation:', error);
      throw new InternalServerErrorException('Erreur lors de la jonction par invitation');
    }
  }

  /**
   * Générer un lien d'invitation pour une communauté
   * @param generateData - Données avec l'ID de la communauté
   * @param userId - ID de l'utilisateur (doit être admin/créateur)
   * @param baseUrl - URL de base pour construire le lien complet
   * @returns Le lien d'invitation généré
   */
  async generateInviteLink(generateData: GenerateInviteDto, userId: string, baseUrl: string): Promise<{ inviteCode: string, inviteLink: string }> {
    try {
      // Vérifier si l'utilisateur existe
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      // Vérifier si la communauté existe
      const community = await this.communityModel.findById(generateData.communityId);
      if (!community) {
        throw new NotFoundException('Communauté non trouvée');
      }

      // Vérifier si l'utilisateur est créateur ou administrateur
      const isCreator = community.createur.equals(new Types.ObjectId(userId));
      const isAdmin = community.admins.includes(new Types.ObjectId(userId));

      if (!isCreator && !isAdmin) {
        throw new ForbiddenException('Seuls les créateurs et administrateurs peuvent générer des liens d\'invitation');
      }

      // Générer un nouveau code si nécessaire
      if (!community.inviteCode || generateData.regenerate) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let newCode = '';
        for (let i = 0; i < 12; i++) {
          newCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        community.inviteCode = newCode;
      }

      // Générer le lien d'invitation
      community.inviteLink = `${baseUrl}/community-aff-crea-join/join-by-invite/${community.inviteCode}`;
      await community.save();

      return {
        inviteCode: community.inviteCode,
        inviteLink: community.inviteLink
      };

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      console.error('Erreur lors de la génération du lien d\'invitation:', error);
      throw new InternalServerErrorException('Erreur lors de la génération du lien d\'invitation');
    }
  }


  /**
   * Validate an invitation code and return preview info
   * @param inviteCode - The invitation code to validate
   * @returns Community preview info
   */
  async validateInviteCode(inviteCode: string): Promise<any> {
    try {
      const community = await this.communityModel.findOne({ inviteCode })
        .populate('createur', 'name profile_picture photo_profil')
        .select('name description short_description coverImage photo_de_couverture logo fees_of_join price priceType currency membersCount isPrivate isActive')
        .exec();

      if (!community) {
        throw new NotFoundException('Code d\'invitation invalide');
      }

      if (!community.isActive) {
        throw new ForbiddenException('Cette communauté n\'est plus active');
      }

      // Transform for frontend preview
      const preview = {
        _id: community._id,
        name: community.name,
        description: community.short_description,
        logo: this.uploadService.ensureAbsoluteUrl(community.logo),
        coverImage: this.uploadService.ensureAbsoluteUrl(
          community.photo_de_couverture || community.coverImage || ''
        ),
        creator: {
          name: (community.createur as any)?.name || 'Créateur',
          avatar: this.uploadService.ensureAbsoluteUrl(
            (community.createur as any)?.profile_picture || (community.createur as any)?.photo_profil || ''
          )
        },
        membersCount: community.membersCount,
        price: community.fees_of_join || community.price || 0,
        currency: community.currency,
        isPrivate: community.isPrivate,
        priceType: community.priceType
      };

      return preview;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      console.error('Error validating invite code:', error);
      throw new InternalServerErrorException('Erreur lors de la validation du code');
    }
  }

  /**
   * Checkout for private community via invite
   */
  async checkoutPrivateCommunity(inviteCode: string, userId: string, promoCode?: string): Promise<{ message: string }> {
    const community = await this.communityModel.findOne({ inviteCode });
    if (!community) {
      throw new NotFoundException('Code d\'invitation invalide');
    }

    if (!community.isActive) {
      throw new ForbiddenException('Communauté inactive');
    }

    // Check if already member
    if (community.members.includes(new Types.ObjectId(userId))) {
      return { message: 'Déjà membre de cette communauté' };
    }

    // Reuse existing checkout logic logic but bypassed privacy check because we have valid invite code
    return this.checkoutCommunityMembership(community._id.toString(), userId, promoCode, true);
  }

  /**
   * Quitter une communauté
   * @param communityId - ID de la communauté à quitter
   * @param userId - ID de l'utilisateur qui souhaite quitter
   * @returns Message de confirmation
   */
  async leaveCommunity(communityId: string, userId: string): Promise<{ message: string }> {
    try {
      // Vérifier si l'utilisateur existe
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      // Vérifier si la communauté existe
      const community = await this.communityModel.findById(communityId);
      if (!community) {
        throw new NotFoundException('Communauté non trouvée');
      }

      // Vérifier si l'utilisateur est membre
      const userObjectId = new Types.ObjectId(userId);
      const isMember = community.members.some(memberId => memberId.equals(userObjectId));

      if (!isMember) {
        throw new BadRequestException('Vous n\'êtes pas membre de cette communauté');
      }

      // Empêcher le créateur de quitter sa propre communauté
      if (community.createur.equals(new Types.ObjectId(userId))) {
        throw new ForbiddenException('Le créateur ne peut pas quitter sa propre communauté');
      }

      // Retirer l'utilisateur de la communauté
      community.members = community.members.filter(member => !member.equals(new Types.ObjectId(userId)));
      community.admins = community.admins.filter(admin => !admin.equals(new Types.ObjectId(userId)));
      community.moderateurs = community.moderateurs.filter(moderator => !moderator.equals(new Types.ObjectId(userId)));
      community.membersCount = community.members.length;
      await community.save();

      // Retirer la communauté de la liste des communautés rejointes de l'utilisateur
      await this.userModel.findByIdAndUpdate(
        userId,
        {
          $pull: {
            joinedCommunities: community._id,
            adminCommunities: community._id
          }
        },
        { new: true }
      );

      // Recalculer les rangs
      await this.updateCommunityRanks();

      return {
        message: 'Vous avez quitté la communauté avec succès'
      };

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }

      console.error('Erreur lors de la sortie de la communauté:', error);
      throw new InternalServerErrorException('Erreur lors de la sortie de la communauté');
    }
  }

  /**
   * Get active/online members of a community by slug
   * @param slug - Community slug
   * @param limit - Maximum number of members to return
   * @returns Members with their online status
   */
  async getActiveMembers(slug: string, limit: number = 20): Promise<{
    members: Array<{
      id: string;
      name: string;
      email: string;
      avatar: string;
      bio: string;
      isOnline: boolean;
      lastActive: Date;
    }>;
    total: number;
    online: number;
  }> {
    try {
      console.log('👥 [ACTIVE-MEMBERS-SERVICE] Fetching active members for slug:', slug);

      // Find community by slug
      const community = await this.communityModel
        .findOne({ slug })
        .populate({
          path: 'members',
          select: 'name email profile_picture photo_profil bio lastActive',
          options: { limit }
        })
        .exec();

      if (!community) {
        throw new NotFoundException('Community not found');
      }

      console.log('📦 [ACTIVE-MEMBERS-SERVICE] Community found:', community.name);
      console.log('📊 [ACTIVE-MEMBERS-SERVICE] Total members:', community.members.length);

      // Calculate online status - users are online if active within last 5 minutes
      const onlineThreshold = new Date(Date.now() - 5 * 60 * 1000);

      const members = (community.members as any[]).map((member: any) => {
        const lastActiveDate = member.lastActive ? new Date(member.lastActive) : new Date(0);
        const isOnline = lastActiveDate > onlineThreshold;

        return {
          id: member._id.toString(),
          name: member.name || 'Unknown User',
          email: member.email,
          avatar: member.profile_picture || member.photo_profil ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || 'U')}&background=8e78fb&color=fff`,
          bio: member.bio || '',
          isOnline,
          lastActive: lastActiveDate,
        };
      });

      // Sort by online status first, then by lastActive
      members.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return b.lastActive.getTime() - a.lastActive.getTime();
      });

      const onlineCount = members.filter(m => m.isOnline).length;

      console.log('✅ [ACTIVE-MEMBERS-SERVICE] Members processed:', {
        total: members.length,
        online: onlineCount,
        offline: members.length - onlineCount
      });

      return {
        members,
        total: members.length,
        online: onlineCount
      };

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }


      console.error('❌ [ACTIVE-MEMBERS-SERVICE] Error:', error);
      throw new InternalServerErrorException('Error fetching active members');
    }
  }

  /**
   * Get community statistics
   * @param communityId - ID of the community
   * @returns Community statistics including members, engagement, growth
   */
  async getCommunityStats(communityId: string): Promise<{
    membersCount: number;
    engagementRate: number;
    monthlyGrowth: number;
    isPublic: boolean;
  }> {
    try {
      console.log('📊 [COMMUNITY-STATS] Getting stats for community:', communityId);

      // Find community
      const community = await this.communityModel.findById(communityId);
      if (!community) {
        throw new NotFoundException('Community not found');
      }

      // Real members count from the database
      const membersCount = community.membersCount || community.members?.length || 0;

      // Calculate engagement rate (mock for now - in real app would be based on posts, comments, etc.)
      // For now, we'll use a simple formula based on members count
      const engagementRate = Math.min(Math.round(membersCount * 0.15 + Math.random() * 10), 100);

      // Calculate monthly growth (mock for now - in real app would compare with previous month)
      // For now, we'll use a random growth between -5% and +15%
      const monthlyGrowth = Math.round((Math.random() - 0.3) * 20);

      // Is public status
      const isPublic = !community.isPrivate;

      const stats = {
        membersCount,
        engagementRate,
        monthlyGrowth,
        isPublic
      };

      console.log('✅ [COMMUNITY-STATS] Stats calculated:', stats);

      return stats;

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('❌ [COMMUNITY-STATS] Error:', error);
      throw new InternalServerErrorException('Error fetching community stats');
    }
  }

  /**
   * Delete a community permanently
   * @param communityId - ID of the community to delete
   * @returns void
   */
  async deleteCommunity(communityId: string): Promise<void> {
    try {
      console.log('🗑️ [DELETE-COMMUNITY] Deleting community:', communityId);

      if (!Types.ObjectId.isValid(communityId)) {
        throw new NotFoundException('Community not found');
      }

      const communityObjectId = new Types.ObjectId(communityId);
      const communityIdString = communityObjectId.toString();

      const existingCommunity = await this.communityModel
        .findById(communityObjectId)
        .select('_id')
        .lean();

      if (!existingCommunity) {
        throw new NotFoundException('Community not found');
      }

      const connection = this.communityModel.db;
      const session: any = null;
        const courseModel = this.getModelIfRegistered(connection, 'Cours');
        const challengeModel = this.getModelIfRegistered(connection, 'Challenge');
        const productModel = this.getModelIfRegistered(connection, 'Product');
        const sessionModel = this.getModelIfRegistered(connection, 'Session');
        const eventModel = this.getModelIfRegistered(connection, 'Event');
        const postModel = this.getModelIfRegistered(connection, 'Post');
        const resourceModel = this.getModelIfRegistered(connection, 'Resource');
        const communityPageContentModel = this.getModelIfRegistered(connection, 'CommunityPageContent');
        const orderModel = this.getModelIfRegistered(connection, 'Order');
        const payoutModel = this.getModelIfRegistered(connection, 'Payout');
        const promoCodeModel = this.getModelIfRegistered(connection, 'PromoCode');
        const analyticsDailyModel = this.getModelIfRegistered(connection, 'AnalyticsDaily');
        const emailCampaignModel = this.getModelIfRegistered(connection, 'EmailCampaign');
        const achievementModel = this.getModelIfRegistered(connection, 'Achievement');
        const userAchievementModel = this.getModelIfRegistered(connection, 'UserAchievement');
        const userLoginActivityModel = this.getModelIfRegistered(connection, 'UserLoginActivity');
        const courseEnrollmentModel = this.getModelIfRegistered(connection, 'CourseEnrollment');
        const challengeSubmissionModel = this.getModelIfRegistered(connection, 'ChallengeSubmission');
        const contentProgressModel = this.getModelIfRegistered(connection, 'ContentProgress');
        const trackingActionModel = this.getModelIfRegistered(connection, 'TrackingAction');
        const conversationModel = this.getModelIfRegistered(connection, 'Conversation');
        const messageModel = this.getModelIfRegistered(connection, 'Message');
        const feedbackModel = this.getModelIfRegistered(connection, 'Feedback');

        const [
          courses,
          challenges,
          products,
          sessions,
          posts,
          events,
          resources,
          conversations,
        ] = await Promise.all([
          courseModel
            ? courseModel.find({ communityId: communityIdString }).select('_id id').session(session).lean()
            : [],
          challengeModel
            ? challengeModel.find({ communityId: communityIdString }).select('_id id').session(session).lean()
            : [],
          productModel
            ? productModel.find({ communityId: communityIdString }).select('_id id').session(session).lean()
            : [],
          sessionModel
            ? sessionModel.find({ communityId: communityIdString }).select('_id id').session(session).lean()
            : [],
          postModel
            ? postModel.find({ communityId: communityIdString }).select('_id id').session(session).lean()
            : [],
          eventModel
            ? eventModel.find({ communityId: communityObjectId }).select('_id id').session(session).lean()
            : [],
          resourceModel
            ? resourceModel.find({ communityId: communityObjectId }).select('_id').session(session).lean()
            : [],
          conversationModel
            ? conversationModel.find({ communityId: communityObjectId }).select('_id').session(session).lean()
            : [],
        ]);

        const courseObjectIds = courses.map((doc: any) => doc._id).filter(Boolean);
        const challengeObjectIds = challenges.map((doc: any) => doc._id).filter(Boolean);
        const conversationIds = conversations.map((doc: any) => doc._id).filter(Boolean);
        const contentStringIds = [
          ...courses.map((doc: any) => String(doc.id || '')).filter(Boolean),
          ...challenges.map((doc: any) => String(doc.id || '')).filter(Boolean),
          ...products.map((doc: any) => String(doc.id || '')).filter(Boolean),
          ...sessions.map((doc: any) => String(doc.id || '')).filter(Boolean),
          ...posts.map((doc: any) => String(doc.id || '')).filter(Boolean),
          ...events.map((doc: any) => String(doc.id || '')).filter(Boolean),
          ...posts.map((doc: any) => String(doc._id || '')).filter(Boolean),
          ...resources.map((doc: any) => String(doc._id || '')).filter(Boolean),
          communityIdString,
        ];

        await Promise.all([
          communityPageContentModel
            ? communityPageContentModel.deleteMany({ community: communityObjectId }).session(session)
            : Promise.resolve(),
          postModel
            ? postModel.deleteMany({ communityId: communityIdString }).session(session)
            : Promise.resolve(),
          courseModel
            ? courseModel.deleteMany({ communityId: communityIdString }).session(session)
            : Promise.resolve(),
          challengeModel
            ? challengeModel.deleteMany({ communityId: communityIdString }).session(session)
            : Promise.resolve(),
          productModel
            ? productModel.deleteMany({ communityId: communityIdString }).session(session)
            : Promise.resolve(),
          sessionModel
            ? sessionModel.deleteMany({ communityId: communityIdString }).session(session)
            : Promise.resolve(),
          eventModel
            ? eventModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          resourceModel
            ? resourceModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          emailCampaignModel
            ? emailCampaignModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          userLoginActivityModel
            ? userLoginActivityModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          userAchievementModel
            ? userAchievementModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          achievementModel
            ? achievementModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          analyticsDailyModel
            ? analyticsDailyModel.deleteMany({ communityId: communityIdString }).session(session)
            : Promise.resolve(),
          promoCodeModel
            ? promoCodeModel.deleteMany({ communityId: communityIdString }).session(session)
            : Promise.resolve(),
          orderModel
            ? orderModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          payoutModel
            ? payoutModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          conversationModel
            ? conversationModel.deleteMany({ communityId: communityObjectId }).session(session)
            : Promise.resolve(),
          courseEnrollmentModel && courseObjectIds.length > 0
            ? courseEnrollmentModel.deleteMany({ courseId: { $in: courseObjectIds } }).session(session)
            : Promise.resolve(),
          challengeSubmissionModel && challengeObjectIds.length > 0
            ? challengeSubmissionModel.deleteMany({ challengeId: { $in: challengeObjectIds } }).session(session)
            : Promise.resolve(),
          messageModel && conversationIds.length > 0
            ? messageModel.deleteMany({ conversationId: { $in: conversationIds } }).session(session)
            : Promise.resolve(),
          feedbackModel
            ? feedbackModel
                .deleteMany({
                  $or: [
                    { relatedModel: 'Community', relatedTo: communityObjectId },
                    { relatedModel: 'Cours', relatedTo: { $in: courseObjectIds } },
                    { relatedModel: 'Challenge', relatedTo: { $in: challengeObjectIds } },
                    { relatedModel: 'Product', relatedTo: { $in: products.map((doc: any) => doc._id).filter(Boolean) } },
                    { relatedModel: 'Session', relatedTo: { $in: sessions.map((doc: any) => doc._id).filter(Boolean) } },
                    { relatedModel: 'Event', relatedTo: { $in: events.map((doc: any) => doc._id).filter(Boolean) } },
                  ],
                })
                .session(session)
            : Promise.resolve(),
          contentProgressModel
            ? contentProgressModel
                .deleteMany({
                  $or: [
                    { contentType: TrackableContentType.COMMUNITY, contentId: communityIdString },
                    { contentId: { $in: contentStringIds } },
                  ],
                })
                .session(session)
            : Promise.resolve(),
          trackingActionModel
            ? trackingActionModel
                .deleteMany({
                  $or: [
                    { contentType: TrackableContentType.COMMUNITY, contentId: communityIdString },
                    { contentId: { $in: contentStringIds } },
                  ],
                })
                .session(session)
            : Promise.resolve(),
          this.userModel.updateMany(
            {
              $or: [
                { createdCommunities: communityObjectId },
                { joinedCommunities: communityObjectId },
                { adminCommunities: communityObjectId },
                { moderatorCommunities: communityObjectId },
              ],
            },
            {
              $pull: {
                createdCommunities: communityObjectId,
                joinedCommunities: communityObjectId,
                adminCommunities: communityObjectId,
                moderatorCommunities: communityObjectId,
              },
            },
            { session },
          ),
        ]);

        await this.communityModel.deleteOne({ _id: communityObjectId }).session(session);

      console.log('✅ [DELETE-COMMUNITY] Community deleted successfully:', communityId);

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('❌ [DELETE-COMMUNITY] Error:', error);
      throw new InternalServerErrorException('Error deleting community');
    }
  }

  /**
   * Get all reviews for a community
   * @param communityId - ID of the community
   * @returns Reviews list with average rating
   */
  async getCommunityReviews(communityId: string): Promise<{
    reviews: Array<{
      id: string;
      userId: string;
      userName: string;
      userAvatar: string;
      rating: number;
      comment: string;
      createdAt: Date;
    }>;
    averageRating: number;
    totalReviews: number;
    ratingDistribution: { [key: number]: number };
  }> {
    try {
      console.log('⭐ [REVIEWS] Getting reviews for community:', communityId);

      // Find community to validate it exists
      const community = await this.communityModel.findById(communityId);
      if (!community) {
        throw new NotFoundException('Community not found');
      }

      // Get all reviews for this community
      const progressRecords = await this.contentProgressModel
        .find({
          contentId: communityId,
          contentType: TrackableContentType.COMMUNITY,
          rating: { $exists: true, $ne: null, $gte: 1 }
        })
        .populate('userId', 'name profile_picture photo_profil avatar')
        .sort({ updatedAt: -1 })
        .exec();

      // Transform reviews
      const reviews = progressRecords.map((record: any) => ({
        id: record._id.toString(),
        userId: record.userId?._id?.toString() || record.userId?.toString(),
        userName: record.userId?.name || 'Anonymous',
        userAvatar: this.uploadService.ensureAbsoluteUrl(
          record.userId?.profile_picture || record.userId?.photo_profil || record.userId?.avatar || ''
        ),
        rating: record.rating,
        comment: record.review || '',
        createdAt: record.updatedAt || record.createdAt,
      }));

      // Calculate rating distribution
      const ratingDistribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      reviews.forEach(r => {
        if (r.rating >= 1 && r.rating <= 5) {
          ratingDistribution[Math.round(r.rating)]++;
        }
      });

      // Calculate average
      const totalReviews = reviews.length;
      const averageRating = totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

      console.log('✅ [REVIEWS] Found', totalReviews, 'reviews, average:', averageRating.toFixed(1));

      return {
        reviews,
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews,
        ratingDistribution,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('❌ [REVIEWS] Error getting reviews:', error);
      throw new InternalServerErrorException('Error fetching reviews');
    }
  }

  /**
   * Get current user's review for a community
   * @param communityId - ID of the community
   * @param userId - ID of the user
   * @returns User's review or null
   */
  async getUserCommunityReview(communityId: string, userId: string): Promise<{
    rating: number;
    comment: string;
    createdAt: Date;
  } | null> {
    try {
      console.log('⭐ [REVIEWS] Getting user review for community:', communityId, 'user:', userId);

      const progress = await this.contentProgressModel.findOne({
        contentId: communityId,
        contentType: TrackableContentType.COMMUNITY,
        userId: new Types.ObjectId(userId),
      });

      if (!progress || !progress.rating) {
        return null;
      }

      return {
        rating: progress.rating,
        comment: progress.review || '',
        createdAt: progress.updatedAt || progress.createdAt,
      };
    } catch (error) {
      console.error('❌ [REVIEWS] Error getting user review:', error);
      throw new InternalServerErrorException('Error fetching user review');
    }
  }

  /**
   * Submit or update a review for a community
   * @param communityId - ID of the community
   * @param userId - ID of the user
   * @param rating - Rating (1-5)
   * @param comment - Optional comment
   * @returns Updated review and community stats
   */
  async submitCommunityReview(
    communityId: string,
    userId: string,
    rating: number,
    comment?: string
  ): Promise<{
    review: { rating: number; comment: string };
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      console.log('⭐ [REVIEWS] Submitting review for community:', communityId, 'user:', userId, 'rating:', rating);

      // Validate rating
      if (rating < 1 || rating > 5) {
        throw new BadRequestException('Rating must be between 1 and 5');
      }

      // Find community
      const community = await this.communityModel.findById(communityId);
      if (!community) {
        throw new NotFoundException('Community not found');
      }

      // Check if user is a member
      const isMember = community.members.some(m => m.equals(new Types.ObjectId(userId)));
      if (!isMember) {
        throw new ForbiddenException('Only community members can leave reviews');
      }

      // Use tracking service to add/update rating
      await this.trackingService.addRating(
        userId,
        communityId,
        TrackableContentType.COMMUNITY,
        rating,
        comment
      );

      // Recalculate community average rating
      const allReviews = await this.contentProgressModel.find({
        contentId: communityId,
        contentType: TrackableContentType.COMMUNITY,
        rating: { $exists: true, $ne: null, $gte: 1 }
      });

      const totalReviews = allReviews.length;
      const averageRating = totalReviews > 0
        ? allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / totalReviews
        : 0;

      // Update community with new average
      await this.communityModel.findByIdAndUpdate(communityId, {
        averageRating: Math.round(averageRating * 10) / 10,
        ratingCount: totalReviews,
      });

      console.log('✅ [REVIEWS] Review submitted, new average:', averageRating.toFixed(1));

      return {
        review: { rating, comment: comment || '' },
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('❌ [REVIEWS] Error submitting review:', error);
      throw new InternalServerErrorException('Error submitting review');
    }
  }
}
