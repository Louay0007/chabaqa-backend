import { Injectable, ConflictException, NotFoundException, InternalServerErrorException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument, UserRole } from '../schema/user.schema';
import { CreateCommunityDto } from '../dto-community/create-community.dto';
import { JoinCommunityDto, JoinByInviteDto, GenerateInviteDto } from '../dto-community/join-community.dto';
import { UploadService } from 'src/upload/upload.service';
import { PolicyService } from '../common/services/policy.service';
import { PromoService } from '../common/services/promo.service';
import { FeeService } from '../common/services/fee.service';
import { TrackableContentType, ContentProgressDocument } from '../schema/content-tracking.schema';
import { NotificationService } from '../notification/notification.service';
import { ContentTrackingService } from '../common/services/content-tracking.service';

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

  /**
   * Créer une nouvelle communauté
   * @param createCommunityDto - Données de la communauté à créer selon l'interface CommunityFormData
   * @param uploadedFiles - Fichiers uploadés traités
   * @param userId - ID de l'utilisateur créateur
   * @returns La communauté créée
   */
  async createCommunity(createCommunityDto: CreateCommunityDto, uploadedFiles: { logo?: string }, userId: string): Promise<CommunityDocument> {
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
          showStats: true,
          showFeatures: true,
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
        $push: {
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
      );

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
      return this.transformCommunityForFrontend(populatedCommunity);

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
  private transformCommunityForFrontend(community: CommunityDocument): any {
    // Extract logo with proper fallback chain and ensure absolute URL
    const logoUrl = this.uploadService.ensureAbsoluteUrl(
      community.settings?.logo ||
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
    const rawCoverImage = community.photo_de_couverture || community.coverImage || community.settings?.heroBackground || '';
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
      members: community.membersCount,
      rating: (community as any).averageRating || 0,
      averageRating: (community as any).averageRating || 0,
      ratingCount: (community as any).ratingCount || 0,
      price: community.price || community.fees_of_join,
      priceType: community.priceType,
      tags: community.tags,
      featured: community.featured,
      verified: community.isVerified,
      createdDate: community.createdDate || community.createdAt.toISOString(),
      updatedDate: community.updatedDate || community.updatedAt.toISOString(),
      settings: {
        primaryColor: community.settings?.primaryColor || '#3b82f6',
        secondaryColor: community.settings?.secondaryColor || '#1e40af',
        welcomeMessage: community.settings?.welcomeMessage || `Bienvenue dans ${community.name} !`,
        features: community.settings?.features || [],
        benefits: community.settings?.benefits || [],
        template: community.settings?.template || 'modern',
        fontFamily: community.settings?.fontFamily || 'Inter',
        borderRadius: community.settings?.borderRadius || 12,
        backgroundStyle: community.settings?.backgroundStyle || 'gradient',
        heroLayout: community.settings?.heroLayout || 'centered',
        showStats: community.settings?.showStats ?? true,
        showFeatures: community.settings?.showFeatures ?? true,
        showTestimonials: community.settings?.showTestimonials ?? true,
        showPosts: community.settings?.showPosts ?? true,
        showFAQ: community.settings?.showFAQ ?? true,
        enableAnimations: community.settings?.enableAnimations ?? true,
        enableParallax: community.settings?.enableParallax ?? false,
        logo: logoUrl, // Use the same logo URL for consistency
        heroBackground: this.uploadService.ensureAbsoluteUrl(
          community.settings?.heroBackground || 'https://via.placeholder.com/1200x600'
        ),
        gallery: (community.settings?.gallery || []).map(url => this.uploadService.ensureAbsoluteUrl(url)),
        videoUrl: community.settings?.videoUrl || '',
        socialLinks: {
          twitter: community.settings?.socialLinks?.twitter || '',
          instagram: community.settings?.socialLinks?.instagram || '',
          linkedin: community.settings?.socialLinks?.linkedin || '',
          discord: community.settings?.socialLinks?.discord || '',
          behance: community.settings?.socialLinks?.behance || '',
          github: community.settings?.socialLinks?.github || '',
          facebook: community.settings?.socialLinks?.facebook || '',
          youtube: community.settings?.socialLinks?.youtube || '',
          tiktok: community.settings?.socialLinks?.tiktok || '',
          website: community.settings?.socialLinks?.website || '',
        },
        customSections: community.settings?.customSections || [],
        metaTitle: community.settings?.metaTitle || `${community.name} - Communauté`,
        metaDescription: community.settings?.metaDescription || community.short_description,
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
      membersCount: community.membersCount,
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
          .populate('createur', 'name email profile_picture photo_profil bio')
          .populate('members', 'name email avatar photo')
          .populate('admins', 'name email avatar photo')
          .populate('moderateurs', 'name email avatar photo')
          .exec();
      } else {
        // Query by slug
        community = await this.communityModel
          .findOne({ slug: idOrSlug })
          .populate('createur', 'name email profile_picture photo_profil bio')
          .populate('members', 'name email avatar photo')
          .populate('admins', 'name email avatar photo')
          .populate('moderateurs', 'name email avatar photo')
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

      // Find and delete the community
      const result = await this.communityModel.findByIdAndDelete(communityId);
      
      if (!result) {
        throw new NotFoundException('Community not found');
      }

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
