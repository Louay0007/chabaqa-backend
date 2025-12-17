import { Injectable, BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Resource, ResourceDocument, ResourceType, ArticleContent, VideoContent, GuideContent } from '../schema/resource.schema';
import { CreateResourceDto, CreateArticleContentDto, CreateVideoContentDto, CreateGuideContentDto } from './dto/create-resource.dto';

/**
 * Service pour la gestion des ressources
 */
@Injectable()
export class ResourceService {
  private readonly logger = new Logger(ResourceService.name);

  constructor(
    @InjectModel(Resource.name) private resourceModel: Model<ResourceDocument>,
  ) {}

  /**
   * Créer une nouvelle ressource
   */
  async createResource(
    createResourceDto: CreateResourceDto,
    authorId: string,
    authorName: string
  ): Promise<ResourceDocument> {
    try {
      // Validation conditionnelle du contenu selon le type
      this.validateContentByType(createResourceDto.type, createResourceDto.content);

      // Génération du slug
      const slug = createResourceDto.slug || this.generateSlug(createResourceDto.titre);
      
      // Vérifier l'unicité du slug
      await this.ensureUniqueSlug(slug);

      // Création de la ressource
      const resourceData = {
        ...createResourceDto,
        slug,
        author: new Types.ObjectId(authorId),
        authorName,
        communityId: createResourceDto.communityId 
          ? new Types.ObjectId(createResourceDto.communityId) 
          : undefined,
        content: this.processContent(createResourceDto.type, createResourceDto.content),
        // Dates de création et mise à jour seront gérées par timestamps
      };

      const resource = new this.resourceModel(resourceData);
      
      // Sauvegarde avec validation automatique
      const savedResource = await resource.save();
      
      this.logger.log(`Ressource créée avec succès: ${savedResource.titre} (ID: ${savedResource._id})`);
      
      return savedResource;
      
    } catch (error) {
      this.logger.error(`Erreur lors de la création de la ressource: ${error.message}`, error.stack);
      
      if (error.code === 11000) {
        // Erreur de duplication (slug ou autre champ unique)
        throw new ConflictException('Une ressource avec ce slug existe déjà');
      }
      
      if (error.name === 'ValidationError') {
        throw new BadRequestException(`Données invalides: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Validation conditionnelle du contenu selon le type de ressource
   */
  private validateContentByType(type: ResourceType, content: any): void {
    switch (type) {
      case ResourceType.ARTICLE:
        this.validateArticleContent(content as CreateArticleContentDto);
        break;
      case ResourceType.VIDEO:
        this.validateVideoContent(content as CreateVideoContentDto);
        break;
      case ResourceType.GUIDE:
        this.validateGuideContent(content as CreateGuideContentDto);
        break;
      default:
        throw new BadRequestException(`Type de ressource non supporté: ${type}`);
    }
  }

  /**
   * Valider le contenu d'un article
   */
  private validateArticleContent(content: CreateArticleContentDto): void {
    if (!content.elements || content.elements.length === 0) {
      throw new BadRequestException('Un article doit contenir au moins un élément de contenu');
    }

    // Vérifier qu'il y a au moins un élément de type texte
    const hasTextElement = content.elements.some(element => element.type === 'text');
    if (!hasTextElement) {
      throw new BadRequestException('Un article doit contenir au moins un élément de type texte');
    }

    // Validation des éléments
    content.elements.forEach((element, index) => {
      if (!element.content || element.content.trim() === '') {
        throw new BadRequestException(`L'élément ${index + 1} ne peut pas être vide`);
      }
    });
  }

  /**
   * Valider le contenu d'une vidéo
   */
  private validateVideoContent(content: CreateVideoContentDto): void {
    if (!content.videoUrl || !this.isValidUrl(content.videoUrl)) {
      throw new BadRequestException('URL de vidéo invalide ou manquante');
    }

    if (content.thumbnailUrl && !this.isValidUrl(content.thumbnailUrl)) {
      throw new BadRequestException('URL de miniature invalide');
    }

    if (content.duration && content.duration < 0) {
      throw new BadRequestException('La durée ne peut pas être négative');
    }

    if (content.subtitles) {
      content.subtitles.forEach((subtitle, index) => {
        if (!this.isValidUrl(subtitle)) {
          throw new BadRequestException(`URL de sous-titre ${index + 1} invalide`);
        }
      });
    }
  }

  /**
   * Valider le contenu d'un guide
   */
  private validateGuideContent(content: CreateGuideContentDto): void {
    if (!content.sections || content.sections.length === 0) {
      throw new BadRequestException('Un guide doit contenir au moins une section');
    }

    // Vérifier l'unicité des ordres de sections
    const orders = content.sections.map(s => s.order);
    const uniqueOrders = [...new Set(orders)];
    if (orders.length !== uniqueOrders.length) {
      throw new BadRequestException('Les ordres des sections doivent être uniques');
    }

    // Validation de chaque section
    content.sections.forEach((section, sectionIndex) => {
      if (!section.title || section.title.trim() === '') {
        throw new BadRequestException(`La section ${sectionIndex + 1} doit avoir un titre`);
      }

      if (!section.elements || section.elements.length === 0) {
        throw new BadRequestException(`La section "${section.title}" doit contenir au moins un élément`);
      }

      // Vérifier l'unicité des ordres d'éléments dans chaque section
      const elementOrders = section.elements.map(e => e.order);
      const uniqueElementOrders = [...new Set(elementOrders)];
      if (elementOrders.length !== uniqueElementOrders.length) {
        throw new BadRequestException(`Les ordres des éléments dans la section "${section.title}" doivent être uniques`);
      }

      // Validation des éléments de la section
      section.elements.forEach((element, elementIndex) => {
        if (!element.content || element.content.trim() === '') {
          throw new BadRequestException(`L'élément ${elementIndex + 1} de la section "${section.title}" ne peut pas être vide`);
        }
      });
    });
  }

