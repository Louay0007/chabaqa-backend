import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument, ProductVariant, ProductFile } from '../schema/product.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreateProductDto, CreateProductVariantDto, CreateProductFileDto } from '../dto-product/create-product.dto';
import { UpdateProductDto } from '../dto-product/update-product.dto';
import {
  ProductResponseDto,
  ProductListResponseDto,
  ProductStatsResponseDto,
  ProductVariantResponseDto,
  ProductFileResponseDto
} from '../dto-product/product-response.dto';
import { FeeService } from '../common/services/fee.service';
import { TrackableContentType } from '../schema/content-tracking.schema';
import { PolicyService } from '../common/services/policy.service';
import { PromoService } from '../common/services/promo.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    private readonly feeService: FeeService,
    private readonly policyService: PolicyService,
    private readonly promoService: PromoService,
    private readonly uploadService: UploadService,
  ) { }

  /**
   * Créer un nouveau produit
   */
  async create(createProductDto: CreateProductDto, userId: string): Promise<ProductResponseDto> {
    try {
      // Vérifier que la communauté existe (lookup by _id or slug)
      const community = await this.communityModel.findOne({
        $or: [
          { _id: createProductDto.communityId },
          { id: createProductDto.communityId },
          { slug: createProductDto.communityId }
        ]
      });
      if (!community) {
        throw new NotFoundException('Communauté non trouvée');
      }

      // Vérifier que l'utilisateur est créateur de la communauté
      // Normalize both IDs to strings for comparison
      const normalizedUserId = typeof userId === 'object' ? (userId as any).toString() : String(userId);
      const communityCreatorId = community.createur?.toString();

      console.log(`🔍 Creator check: user=${normalizedUserId}, community creator=${communityCreatorId}`);

      if (communityCreatorId !== normalizedUserId) {
        throw new ForbiddenException('Seuls les créateurs de communauté peuvent créer des produits');
      }

      // Créer le produit
      console.log('📝 Creating product with DTO:', createProductDto);

      // Generate product ID
      const productId = new Types.ObjectId().toString();

      // Normalize file types and add IDs
      const normalizedFiles = (createProductDto.files || []).map((f: any, idx: number) => {
        // Map MIME types to enum values
        const mimeToEnum: { [key: string]: string } = {
          'image/png': 'PNG',
          'image/jpeg': 'JPG',
          'image/jpg': 'JPG',
          'application/pdf': 'PDF',
          'application/zip': 'ZIP',
          'video/mp4': 'MP4',
          'audio/mpeg': 'MP3',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
          'application/msword': 'DOC',
        };

        const fileType = mimeToEnum[f.type] || f.type || 'OTHER';

        return {
          id: f.id || new Types.ObjectId().toString(),
          name: f.name,
          url: f.url,
          type: fileType,
          size: f.size,
          description: f.description,
          order: f.order ?? idx,
          isActive: f.isActive !== false,
        };
      });

      const product = new this.productModel({
        ...createProductDto,
        id: productId,
        creatorId: new Types.ObjectId(userId),
        sales: 0,
        images: createProductDto.images || [],
        variants: createProductDto.variants || [],
        files: normalizedFiles,
        features: createProductDto.features || []
      });

      const savedProduct = await product.save();
      console.log('✅ Product saved:', savedProduct._id);

      // Récupérer les informations complètes
      const populatedProduct = await this.productModel
        .findById(savedProduct._id)
        .populate('creatorId', 'name email profile_picture')
        .exec();

      console.log('✅ Product populated');
      const result = await this.transformToResponseDto(populatedProduct!, community);
      console.log('✅ Product transformed to response DTO');
      return result;
    } catch (error) {
      console.error('❌ Error in product creation:', error);
      throw error;
    }
  }

  /**
   * Récupérer tous les produits avec pagination et filtres
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    communityId?: string,
    creatorId?: string,
    category?: string,
    type?: string,
    minPrice?: number,
    maxPrice?: number,
    search?: string
  ): Promise<ProductListResponseDto> {
    const query: any = { isPublished: true };

    // Filtres
    if (communityId) {
      query.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId).toString()
        : communityId;
    }
    if (creatorId) {
      query.creatorId = new Types.ObjectId(creatorId);
    }
    if (category) {
      query.category = { $regex: category, $options: 'i' };
    }
    if (type) {
      query.type = type;
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) query.price.$gte = minPrice;
      if (maxPrice !== undefined) query.price.$lte = maxPrice;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.productModel
        .find(query)
        .populate('creatorId', 'name email profile_picture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(query)
    ]);

    // Récupérer les informations des communautés
    const communityIds = [...new Set(products.map(product => product.communityId))];
    const communities = await this.communityModel.find({ id: { $in: communityIds } });

    const productsWithCommunities = await Promise.all(
      products.map(async product => {
        const community = communities.find(c => c.id === product.communityId);
        return await this.transformToResponseDto(product, community);
      })
    );

    return {
      products: productsWithCommunities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Récupérer un produit par son ID
   */
  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.productModel
      .findOne({ id })
      .populate('creatorId', 'name email profile_picture')
      .exec();

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    const community = await this.communityModel.findOne({ id: product.communityId });
    return await this.transformToResponseDto(product, community || undefined);
  }

  /**
   * Mettre à jour un produit
   */
  async update(id: string, updateProductDto: UpdateProductDto, userId: string): Promise<ProductResponseDto> {
    const product = await this.productModel.findOne({ id });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    // Gating: require active subscription to activate/publish product (if fields exist)
    const hasSub = await this.policyService.hasActiveSubscription(userId);
    const nextIsPublished = (updateProductDto as any)?.isPublished;
    const nextIsActive = (updateProductDto as any)?.isActive;
    if (!hasSub && (nextIsPublished || nextIsActive)) {
      throw new ForbiddenException('Un abonnement actif est requis pour publier/activer un produit');
    }

    // Mettre à jour le produit
    Object.assign(product, updateProductDto);
    product.updatedAt = new Date();

    const updatedProduct = await product.save();

    // Récupérer les informations complètes
    const populatedProduct = await this.productModel
      .findById(updatedProduct._id)
      .populate('creatorId', 'name email profile_picture')
      .exec();

    const community = await this.communityModel.findOne({ id: product.communityId });
    return await this.transformToResponseDto(populatedProduct!, community || undefined);
  }

  /**
   * Supprimer un produit
   */
  async remove(id: string, userId: string): Promise<{ message: string }> {
    const product = await this.productModel.findOne({ id });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres produits');
    }

    await this.productModel.deleteOne({ _id: product._id });
    return { message: 'Produit supprimé avec succès' };
  }

  /**
   * Ajouter une variante à un produit
   */
  async addVariant(productId: string, createVariantDto: CreateProductVariantDto, userId: string): Promise<ProductVariantResponseDto> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    const variant: ProductVariant = {
      id: new Types.ObjectId().toString(),
      ...createVariantDto
    };

    product.addVariant(variant);
    await product.save();

    return {
      id: variant.id,
      name: variant.name,
      price: variant.price,
      description: variant.description,
      inventory: variant.inventory
    };
  }

  /**
   * Supprimer une variante d'un produit
   */
  async removeVariant(productId: string, variantId: string, userId: string): Promise<{ message: string }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    const variant = product.variants?.find(v => v.id === variantId);
    if (!variant) {
      throw new NotFoundException('Variante non trouvée');
    }

    product.removeVariant(variantId);
    await product.save();

    return { message: 'Variante supprimée avec succès' };
  }

  /**
   * Ajouter un fichier à un produit
   */
  async addFile(productId: string, createFileDto: CreateProductFileDto, userId: string): Promise<ProductFileResponseDto> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    const file: ProductFile = {
      id: new Types.ObjectId().toString(),
      order: createFileDto.order || 0,
      downloadCount: 0,
      isActive: createFileDto.isActive !== undefined ? createFileDto.isActive : true,
      uploadedAt: new Date(),
      ...createFileDto
    };

    product.addFile(file);
    await product.save();

    return {
      id: file.id,
      name: file.name,
      url: file.url,
      type: file.type,
      size: file.size,
      description: file.description,
      order: file.order,
      downloadCount: file.downloadCount,
      isActive: file.isActive,
      uploadedAt: file.uploadedAt.toISOString()
    };
  }

  /**
   * Supprimer un fichier d'un produit
   */
  async removeFile(productId: string, fileId: string, userId: string): Promise<{ message: string }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    const file = product.files?.find(f => f.id === fileId);
    if (!file) {
      throw new NotFoundException('Fichier non trouvé');
    }

    product.removeFile(fileId);
    await product.save();

    return { message: 'Fichier supprimé avec succès' };
  }

  /**
   * Mettre à jour l'inventaire d'un produit
   */
  async updateInventory(productId: string, amount: number, userId: string): Promise<{ message: string; newInventory: number }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    if (product.type !== 'physical') {
      throw new BadRequestException('Seuls les produits physiques peuvent avoir un inventaire');
    }

    const success = product.updateInventory(amount);
    if (!success) {
      throw new BadRequestException('Inventaire insuffisant');
    }

    await product.save();

    return {
      message: 'Inventaire mis à jour avec succès',
      newInventory: product.inventory || 0
    };
  }

  /**
   * Incrémenter les ventes d'un produit
   */
  async incrementSales(productId: string, amount: number = 1): Promise<void> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    product.incrementSales(amount);
    await product.save();
  }

  /**
   * Basculer le statut de publication d'un produit
   */
  async togglePublished(productId: string, userId: string): Promise<{ message: string; isPublished: boolean }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    product.isPublished = !product.isPublished;
    await product.save();

    return {
      message: `Produit ${product.isPublished ? 'publié' : 'dépublié'} avec succès`,
      isPublished: product.isPublished
    };
  }

  /**
   * Récupérer les statistiques d'un produit
   */
  async getProductStats(productId: string): Promise<ProductStatsResponseDto> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    return {
      productId: product.id,
      totalSales: product.sales,
      remainingInventory: product.inventory || 0,
      averageRating: product.rating || 0,
      totalVariants: product.getTotalVariants(),
      totalFiles: product.getTotalFiles()
    };
  }

  /**
   * Récupérer les produits d'un créateur
   */
  async findByCreator(
    creatorId: string,
    page: number = 1,
    limit: number = 10,
    communityId?: string,
    type?: string,
  ): Promise<ProductListResponseDto> {
    return this.findAll(page, limit, communityId, creatorId, undefined, type);
  }

  /**
   * Récupérer les produits d'une communauté
   */
  async findByCommunity(communityId: string, page: number = 1, limit: number = 10): Promise<ProductListResponseDto> {
    return this.findAll(page, limit, communityId);
  }

  /**
   * Télécharger un fichier de produit (incrémente le compteur)
   */
  async downloadFile(productId: string, fileId: string, userId: string, promoCode?: string): Promise<{ downloadUrl: string; message: string }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    const file = product.files?.find(f => f.id === fileId);
    if (!file) {
      throw new NotFoundException('Fichier non trouvé');
    }

    if (!file.isActive) {
      throw new BadRequestException('Ce fichier n\'est plus disponible');
    }

    // Enregistrer une commande si fichier payant (produit numérique) avec application promo puis incrémenter le compteur
    const price = product.price || 0;
    if (product.type === 'digital' && price > 0) {
      let effective = price;
      let discountDT = 0;
      let appliedCode: string | undefined;
      if (promoCode) {
        const buyer = await this.userModel.findById(userId).select('email');
        const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.PRODUCT, product._id.toString(), (buyer as any)?.email);
        if (promo.valid) {
          effective = promo.finalAmountDT;
          discountDT = promo.discountDT;
          appliedCode = promo.appliedCode;
        }
      }
      const breakdown = await this.feeService.calculateForAmount(effective, product.creatorId.toString());
      await this.orderModel.create({
        buyerId: new Types.ObjectId(userId),
        creatorId: product.creatorId,
        contentType: TrackableContentType.PRODUCT,
        contentId: product._id.toString(),
        amountDT: breakdown.amountDT,
        platformPercent: breakdown.platformPercent,
        platformFixedDT: breakdown.platformFixedDT,
        platformFeeDT: breakdown.platformFeeDT,
        creatorNetDT: breakdown.creatorNetDT,
        promoCode: appliedCode,
        discountDT,
        status: 'paid'
      });
    }
    // Incrémenter le compteur de téléchargements
    file.downloadCount += 1;
    await product.save();

    return {
      downloadUrl: file.url,
      message: 'Fichier prêt pour téléchargement'
    };
  }

  /**
   * Mettre à jour le statut d'un fichier
   */
  async updateFileStatus(productId: string, fileId: string, isActive: boolean, userId: string): Promise<{ message: string }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres produits');
    }

    const file = product.files?.find(f => f.id === fileId);
    if (!file) {
      throw new NotFoundException('Fichier non trouvé');
    }

    file.isActive = isActive;
    await product.save();

    return {
      message: `Fichier ${isActive ? 'activé' : 'désactivé'} avec succès`
    };
  }

  /**
   * Transformer un document Product en DTO de réponse
   */
  private async transformToResponseDto(product: ProductDocument, community?: CommunityDocument | null): Promise<ProductResponseDto> {
    // Ensure absolute URLs for images
    const images = (product.images || []).map(img => this.uploadService.ensureAbsoluteUrl(img));

    // Transformer les variantes
    const variants = product.variants?.map(variant => ({
      id: variant.id,
      name: variant.name,
      price: variant.price,
      description: variant.description,
      inventory: variant.inventory
    })) || [];

    // Transformer les fichiers
    const files = (product.files || []).map(file => ({
      id: file.id,
      name: file.name,
      url: this.uploadService.ensureAbsoluteUrl(file.url),
      type: file.type,
      size: file.size,
      description: file.description,
      order: file.order,
      downloadCount: file.downloadCount,
      isActive: file.isActive,
      uploadedAt: file.uploadedAt.toISOString()
    }));

    // Récupérer les informations du créateur
    const creator = await this.userModel.findById(product.creatorId).select('name email profile_picture photo_profil');

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      currency: product.currency,
      communityId: product.communityId,
      community: community ? {
        id: community.id,
        name: community.name,
        slug: community.slug
      } : {
        id: product.communityId,
        name: 'Communauté inconnue',
        slug: 'unknown'
      },
      creatorId: product.creatorId.toString(),
      creator: {
        id: product.creatorId.toString(),
        name: creator?.name || 'Créateur inconnu',
        email: creator?.email || '',
        avatar: this.uploadService.ensureAbsoluteUrl((creator as any)?.profile_picture || (creator as any)?.photo_profil)
      },
      isPublished: product.isPublished,
      inventory: product.inventory,
      sales: product.sales,
      category: product.category,
      type: product.type,
      images,
      variants,
      files,
      rating: product.rating,
      licenseTerms: (product as any).licenseTerms,
      isRecurring: (product as any).isRecurring,
      recurringInterval: (product as any).recurringInterval,
      features: (product as any).features,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString()
    };
  }

  /**
   * Récupérer les produits achetés par l'utilisateur
   */
  async getMyPurchases(userId: string): Promise<any[]> {
    try {
      // Chercher toutes les commandes de l'utilisateur pour des produits
      const orders = await this.orderModel.find({
        user: userId,
        status: 'completed',
        'items.type': 'product'
      })
        .populate({
          path: 'items.itemId',
          model: 'Product',
          populate: [
            {
              path: 'communityId',
              model: 'Community',
              select: 'name slug'
            },
            {
              path: 'creatorId',
              model: 'User',
              select: 'name email'
            }
          ]
        })
        .sort({ createdAt: -1 })
        .exec();

      // Extraire les produits uniques des commandes
      const purchasedProducts: any[] = [];
      const seenProductIds = new Set();

      for (const order of orders) {
        for (const item of order.items) {
          if (item.type === 'product' && item.itemId && !seenProductIds.has(item.itemId._id.toString())) {
            seenProductIds.add(item.itemId._id.toString());

            const product = item.itemId;

            // Informations de la communauté
            const communityInfo = product.communityId ? {
              _id: product.communityId._id.toString(),
              name: product.communityId.name,
              slug: product.communityId.slug
            } : null;

            // Informations du créateur
            const creatorInfo = product.creatorId ? {
              _id: product.creatorId._id.toString(),
              name: product.creatorId.name,
              email: product.creatorId.email
            } : null;

            purchasedProducts.push({
              _id: product._id.toString(),
              title: product.title,
              description: product.description,
              short_description: product.description,
              price: product.price,
              currency: product.currency,
              category: product.category,
              type: product.type,
              images: product.images || [],
              thumbnail: product.images?.[0],
              is_published: product.isPublished,
              stock_quantity: product.inventory,
              rating: product.rating || 0,
              reviews_count: product.ratingCount || 0,
              downloads_count: product.files?.reduce((total, file) => total + (file.downloadCount || 0), 0) || 0,
              purchases_count: product.sales || 0,
              variants: product.variants || [],
              files: product.files || [],
              tags: product.tags || [],
              created_at: product.createdAt?.toISOString() || new Date().toISOString(),
              updated_at: product.updatedAt?.toISOString() || new Date().toISOString(),
              created_by: creatorInfo,
              community_id: communityInfo,
              // Détails de l'achat
              purchase_details: {
                order_id: order._id.toString(),
                purchased_at: order.createdAt.toISOString(),
                amount_paid: item.price,
                currency: order.currency || 'TND',
                quantity: item.quantity || 1
              }
            });
          }
        }
      }

      return purchasedProducts;
    } catch (error) {
      console.error('Erreur lors de la récupération des achats:', error);
      throw error;
    }
  }

  /**
   * Check if user has purchased a product
   */
  async checkUserPurchase(productId: string, userId: string): Promise<{ purchased: boolean; purchase?: any }> {
    try {
      // Find the product first
      const product = await this.productModel.findOne({ id: productId });
      if (!product) {
        throw new NotFoundException('Produit non trouvé');
      }

      // Check for existing order
      const order = await this.orderModel.findOne({
        buyerId: new Types.ObjectId(userId),
        contentType: TrackableContentType.PRODUCT,
        contentId: product._id.toString(),
        status: 'paid'
      });

      if (order) {
        // Calculate total downloads for this product
        const totalDownloads = product.files?.reduce((sum, file) => sum + (file.downloadCount || 0), 0) || 0;

        return {
          purchased: true,
          purchase: {
            productId: product.id,
            purchasedAt: order.createdAt?.toISOString() || new Date().toISOString(),
            downloadCount: totalDownloads,
            orderId: order._id.toString(),
            amountPaid: order.amountDT || order.amount || product.price
          }
        };
      }

      // Also check if product is free and user has "claimed" it
      if (product.price === 0) {
        // For free products, check if there's any download record
        // This could be enhanced with a separate "claims" collection
        return { purchased: false };
      }

      return { purchased: false };
    } catch (error) {
      console.error('Error checking user purchase:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      return { purchased: false };
    }
  }
}