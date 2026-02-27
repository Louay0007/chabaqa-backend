import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import {
  Product,
  ProductDocument,
  ProductVariant,
  ProductFile,
} from '../schema/product.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import {
  CreateProductDto,
  CreateProductVariantDto,
  CreateProductFileDto,
} from '../dto-product/create-product.dto';
import { UpdateProductDto } from '../dto-product/update-product.dto';
import {
  ProductResponseDto,
  ProductListResponseDto,
  ProductStatsResponseDto,
  ProductVariantResponseDto,
  ProductFileResponseDto,
} from '../dto-product/product-response.dto';
import { FeeService } from '../common/services/fee.service';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { TrackableContentType } from '../schema/content-tracking.schema';
import { PolicyService } from '../common/services/policy.service';
import { PromoService } from '../common/services/promo.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    @InjectModel('ContentProgress') private contentProgressModel: Model<any>,
    private readonly feeService: FeeService,
    private readonly trackingService: ContentTrackingService,
    private readonly policyService: PolicyService,
    private readonly promoService: PromoService,
    private readonly uploadService: UploadService,
  ) {}

  private async findProductByAnyId(
    productId: string,
  ): Promise<ProductDocument> {
    let product = await this.productModel.findOne({ id: productId });
    if (!product && isValidObjectId(productId)) {
      product = await this.productModel.findById(productId);
    }
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private normalizeProductFileType(inputType?: string, filename?: string): string {
    const rawValue = String(inputType || '').trim().toLowerCase();
    const value = rawValue.split(';')[0].trim();
    const extension = String(filename || '')
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (!value && !extension) {
      return 'OTHER';
    }

    const map: Record<string, string> = {
      figma: 'Figma',
      fig: 'Figma',
      pdf: 'PDF',
      svg: 'SVG',
      png: 'PNG',
      jpg: 'JPG',
      jpeg: 'JPG',
      zip: 'ZIP',
      psd: 'PSD',
      ai: 'AI',
      sketch: 'SKETCH',
      xd: 'XD',
      mp4: 'MP4',
      mp3: 'MP3',
      doc: 'DOC',
      docx: 'DOCX',
      ppt: 'PPT',
      pptx: 'PPTX',
      xls: 'XLS',
      xlsx: 'XLSX',
      txt: 'TXT',
      md: 'MD',
      json: 'JSON',
      xml: 'XML',
      css: 'CSS',
      js: 'JS',
      html: 'HTML',
      php: 'PHP',
      py: 'PY',
      java: 'JAVA',
      cpp: 'CPP',
      c: 'C',
      other: 'OTHER',
      epub: 'OTHER',
      mobi: 'OTHER',
      odt: 'OTHER',
      rtf: 'OTHER',
      csv: 'OTHER',
      'image/png': 'PNG',
      'image/jpeg': 'JPG',
      'image/jpg': 'JPG',
      'application/pdf': 'PDF',
      'application/zip': 'ZIP',
      'application/x-zip-compressed': 'ZIP',
      'application/octet-stream': 'OTHER',
      'video/mp4': 'MP4',
      'audio/mpeg': 'MP3',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'DOCX',
      'application/msword': 'DOC',
      'application/vnd.ms-excel': 'XLS',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
      'application/vnd.ms-powerpoint': 'PPT',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        'PPTX',
      'text/plain': 'TXT',
      'text/markdown': 'MD',
      'application/json': 'JSON',
      'application/xml': 'XML',
      'text/xml': 'XML',
      'text/css': 'CSS',
      'application/javascript': 'JS',
      'text/javascript': 'JS',
      'text/html': 'HTML',
    };

    const normalized =
      map[value] ||
      map[value.replace(/^\./, '')] ||
      map[extension || ''] ||
      map[rawValue.replace(/^\./, '')];
    return normalized || 'OTHER';
  }

  private normalizeProductFiles(files: any[] = []): any[] {
    return files.map((file: any, idx: number) => ({
      id: file.id || new Types.ObjectId().toString(),
      name: String(file.name || '').trim(),
      url: String(file.url || '').trim(),
      type: this.normalizeProductFileType(file.type, file.name),
      size: file.size,
      description: file.description,
      order: file.order ?? idx,
      isActive: file.isActive !== false,
    }));
  }

  private async assertCanPublishProduct(userId: string): Promise<void> {
    const hasActiveSubscription = await this.policyService.hasActiveSubscription(userId);
    if (!hasActiveSubscription) {
      throw new ForbiddenException(
        'Un abonnement actif est requis pour publier un produit',
      );
    }
  }

  private buildCommunityLookupConditions(communityIds: string[]): any[] {
    return communityIds.flatMap((communityId) => [
      { _id: Types.ObjectId.isValid(communityId) ? new Types.ObjectId(communityId) : null },
      { id: communityId },
      { slug: communityId },
    ]).filter((condition) => Object.values(condition)[0] !== null);
  }

  private async resolveCommunitiesByKeys(communityIds: string[]): Promise<Map<string, CommunityDocument | null>> {
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

  private async recomputeProductRatings(productMongoId: string) {
    const stats = await this.contentProgressModel.aggregate([
      {
        $match: {
          contentType: TrackableContentType.PRODUCT,
          contentId: productMongoId,
          rating: { $gte: 1, $lte: 5 },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          ratingCount: { $sum: 1 },
        },
      },
    ]);

    const averageRating = Number(stats?.[0]?.averageRating || 0);
    const ratingCount = Number(stats?.[0]?.ratingCount || 0);

    await this.productModel.updateOne(
      { _id: new Types.ObjectId(productMongoId) },
      { $set: { averageRating, ratingCount } },
    );

    return { averageRating, ratingCount };
  }

  async getProductReviews(productId: string) {
    const product = await this.findProductByAnyId(productId);
    const contentId = product._id.toString();

    const docs = await this.contentProgressModel
      .find({
        contentType: TrackableContentType.PRODUCT,
        contentId,
        rating: { $gte: 1, $lte: 5 },
      })
      .populate('userId', 'name profile_picture photo_profil avatar')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    const reviews = (docs || []).map((d: any) => ({
      id: d.id || d._id?.toString(),
      user: {
        id: d.userId?._id?.toString() || d.userId?.toString(),
        name: d.userId?.name || 'User',
        avatar:
          d.userId?.avatar ||
          d.userId?.profile_picture ||
          d.userId?.photo_profil,
      },
      rating: d.rating || 0,
      message: d.review || '',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    const ratingSummary = await this.recomputeProductRatings(contentId);
    return { reviews, ...ratingSummary };
  }

  async getMyProductReview(productId: string, userId: string) {
    const product = await this.findProductByAnyId(productId);
    const contentId = product._id.toString();

    const doc: any = await this.contentProgressModel
      .findOne({
        contentType: TrackableContentType.PRODUCT,
        contentId,
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    if (!doc?.rating) return null;
    return {
      rating: doc.rating,
      message: doc.review || '',
      updatedAt: doc.updatedAt,
    };
  }

  async upsertProductReview(
    productId: string,
    userId: string,
    rating: number,
    message?: string,
  ) {
    const product = await this.findProductByAnyId(productId);
    const contentId = product._id.toString();

    await this.trackingService.addRating(
      userId,
      contentId,
      TrackableContentType.PRODUCT,
      rating,
      message,
    );
    const ratingSummary = await this.recomputeProductRatings(contentId);
    const myReview = await this.getMyProductReview(productId, userId);
    return { ...ratingSummary, myReview };
  }

  /**
   * Créer un nouveau produit
   */
  async create(
    createProductDto: CreateProductDto,
    userId: string,
  ): Promise<ProductResponseDto> {
    try {
      // Vérifier que la communauté existe (lookup by _id or slug)
      const community = await this.communityModel.findOne({
        $or: [
          { _id: createProductDto.communityId },
          { id: createProductDto.communityId },
          { slug: createProductDto.communityId },
        ],
      });
      if (!community) {
        throw new NotFoundException('Communauté non trouvée');
      }

      // Vérifier que l'utilisateur est créateur de la communauté
      // Normalize both IDs to strings for comparison
      const normalizedUserId =
        typeof userId === 'object'
          ? (userId as any).toString()
          : String(userId);
      const communityCreatorId = community.createur?.toString();

      console.log(
        `🔍 Creator check: user=${normalizedUserId}, community creator=${communityCreatorId}`,
      );

      if (communityCreatorId !== normalizedUserId) {
        throw new ForbiddenException(
          'Seuls les créateurs de communauté peuvent créer des produits',
        );
      }

      const requestedPublish = createProductDto.isPublished === true;
      if (requestedPublish) {
        await this.assertCanPublishProduct(normalizedUserId);
      }

      // Créer le produit
      console.log('📝 Creating product with DTO:', createProductDto);

      // Generate product ID
      const productId = new Types.ObjectId().toString();

      const normalizedFiles = this.normalizeProductFiles(createProductDto.files || []);

      const product = new this.productModel({
        ...createProductDto,
        id: productId,
        creatorId: new Types.ObjectId(userId),
        sales: 0,
        images: createProductDto.images || [],
        variants: createProductDto.variants || [],
        files: normalizedFiles,
        features: createProductDto.features || [],
        isPublished: requestedPublish,
      });

      const savedProduct = await product.save();
      console.log('✅ Product saved:', savedProduct._id);

      // Récupérer les informations complètes
      const populatedProduct = await this.productModel
        .findById(savedProduct._id)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .exec();

      console.log('✅ Product populated');
      const result = await this.transformToResponseDto(
        populatedProduct!,
        community,
      );
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
    search?: string,
    visibilityScope: 'owner' | 'public' = 'public',
  ): Promise<ProductListResponseDto> {
    const query: any = {};
    if (visibilityScope !== 'owner') {
      query.isPublished = true;
    }

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
    const normalizedType = String(type || '').trim().toLowerCase();
    if (normalizedType === 'digital' || normalizedType === 'physical') {
      query.type = normalizedType;
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
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.productModel
        .find(query)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(query),
    ]);

    // Récupérer les informations des communautés
    const communityIds = [...new Set(products.map((product) => String(product.communityId || '')).filter(Boolean))];
    const communityMap = await this.resolveCommunitiesByKeys(communityIds);

    const productsWithCommunities = await Promise.all(
      products.map(async (product) => {
        const community = communityMap.get(String(product.communityId || '')) || undefined;
        const transformed = await this.transformToResponseDto(product, community);
        const payload: any = {
          ...transformed,
          communityName: transformed.community?.name || null,
          communitySlug: transformed.community?.slug || null,
        };

        if (creatorId) {
          payload.productSlug = transformed.slug;
          payload.slug = payload.communitySlug || transformed.slug;
        }

        return payload;
      }),
    );

    return {
      products: productsWithCommunities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Récupérer les produits d'un créateur
   */
  async findByCreator(
    creatorId: string,
    page: number = 1,
    limit: number = 10,
    type?: string,
    visibilityScope: 'owner' | 'public' = 'public',
  ): Promise<ProductListResponseDto> {
    return this.findAll(
      page,
      limit,
      undefined,
      creatorId,
      undefined,
      type,
      undefined,
      undefined,
      undefined,
      visibilityScope,
    );
  }

  /**
   * Récupérer les produits d'une communauté
   */
  async findByCommunity(
    communityId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<ProductListResponseDto> {
    const normalizedCommunityId = String(communityId || '').trim();
    if (!normalizedCommunityId) {
      return this.findAll(page, limit);
    }

    const communityMap = await this.resolveCommunitiesByKeys([normalizedCommunityId]);
    const matchedCommunity = communityMap.get(normalizedCommunityId);

    const lookupKeys = Array.from(
      new Set(
        [
          normalizedCommunityId,
          matchedCommunity?._id?.toString(),
          String((matchedCommunity as any)?.id || ''),
          String(matchedCommunity?.slug || ''),
        ].filter(Boolean),
      ),
    );

    let firstResult: ProductListResponseDto | null = null;
    for (const key of lookupKeys) {
      const result = await this.findAll(page, limit, key);
      if (!firstResult) {
        firstResult = result;
      }
      if ((result.products || []).length > 0) {
        return result;
      }
    }

    return firstResult || this.findAll(page, limit, normalizedCommunityId);
  }

  /**
   * Récupérer un produit par son ID
   */
    async findOne(id: string): Promise<ProductResponseDto> {
    let product = await this.productModel
      .findOne({ id })
      .populate('creatorId', 'name email profile_picture photo_profil')
      .exec();

    if (!product && isValidObjectId(id)) {
      product = await this.productModel
        .findById(id)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .exec();
    }

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    const community = await this.communityModel.findOne({
      $or: [
        { _id: Types.ObjectId.isValid(product.communityId) ? new Types.ObjectId(product.communityId) : null },
        { id: product.communityId },
        { slug: product.communityId }
      ].filter(condition => Object.values(condition)[0] !== null)
    });
    return await this.transformToResponseDto(product, community || undefined);
  }

  /**
   * Mettre à jour un produit
   */
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    userId: string,
  ): Promise<ProductResponseDto> {
    const product = await this.productModel.findOne({ id });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    const requestsPublishing =
      updateProductDto.isPublished === true && product.isPublished !== true;
    if (requestsPublishing) {
      await this.assertCanPublishProduct(userId);
    }

    const normalizedUpdateDto: any = { ...updateProductDto };
    if (Array.isArray(normalizedUpdateDto.files)) {
      normalizedUpdateDto.files = this.normalizeProductFiles(normalizedUpdateDto.files);
    }

    // Mettre à jour le produit
    Object.assign(product, normalizedUpdateDto);
    product.updatedAt = new Date();

    const updatedProduct = await product.save();

    // Récupérer les informations complètes
    const populatedProduct = await this.productModel
      .findById(updatedProduct._id)
      .populate('creatorId', 'name email profile_picture photo_profil')
      .exec();

    const community = await this.communityModel.findOne({
      $or: [
        { _id: Types.ObjectId.isValid(product.communityId) ? new Types.ObjectId(product.communityId) : null },
        { id: product.communityId },
        { slug: product.communityId }
      ].filter(condition => Object.values(condition)[0] !== null)
    });
    return await this.transformToResponseDto(
      populatedProduct!,
      community || undefined,
    );
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
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres produits',
      );
    }

    await this.productModel.deleteOne({ _id: product._id });
    return { message: 'Produit supprimé avec succès' };
  }

  /**
   * Ajouter une variante à un produit
   */
  async addVariant(
    productId: string,
    createVariantDto: CreateProductVariantDto,
    userId: string,
  ): Promise<ProductVariantResponseDto> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    const variant: ProductVariant = {
      id: new Types.ObjectId().toString(),
      ...createVariantDto,
    };

    product.addVariant(variant);
    await product.save();

    return {
      id: variant.id,
      name: variant.name,
      price: variant.price,
      description: variant.description,
      inventory: variant.inventory,
    };
  }

  /**
   * Supprimer une variante d'un produit
   */
  async removeVariant(
    productId: string,
    variantId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    const variant = product.variants?.find((v) => v.id === variantId);
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
  async addFile(
    productId: string,
    createFileDto: CreateProductFileDto,
    userId: string,
  ): Promise<ProductFileResponseDto> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    const file: ProductFile = {
      id: new Types.ObjectId().toString(),
      order: createFileDto.order || 0,
      downloadCount: 0,
      isActive:
        createFileDto.isActive !== undefined ? createFileDto.isActive : true,
      uploadedAt: new Date(),
      ...createFileDto,
      type: this.normalizeProductFileType(createFileDto.type, createFileDto.name),
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
      uploadedAt: file.uploadedAt.toISOString(),
    };
  }

  /**
   * Supprimer un fichier d'un produit
   */
  async removeFile(
    productId: string,
    fileId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    const file = product.files?.find((f) => f.id === fileId);
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
  async updateInventory(
    productId: string,
    amount: number,
    userId: string,
  ): Promise<{ message: string; newInventory: number }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    if (product.type !== 'physical') {
      throw new BadRequestException(
        'Seuls les produits physiques peuvent avoir un inventaire',
      );
    }

    const success = product.updateInventory(amount);
    if (!success) {
      throw new BadRequestException('Inventaire insuffisant');
    }

    await product.save();

    return {
      message: 'Inventaire mis à jour avec succès',
      newInventory: product.inventory || 0,
    };
  }

  /**
   * Incrémenter les ventes d'un produit
   */
  async incrementSales(productId: string, amount: number = 1): Promise<void> {
    const product = await this.findProductByAnyId(productId);
    product.incrementSales(amount);
    await product.save();
  }

  /**
   * Basculer le statut de publication d'un produit
   */
  async togglePublished(
    productId: string,
    userId: string,
  ): Promise<{ message: string; isPublished: boolean }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    if (!product.isPublished) {
      await this.assertCanPublishProduct(userId);
    }

    product.isPublished = !product.isPublished;
    await product.save();

    return {
      message: `Produit ${product.isPublished ? 'publié' : 'dépublié'} avec succès`,
      isPublished: product.isPublished,
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
      totalFiles: product.getTotalFiles(),
    };
  }

  /**
   * Récupérer les produits d'un créateur
  }

  if (!file.isActive) {
    throw new BadRequestException('Ce fichier n\'est plus disponible');
  }

  const FREE_MODE = process.env.FREE_MODE === 'true';
  if (FREE_MODE) {
    file.downloadCount += 1;
    await product.save();
    return {
      downloadUrl: file.url,
      message: 'Fichier prêt pour téléchargement'
    };
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
  async updateFileStatus(
    productId: string,
    fileId: string,
    isActive: boolean,
    userId: string,
  ): Promise<{ message: string }> {
    const product = await this.productModel.findOne({ id: productId });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du produit
    if (product.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits',
      );
    }

    const file = product.files?.find((f) => f.id === fileId);
    if (!file) {
      throw new NotFoundException('Fichier non trouvé');
    }

    file.isActive = isActive;
    await product.save();

    return {
      message: `Fichier ${isActive ? 'activé' : 'désactivé'} avec succès`,
    };
  }

  /**
   * Transformer un document Product en DTO de réponse
   */
  private async transformToResponseDto(
    product: ProductDocument,
    community?: CommunityDocument | null,
  ): Promise<ProductResponseDto> {
    // Ensure absolute URLs for images
    const images = (product.images || []).map((img) =>
      this.uploadService.ensureAbsoluteUrl(img),
    );

    // Transformer les variantes
    const variants =
      product.variants?.map((variant) => ({
        id: variant.id,
        name: variant.name,
        price: variant.price,
        description: variant.description,
        inventory: variant.inventory,
      })) || [];

    // Transformer les fichiers
    const files = (product.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      url: this.uploadService.ensureAbsoluteUrl(file.url),
      type: file.type,
      size: file.size,
      description: file.description,
      order: file.order,
      downloadCount: file.downloadCount,
      isActive: file.isActive,
      uploadedAt: file.uploadedAt.toISOString(),
    }));

    // Récupérer les informations du créateur
    const creator = await this.userModel
      .findById(product.creatorId)
      .select('name email profile_picture photo_profil');

    return {
      id: product.id,
      title: product.title,
      slug: product.slug || product.id,
      description: product.description,
      price: product.price,
      currency: product.currency,
      communityId: product.communityId,
      community: community
        ? {
            id: community.id,
            name: community.name,
            slug: community.slug,
          }
        : {
            id: product.communityId,
            name: 'Communauté inconnue',
            slug: 'unknown',
          },
      communityName: community?.name || 'Communauté inconnue',
      communitySlug: community?.slug || 'unknown',
      creatorId: product.creatorId.toString(),
      creator: {
        id: product.creatorId.toString(),
        name: creator?.name || 'Créateur inconnu',
        email: creator?.email || '',
        avatar: this.uploadService.ensureAbsoluteUrl(
          (creator as any)?.profile_picture || (creator as any)?.photo_profil,
        ),
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
      averageRating: (product as any).averageRating || 0,
      ratingCount: (product as any).ratingCount || 0,
      licenseTerms: (product as any).licenseTerms,
      features: (product as any).features,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  /**
   * Récupérer les produits achetés par l'utilisateur
   */
  async getMyPurchases(userId: string): Promise<any[]> {
    try {
      const buyerFilter: any = Types.ObjectId.isValid(userId)
        ? { $in: [new Types.ObjectId(userId), userId] }
        : userId;

      const orders = await this.orderModel
        .find({
          buyerId: buyerFilter,
          contentType: TrackableContentType.PRODUCT,
          status: 'paid',
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (!orders?.length) return [];

      // Keep the most recent paid order per product content id.
      const latestOrderByContentId = new Map<string, any>();
      for (const order of orders) {
        const contentId = String(order?.contentId || '');
        if (!contentId || latestOrderByContentId.has(contentId)) continue;
        latestOrderByContentId.set(contentId, order);
      }

      const contentIds = Array.from(latestOrderByContentId.keys());
      const mongoContentIds = contentIds.filter((id) => Types.ObjectId.isValid(id));

      const [productsByMongoId, productsByCustomId] = await Promise.all([
        mongoContentIds.length > 0
          ? this.productModel
              .find({ _id: { $in: mongoContentIds.map((id) => new Types.ObjectId(id)) } })
              .lean()
              .exec()
          : Promise.resolve([]),
        this.productModel
          .find({ id: { $in: contentIds } })
          .lean()
          .exec(),
      ]);

      const productsLookup = new Map<string, any>();
      for (const product of [...productsByMongoId, ...productsByCustomId]) {
        const mongoId = product?._id?.toString();
        if (mongoId) productsLookup.set(mongoId, product);
        if (product?.id) productsLookup.set(String(product.id), product);
      }

      const communityKeyMap = await this.resolveCommunitiesByKeys(
        Array.from(
          new Set(
            [...productsByMongoId, ...productsByCustomId]
              .map((product: any) => String(product?.communityId || '').trim())
              .filter(Boolean),
          ),
        ),
      );

      const creatorIds = Array.from(
        new Set(
          [...productsByMongoId, ...productsByCustomId]
            .map((product: any) => product?.creatorId?.toString?.() || '')
            .filter(Boolean),
        ),
      );

      const creators =
        creatorIds.length > 0
          ? await this.userModel
              .find({ _id: { $in: creatorIds.map((id) => new Types.ObjectId(id)) } })
              .select('name email profile_picture photo_profil')
              .lean()
              .exec()
          : [];
      const creatorsLookup = new Map<string, any>();
      for (const creator of creators) {
        creatorsLookup.set(String(creator?._id), creator);
      }

      const purchasedProducts: any[] = [];
      for (const [contentId, order] of latestOrderByContentId.entries()) {
        const product = productsLookup.get(contentId);
        if (!product) continue;

        const productMongoId = String(product?._id || '');
        const productCustomId = String(product?.id || productMongoId || contentId);
        const totalDownloads =
          (product?.files || []).reduce(
            (sum: number, file: any) => sum + Number(file?.downloadCount || 0),
            0,
          ) || 0;

        const creator = creatorsLookup.get(String(product?.creatorId || ''));
        const creatorInfo = creator
          ? {
              _id: String(creator._id),
              name: creator.name,
              email: creator.email,
              avatar: this.uploadService.ensureAbsoluteUrl(
                creator.profile_picture || creator.photo_profil,
              ),
            }
          : null;

        const communityKey = String(product?.communityId || '').trim();
        const community = communityKey ? communityKeyMap.get(communityKey) : null;
        const communityInfo = community
          ? {
              _id: String(community._id),
              id: String((community as any).id || ''),
              name: community.name,
              slug: community.slug,
            }
          : null;

        purchasedProducts.push({
          _id: productMongoId,
          id: productCustomId,
          productId: productCustomId,
          contentId: productMongoId,
          title: product.title,
          description: product.description,
          short_description: product.description,
          price: product.price,
          currency: product.currency || 'TND',
          category: product.category,
          type: product.type,
          images: product.images || [],
          thumbnail: product.images?.[0] || null,
          is_published: Boolean(product.isPublished),
          stock_quantity: product.inventory,
          rating: Number((product as any).averageRating || product.rating || 0),
          reviews_count: Number((product as any).ratingCount || 0),
          downloads_count: totalDownloads,
          purchases_count: Number(product.sales || 0),
          variants: product.variants || [],
          files:
            (product.files || []).map((file: any) => ({
              ...file,
              url: this.uploadService.ensureAbsoluteUrl(file?.url),
            })) || [],
          tags: product.tags || [],
          created_at:
            product.createdAt instanceof Date
              ? product.createdAt.toISOString()
              : new Date(product.createdAt || Date.now()).toISOString(),
          updated_at:
            product.updatedAt instanceof Date
              ? product.updatedAt.toISOString()
              : new Date(product.updatedAt || Date.now()).toISOString(),
          created_by: creatorInfo,
          community_id: communityInfo,
          purchase_details: {
            order_id: String(order?._id || ''),
            purchased_at: new Date(order?.createdAt || Date.now()).toISOString(),
            amount_paid: Number(order?.amountDT || product.price || 0),
            currency: 'TND',
            quantity: 1,
          },
          purchasedAt: new Date(order?.createdAt || Date.now()).toISOString(),
          downloadCount: totalDownloads,
          orderId: String(order?._id || ''),
          amountPaid: Number(order?.amountDT || product.price || 0),
        });
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
  async checkUserPurchase(
    productId: string,
    userId: string,
  ): Promise<{ purchased: boolean; purchase?: any }> {
    try {
      // Find the product first (accept both custom id and Mongo _id)
      let product = await this.productModel.findOne({ id: productId });
      if (!product && isValidObjectId(productId)) {
        product = await this.productModel.findById(productId);
      }
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const FREE_MODE = process.env.FREE_MODE === 'true';
      if (FREE_MODE) {
        return {
          purchased: true,
          purchase: {
            productId: product.id,
            purchasedAt: new Date().toISOString(),
            downloadCount:
              product.files?.reduce(
                (sum, file) => sum + (file.downloadCount || 0),
                0,
              ) || 0,
            amountPaid: 0,
          },
        };
      }

      // Check for existing order (manual payment flow)
      const buyerFilter: any = Types.ObjectId.isValid(userId)
        ? { $in: [new Types.ObjectId(userId), userId] }
        : userId;

      const productContentIds = Array.from(
        new Set([String(product._id || ''), String(product.id || '')].filter(Boolean)),
      );

      const order = await this.orderModel.findOne({
        buyerId: buyerFilter,
        contentType: TrackableContentType.PRODUCT,
        contentId: { $in: productContentIds },
        status: 'paid',
      });

      if (order) {
        // Calculate total downloads for this product
        const totalDownloads =
          product.files?.reduce(
            (sum, file) => sum + (file.downloadCount || 0),
            0,
          ) || 0;

        return {
          purchased: true,
          purchase: {
            productId: product.id,
            purchasedAt:
              order.createdAt?.toISOString() || new Date().toISOString(),
            downloadCount: totalDownloads,
            orderId: order._id.toString(),
            amountPaid: order.amountDT || order.amount || product.price,
          },
        };
      }

      // Check if user has product in purchasedProducts array (wallet payment flow)
      const user = await this.userModel
        .findById(userId)
        .select('purchasedProducts');
      if (
        user?.purchasedProducts?.some((p: Types.ObjectId) =>
          p.equals(product._id),
        )
      ) {
        const totalDownloads =
          product.files?.reduce(
            (sum, file) => sum + (file.downloadCount || 0),
            0,
          ) || 0;
        return {
          purchased: true,
          purchase: {
            productId: product.id,
            purchasedAt: new Date().toISOString(),
            downloadCount: totalDownloads,
            amountPaid: product.price,
          },
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

  /**
   * Télécharger un fichier de produit
   */
  async downloadFile(
    productId: string,
    fileId: string,
    userId: string,
    promoCode?: string,
  ): Promise<{ downloadUrl: string; message: string }> {
    // Find the product
    const product = await this.findProductByAnyId(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Find the file
    const file = product.files?.find((f) => f.id === fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (!file.isActive) {
      throw new BadRequestException('This file is not available for download');
    }

    // Check if user has purchased the product or if it's free
    const purchaseCheck = await this.checkUserPurchase(productId, userId);

    // Apply promo code if provided
    let discountPercent = 0;
    if (promoCode && !purchaseCheck.purchased) {
      try {
        const promoResult = await this.promoService.validateAndApply(
          promoCode,
          product.price,
          TrackableContentType.PRODUCT,
          product._id.toString(),
        );
        if (promoResult.valid) {
          discountPercent = promoResult.discountDT
            ? (promoResult.discountDT / product.price) * 100
            : 0;
        }
      } catch (error) {
        console.log('Invalid promo code:', error);
      }
    }

    // Check if purchase is required (product is not free and user hasn't purchased)
    if (
      product.price > 0 &&
      !purchaseCheck.purchased &&
      discountPercent < 100
    ) {
      throw new ForbiddenException(
        'You must purchase this product before downloading its files',
      );
    }

    // Increment download count
    file.downloadCount = (file.downloadCount || 0) + 1;
    await product.save();

    // Track the download
    await this.trackingService.trackDownload(
      userId,
      product._id.toString(),
      TrackableContentType.PRODUCT,
    );

    return {
      downloadUrl: this.uploadService.ensureAbsoluteUrl(file.url),
      message: 'File ready for download',
    };
  }
}