  /**
   * Traiter le contenu selon le type de ressource
   */
  private processContent(type: ResourceType, content: any): ArticleContent | VideoContent | GuideContent {
    switch (type) {
      case ResourceType.ARTICLE:
        return this.processArticleContent(content as CreateArticleContentDto);
      case ResourceType.VIDEO:
        return this.processVideoContent(content as CreateVideoContentDto);
      case ResourceType.GUIDE:
        return this.processGuideContent(content as CreateGuideContentDto);
      default:
        throw new BadRequestException(`Type de ressource non supporté: ${type}`);
    }
  }

  /**
   * Traiter le contenu d'un article
   */
  private processArticleContent(content: CreateArticleContentDto): ArticleContent {
    // Trier les éléments par ordre et ajouter les propriétés manquantes
    const sortedElements = content.elements
      .sort((a, b) => a.order - b.order)
      .map(element => ({
        ...element,
        isVisible: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }));
    
    // Générer l'extrait automatiquement si non fourni
    const excerpt = content.excerpt || this.generateExcerpt(sortedElements);

    return {
      elements: sortedElements,
      excerpt,
      tags: content.tags || [],
      seoMetadata: content.seoMetadata || {}
    };
  }

  /**
   * Traiter le contenu d'une vidéo
   */
  private processVideoContent(content: CreateVideoContentDto): VideoContent {
    const processedDescription = content.description?.map(element => ({
      ...element,
      isVisible: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })) || [];

    return {
      videoUrl: content.videoUrl,
      thumbnailUrl: content.thumbnailUrl,
      duration: content.duration,
      quality: content.quality,
      subtitles: content.subtitles || [],
      videoMetadata: content.videoMetadata || {},
      description: processedDescription,
      chapters: content.chapters || []
    };
  }

  /**
   * Traiter le contenu d'un guide
   */
  private processGuideContent(content: CreateGuideContentDto): GuideContent {
    // Trier les sections par ordre et ajouter les propriétés manquantes
    const sortedSections = content.sections
      .sort((a, b) => a.order - b.order)
      .map(section => ({
        ...section,
        isVisible: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        elements: section.elements
          .sort((a, b) => a.order - b.order)
          .map(element => ({
            ...element,
            isVisible: true,
            createdAt: new Date(),
            updatedAt: new Date()
          }))
      }));

    const processedIntroduction = content.introduction?.map(element => ({
      ...element,
      isVisible: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })) || [];

    const processedConclusion = content.conclusion?.map(element => ({
      ...element,
      isVisible: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })) || [];

    return {
      sections: sortedSections,
      introduction: processedIntroduction,
      conclusion: processedConclusion,
      guideMetadata: content.guideMetadata || {}
    };
  }

  /**
   * Générer un slug à partir du titre
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-z0-9\s-]/g, '') // Supprime les caractères spéciaux
      .replace(/\s+/g, '-') // Remplace les espaces par des tirets
      .replace(/-+/g, '-') // Supprime les tirets multiples
      .replace(/^-|-$/g, ''); // Supprime les tirets en début/fin
  }

  /**
   * Vérifier l'unicité du slug
   */
  private async ensureUniqueSlug(slug: string): Promise<void> {
    const existingResource = await this.resourceModel.findOne({ slug });
    if (existingResource) {
      throw new ConflictException(`Une ressource avec le slug "${slug}" existe déjà`);
    }
  }

  /**
   * Générer un extrait automatique à partir des éléments
   */
  private generateExcerpt(elements: any[]): string {
    const textElements = elements.filter(el => el.type === 'text');
    if (textElements.length === 0) return '';

    const firstTextContent = textElements[0].content;
    return firstTextContent.length > 200 
      ? firstTextContent.substring(0, 200) + '...' 
      : firstTextContent;
  }

  /**
   * Valider une URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtenir une ressource par son ID
   */
  async findById(id: string): Promise<ResourceDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de ressource invalide');
    }

    const resource = await this.resourceModel.findById(id);
    if (!resource) {
      throw new NotFoundException('Ressource non trouvée');
    }

    return resource;
  }

  /**
   * Obtenir toutes les ressources publiées
   */
  async findAllPublished(): Promise<ResourceDocument[]> {
    return this.resourceModel.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .populate('author', 'name email')
      .populate('communityId', 'name slug');
  }

  /**
   * Obtenir un résumé de toutes les ressources publiées (champs limités)
   */
  async findAllPublishedSummary(): Promise<any[]> {
    const resources = await this.resourceModel.find({ isPublished: true })
      .select('titre description type readTime category _id slug createdAt')
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance since we don't need full documents
      
    // Transform _id to string for consistency
    return resources.map(resource => ({
      ...resource,
      _id: resource._id.toString()
    }));
  }

  /**
   * Obtenir les ressources par type
   */
  async findByType(type: ResourceType): Promise<ResourceDocument[]> {
    return this.resourceModel.find({ type, isPublished: true })
      .sort({ createdAt: -1 })
      .populate('author', 'name email')
      .populate('communityId', 'name slug');
  }

  /**
   * Publier une ressource
   */
  async publishResource(id: string): Promise<ResourceDocument> {
    const resource = await this.findById(id);
    resource.isPublished = true;
    resource.publishedAt = new Date();
    return resource.save();
  }

  /**
   * Dépublier une ressource
   */
  async unpublishResource(id: string): Promise<ResourceDocument> {
    const resource = await this.findById(id);
    resource.isPublished = false;
    return resource.save();
  }
}
