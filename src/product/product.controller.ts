import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  UseInterceptors
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto, CreateProductVariantDto, CreateProductFileDto } from '../dto-product/create-product.dto';
import { UpdateProductDto } from '../dto-product/update-product.dto';
import {
  ProductResponseDto,
  ProductListResponseDto,
  ProductStatsResponseDto,
  ProductVariantResponseDto,
  ProductFileResponseDto
} from '../dto-product/product-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';

@ApiTags('Products')
@Controller('products')
@UseInterceptors(HttpCacheInterceptor)
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  private getRequestUserId(req: any): string {
    return (
      req?.user?._id ||
      req?.user?.userId ||
      req?.user?.sub ||
      req?.user?.id ||
      ''
    ).toString();
  }

  @Post()
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouveau produit' })
  @ApiResponse({ status: 201, description: 'Produit créé avec succès', type: ProductResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas créateur de communauté' })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async create(@Body() createProductDto: CreateProductDto, @Request() req): Promise<{ success: boolean; data: ProductResponseDto }> {
    const userId = this.getRequestUserId(req);
    const product = await this.productService.create(createProductDto, userId);
    return { success: true, data: product };
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer la liste des produits' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
  @ApiQuery({ name: 'communityId', required: false, type: String, description: 'ID de la communauté' })
  @ApiQuery({ name: 'creatorId', required: false, type: String, description: 'ID du créateur' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Catégorie du produit' })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Type de produit (digital/physical)' })
  @ApiQuery({ name: 'minPrice', required: false, type: Number, description: 'Prix minimum' })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number, description: 'Prix maximum' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Terme de recherche' })
  @ApiResponse({ status: 200, description: 'Liste des produits récupérée avec succès', type: ProductListResponseDto })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('communityId') communityId?: string,
    @Query('creatorId') creatorId?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('search') search?: string
  ): Promise<{ success: boolean; data: ProductListResponseDto }> {
    const products = await this.productService.findAll(
      page || 1,
      limit || 10,
      communityId,
      creatorId,
      category,
      type,
      minPrice,
      maxPrice,
      search
    );
    return { success: true, data: products };
  }

  @Get('creator/:creatorId')
  @ApiOperation({ summary: 'Récupérer les produits d\'un créateur' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Produits du créateur récupérés avec succès', type: ProductListResponseDto })
  async findByCreator(
    @Param('creatorId') creatorId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<{ success: boolean; data: ProductListResponseDto }> {
    const products = await this.productService.findByCreator(creatorId, page || 1, limit || 10);
    return { success: true, data: products };
  }

  @Get('by-user/:userId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer les produits d\'un utilisateur (alias pour creator)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Produits de l\'utilisateur récupérés avec succès', type: ProductListResponseDto })
  async findByUser(
    @Param('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean; data: ProductListResponseDto }> {
    const requesterId = this.getRequestUserId(req);
    const visibilityScope = requesterId && requesterId === userId ? 'owner' : 'public';
    const products = await this.productService.findByCreator(
      userId,
      page || 1,
      limit || 10,
      type,
      visibilityScope,
    );
    return { success: true, data: products };
  }

  @Get('community/:communityId')
  @ApiOperation({ summary: 'Récupérer les produits d\'une communauté' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Produits de la communauté récupérés avec succès', type: ProductListResponseDto })
  async findByCommunity(
    @Param('communityId') communityId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<{ success: boolean; data: ProductListResponseDto }> {
    const products = await this.productService.findByCommunity(communityId, page || 1, limit || 10);
    return { success: true, data: products };
  }

  @Get('my-purchases')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les produits achetés par l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Produits achetés récupérés avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async getMyPurchases(
    @Request() req
  ): Promise<{ success: boolean; products: any[] }> {
    const products = await this.productService.getMyPurchases(this.getRequestUserId(req));
    return { success: true, products };
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'Lister les avis d\'un produit (rating + message)' })
  async getReviews(
    @Param('id') id: string,
  ): Promise<{ success: boolean; reviews: any[]; averageRating: number; ratingCount: number }> {
    const result = await this.productService.getProductReviews(id);
    return { success: true, ...result } as any;
  }

  @Get(':id/reviews/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer mon avis sur un produit' })
  async getMyReview(
    @Param('id') id: string,
    @Request() req
  ): Promise<{ success: boolean; review: any | null }> {
    const userId = (req.user?._id || req.user?.sub || req.user?.userId || '').toString();
    const review = await this.productService.getMyProductReview(id, userId);
    return { success: true, review };
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer / Mettre à jour mon avis (1 seul avis par utilisateur)' })
  async upsertReview(
    @Param('id') id: string,
    @Body('rating') rating: number,
    @Body('message') message: string,
    @Request() req
  ): Promise<{ success: boolean; averageRating: number; ratingCount: number; myReview: any | null }> {
    const userId = (req.user?._id || req.user?.sub || req.user?.userId || '').toString();
    const result = await this.productService.upsertProductReview(id, userId, rating, message);
    return { success: true, ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un produit par son ID' })
  @ApiResponse({ status: 200, description: 'Produit récupéré avec succès', type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async findOne(@Param('id') id: string): Promise<{ success: boolean; data: ProductResponseDto }> {
    const product = await this.productService.findOne(id);
    return { success: true, data: product };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Product', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un produit' })
  @ApiResponse({ status: 200, description: 'Produit mis à jour avec succès', type: ProductResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req
  ): Promise<{ success: boolean; data: ProductResponseDto }> {
    const product = await this.productService.update(
      id,
      updateProductDto,
      this.getRequestUserId(req),
    );
    return { success: true, data: product };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Product', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un produit' })
  @ApiResponse({ status: 200, description: 'Produit supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async remove(@Param('id') id: string, @Request() req): Promise<{ success: boolean; message: string }> {
    const result = await this.productService.remove(id, this.getRequestUserId(req));
    return { success: true, message: result.message };
  }

  @Post(':id/variants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter une variante à un produit' })
  @ApiResponse({ status: 201, description: 'Variante ajoutée avec succès', type: ProductVariantResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async addVariant(
    @Param('id') productId: string,
    @Body() createVariantDto: CreateProductVariantDto,
    @Request() req
  ): Promise<{ success: boolean; data: ProductVariantResponseDto }> {
    const variant = await this.productService.addVariant(
      productId,
      createVariantDto,
      this.getRequestUserId(req),
    );
    return { success: true, data: variant };
  }

  @Delete(':id/variants/:variantId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer une variante d\'un produit' })
  @ApiResponse({ status: 200, description: 'Variante supprimée avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit ou variante non trouvé' })
  async removeVariant(
    @Param('id') productId: string,
    @Param('variantId') variantId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.productService.removeVariant(
      productId,
      variantId,
      this.getRequestUserId(req),
    );
    return { success: true, message: result.message };
  }

  @Post(':id/files')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter un fichier à un produit' })
  @ApiResponse({ status: 201, description: 'Fichier ajouté avec succès', type: ProductFileResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async addFile(
    @Param('id') productId: string,
    @Body() createFileDto: CreateProductFileDto,
    @Request() req
  ): Promise<{ success: boolean; data: ProductFileResponseDto }> {
    const file = await this.productService.addFile(
      productId,
      createFileDto,
      this.getRequestUserId(req),
    );
    return { success: true, data: file };
  }

  @Delete(':id/files/:fileId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un fichier d\'un produit' })
  @ApiResponse({ status: 200, description: 'Fichier supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit ou fichier non trouvé' })
  async removeFile(
    @Param('id') productId: string,
    @Param('fileId') fileId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.productService.removeFile(
      productId,
      fileId,
      this.getRequestUserId(req),
    );
    return { success: true, message: result.message };
  }

  @Patch(':id/inventory')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour l\'inventaire d\'un produit' })
  @ApiResponse({ status: 200, description: 'Inventaire mis à jour avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides ou produit non physique' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async updateInventory(
    @Param('id') productId: string,
    @Body('amount') amount: number,
    @Request() req
  ): Promise<{ success: boolean; message: string; newInventory: number }> {
    const result = await this.productService.updateInventory(
      productId,
      amount,
      this.getRequestUserId(req),
    );
    return { success: true, ...result };
  }

  @Patch(':id/toggle-published')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Basculer le statut de publication d\'un produit' })
  @ApiResponse({ status: 200, description: 'Statut de publication mis à jour avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async togglePublished(
    @Param('id') productId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string; isPublished: boolean }> {
    const result = await this.productService.togglePublished(
      productId,
      this.getRequestUserId(req),
    );
    return { success: true, ...result };
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Récupérer les statistiques d\'un produit' })
  @ApiResponse({ status: 200, description: 'Statistiques récupérées avec succès', type: ProductStatsResponseDto })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async getProductStats(@Param('id') productId: string): Promise<{ success: boolean; data: ProductStatsResponseDto }> {
    const stats = await this.productService.getProductStats(productId);
    return { success: true, data: stats };
  }

  @Post(':id/files/:fileId/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Télécharger un fichier de produit' })
  @ApiResponse({ status: 200, description: 'Fichier prêt pour téléchargement' })
  @ApiResponse({ status: 400, description: 'Fichier non disponible' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Produit ou fichier non trouvé' })
  @ApiQuery({ name: 'promoCode', required: false, type: String })
  async downloadFile(
    @Param('id') productId: string,
    @Param('fileId') fileId: string,
    @Query('promoCode') promoCode: string | undefined,
    @Request() req
  ): Promise<{ success: boolean; downloadUrl: string; message: string }> {
    const result = await this.productService.downloadFile(
      productId,
      fileId,
      this.getRequestUserId(req),
      promoCode,
    );
    return { success: true, ...result };
  }

  @Get(':id/check-purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier si l\'utilisateur a acheté un produit' })
  @ApiResponse({ status: 200, description: 'Statut d\'achat récupéré avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Produit non trouvé' })
  async checkPurchase(
    @Param('id') id: string,
    @Request() req
  ): Promise<{ success: boolean; purchased: boolean; purchase?: any }> {
    const userId = (req.user?._id || req.user?.sub || req.user?.userId || '').toString();
    const result = await this.productService.checkUserPurchase(id, userId);
    return { success: true, ...result };
  }

  @Patch(':id/files/:fileId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour le statut d\'un fichier' })
  @ApiResponse({ status: 200, description: 'Statut du fichier mis à jour avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur du produit' })
  @ApiResponse({ status: 404, description: 'Produit ou fichier non trouvé' })
  async updateFileStatus(
    @Param('id') productId: string,
    @Param('fileId') fileId: string,
    @Body('isActive') isActive: boolean,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.productService.updateFileStatus(
      productId,
      fileId,
      isActive,
      this.getRequestUserId(req),
    );
    return { success: true, ...result };
  }
}
