import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Énumération des types de ressources supportés
 */
export enum ResourceType {
  ARTICLE = 'Article',
  VIDEO = 'Video',
  GUIDE = 'Guide',
  PODCAST = 'Podcast',
  EBOOK = 'Ebook'
}

/**
 * Énumération des types de contenu pour les éléments
 */
export enum ContentElementType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  LINK = 'link',
  CODE = 'code',
  QUOTE = 'quote'
}

/**
 * Énumération des catégories de ressources
 */
export enum ResourceCategory {
  COMMUNITY_DEVELOPMENT = 'Développement communautaire',
  MONETIZATION = 'Monétisation',
  MARKETING = 'Marketing',
  CONTENT_CREATION = 'Création de contenu',
  ANALYTICS = 'Analytiques',
  ENGAGEMENT = 'Engagement',
  MANAGEMENT = 'Gestion',
  TECHNICAL = 'Technique',
  BUSINESS = 'Business',
  DESIGN = 'Design'
}

/**
 * Sous-schéma pour les éléments de contenu
 */
@Schema({ _id: false })
export class ContentElement {
  @Prop({
    required: true,
    enum: Object.values(ContentElementType),
    type: String
  })
  type: ContentElementType;

  @Prop({ required: true })
  content: string;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop()
  alt?: string; // Pour les images

  @Prop()
  caption?: string;

  @Prop({ type: Number, default: 0 })
  order: number;

  @Prop({ type: Object, default: {} })
  metadata?: {
    duration?: number; // Pour les vidéos/audio en secondes
    size?: number; // Taille du fichier en bytes
    format?: string; // Format du fichier
    thumbnail?: string; // URL du thumbnail pour les vidéos
    width?: number; // Largeur pour les images
    height?: number; // Hauteur pour les images
    language?: string; // Langue du contenu
    [key: string]: any;
  };

  @Prop({ type: Boolean, default: true })
  isVisible: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}


export const ContentElementSchema = SchemaFactory.createForClass(ContentElement);

/**
 * Sous-schéma pour les sections d'un guide
 */
@Schema({ _id: false })
export class GuideSection {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: [ContentElementSchema], default: [] })
  elements: ContentElement[];

  @Prop({ type: Number, required: true })
  order: number;

  @Prop({ type: Boolean, default: true })
  isVisible: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const GuideSectionSchema = SchemaFactory.createForClass(GuideSection);

/**
 * Sous-schéma pour le contenu d'un article
 */
@Schema({ _id: false })
export class ArticleContent {
  @Prop({ type: [ContentElementSchema], default: [] })
  elements: ContentElement[];

  @Prop()
  excerpt?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Object, default: {} })
  seoMetadata?: {
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string;
    ogImage?: string;
    keywords?: string[];
  };
}

export const ArticleContentSchema = SchemaFactory.createForClass(ArticleContent);

/**
 * Sous-schéma pour le contenu d'une vidéo
 */
@Schema({ _id: false })
export class VideoContent {
  @Prop({ required: true })
  videoUrl: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({ type: Number })
  duration?: number; // en secondes

  @Prop({ type: String })
  quality?: string; // HD, 4K, etc.

  @Prop({ type: [String], default: [] })
  subtitles?: string[]; // URLs des fichiers de sous-titres

  @Prop({ type: Object, default: {} })
  videoMetadata?: {
    resolution?: string;
    bitrate?: number;
    codec?: string;
    frameRate?: number;
    size?: number;
  };

  @Prop({ type: [ContentElementSchema], default: [] })
  description?: ContentElement[]; // Description avec éléments riches

  @Prop({ type: [String], default: [] })
  chapters?: string[]; // Chapitres avec timestamps
}

export const VideoContentSchema = SchemaFactory.createForClass(VideoContent);

/**
 * Sous-schéma pour le contenu d'un guide
 */
@Schema({ _id: false })
export class GuideContent {
  @Prop({ type: [GuideSectionSchema], default: [] })
  sections: GuideSection[];

  @Prop({ type: [ContentElementSchema], default: [] })
  introduction?: ContentElement[];

  @Prop({ type: [ContentElementSchema], default: [] })
  conclusion?: ContentElement[];

  @Prop({ type: Object, default: {} })
  guideMetadata?: {
    difficulty?: 'Débutant' | 'Intermédiaire' | 'Avancé';
    prerequisites?: string[];
    learningOutcomes?: string[];
    tools?: string[];
    resources?: string[];
  };
}

export const GuideContentSchema = SchemaFactory.createForClass(GuideContent);

/**
 * Interface pour le document Resource
 */
export interface ResourceDocument extends Document {
  _id: Types.ObjectId;
  titre: string;
  slug: string;
  description: string;
  type: ResourceType;
  readTime: string;
  category: ResourceCategory;
  author: Types.ObjectId;
  authorName: string;
  communityId?: Types.ObjectId;
  thumbnailUrl?: string;
  coverImageUrl?: string;
  content: ArticleContent | VideoContent | GuideContent;
  isPublished: boolean;
  isFeature: boolean;
  isPremium: boolean;
  pricing?: {
    price: number;
    currency: string;
    priceType: 'free' | 'one-time' | 'monthly' | 'yearly';
    isRecurring: boolean;
    recurringInterval?: 'month' | 'year' | 'week';
    previewContent?: string;
    features: string[];
    paymentOptions: {
      allowInstallments: boolean;
      installmentCount?: number;
      earlyBirdDiscount?: number;
      groupDiscount?: number;
      memberDiscount?: number;
    };
    freeTrialDays?: number;
    trialFeatures?: string[];
  };
  viewsCount: number;
  likesCount: number;
  sharesCount: number;
  commentsCount: number;
  rating: number;
  tags: string[];
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schéma Mongoose pour l'entité Resource
 * 
 * Cette classe définit la structure d'une ressource avec un contenu flexible
 * selon le type de ressource (Article, Video, Guide, etc.)
 */
@Schema({
  timestamps: true,
  discriminatorKey: 'type'
})
export class Resource {
  _id: Types.ObjectId;

  /**
   * Titre de la ressource
   */
  @Prop({
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 200
  })
  titre: string;

  /**
   * Slug unique pour l'URL de la ressource
   */
  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9-]+$/
  })
  slug: string;

  /**
   * Description de la ressource
   */
  @Prop({
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  })
  description: string;

  /**
   * Type de ressource
   */
  @Prop({
    required: true,
    enum: Object.values(ResourceType),
    type: String
  })
  type: ResourceType;

  /**
   * Temps de lecture estimé
   */
  @Prop({
    required: true,
    trim: true
  })
  readTime: string;

  /**
   * Catégorie de la ressource
   */
  @Prop({
    required: true,
    enum: Object.values(ResourceCategory),
    type: String
  })
  category: ResourceCategory;

  /**
   * Référence vers l'auteur de la ressource
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  author: Types.ObjectId;

  /**
   * Nom de l'auteur (dénormalisé pour les performances)
   */
  @Prop({
    required: true,
    trim: true
  })
  authorName: string;

  /**
   * Référence vers la communauté (optionnel)
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'Community'
  })
  communityId?: Types.ObjectId;

  /**
   * URL de l'image miniature
   */
  @Prop({
    trim: true
  })
  thumbnailUrl?: string;

  /**
   * URL de l'image de couverture
   */
  @Prop({
    trim: true
  })
  coverImageUrl?: string;

  /**
   * Contenu de la ressource (varie selon le type)
   */
  @Prop({
    type: Object,
    required: true
  })
  content: ArticleContent | VideoContent | GuideContent;

  /**
   * Statut de publication
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isPublished: boolean;

  /**
   * Ressource mise en avant
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isFeature: boolean;

  /**
   * Ressource premium
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isPremium: boolean;

  /**
   * Configuration de prix de la ressource
   */
  @Prop({
    type: {
      // Prix de base
      price: { type: Number, default: 0, min: 0 },
      currency: { type: String, enum: ['USD', 'EUR', 'TND'], default: 'TND' },
      
      // Type de prix
      priceType: { type: String, enum: ['free', 'one-time', 'monthly', 'yearly'], default: 'free' },
      
      // Produit récurrent
      isRecurring: { type: Boolean, default: false },
      recurringInterval: { type: String, enum: ['month', 'year', 'week'] },
      
      // Contenu de prévisualisation (gratuit)
      previewContent: { type: String, maxlength: 1000 },
      
      // Fonctionnalités incluses
      features: [{ type: String }],
      
      // Options de paiement
      paymentOptions: {
        allowInstallments: { type: Boolean, default: false },
        installmentCount: { type: Number, min: 2, max: 12 },
        earlyBirdDiscount: { type: Number, min: 0, max: 100 },
        groupDiscount: { type: Number, min: 0, max: 100 },
        memberDiscount: { type: Number, min: 0, max: 100 }
      },
      
      // Période d'essai
      freeTrialDays: { type: Number, min: 0, max: 30 },
      trialFeatures: [{ type: String }]
    },
    default: {}
  })
  pricing?: {
    price: number;
    currency: string;
    priceType: 'free' | 'one-time' | 'monthly' | 'yearly';
    isRecurring: boolean;
    recurringInterval?: 'month' | 'year' | 'week';
    previewContent?: string;
    features: string[];
    paymentOptions: {
      allowInstallments: boolean;
      installmentCount?: number;
      earlyBirdDiscount?: number;
      groupDiscount?: number;
      memberDiscount?: number;
    };
    freeTrialDays?: number;
    trialFeatures?: string[];
  };

  /**
   * Nombre de vues
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  viewsCount: number;

  /**
   * Nombre de likes
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  likesCount: number;

  /**
   * Nombre de partages
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  sharesCount: number;

  /**
   * Nombre de commentaires
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  commentsCount: number;

  /**
   * Note moyenne de la ressource
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0,
    max: 5
  })
  rating: number;

  /**
   * Tags associés à la ressource
   */
  @Prop({
    type: [String],
    default: []
  })
  tags: string[];

  /**
   * Date de publication
   */
  @Prop({
    type: Date
  })
  publishedAt?: Date;

  /**
   * Date de création
   */
  createdAt: Date;

  /**
   * Date de mise à jour
   */
  updatedAt: Date;
}

/**
 * Création du schéma Mongoose
 */
export const ResourceSchema = SchemaFactory.createForClass(Resource);

// Index pour optimiser les requêtes
ResourceSchema.index({ slug: 1 }, { unique: true });
ResourceSchema.index({ type: 1 });
ResourceSchema.index({ category: 1 });
ResourceSchema.index({ author: 1 });
ResourceSchema.index({ communityId: 1 });
ResourceSchema.index({ isPublished: 1 });
ResourceSchema.index({ isFeature: 1 });
ResourceSchema.index({ isPremium: 1 });
ResourceSchema.index({ publishedAt: -1 });
ResourceSchema.index({ createdAt: -1 });
ResourceSchema.index({ viewsCount: -1 });
ResourceSchema.index({ rating: -1 });
ResourceSchema.index({ tags: 1 });

// Index composés pour les requêtes complexes
ResourceSchema.index({ type: 1, category: 1 });
ResourceSchema.index({ isPublished: 1, isFeature: 1 });
ResourceSchema.index({ author: 1, type: 1 });
ResourceSchema.index({ communityId: 1, isPublished: 1 });
ResourceSchema.index({ category: 1, rating: -1 });

// Index de recherche textuelle
ResourceSchema.index({
  titre: 'text',
  description: 'text',
  tags: 'text',
  authorName: 'text'
});

// Middleware pour générer automatiquement le slug
ResourceSchema.pre('save', function(next) {
  if (this.isModified('titre') && !this.slug) {
    this.slug = this.titre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-z0-9\s-]/g, '') // Supprime les caractères spéciaux
      .replace(/\s+/g, '-') // Remplace les espaces par des tirets
      .replace(/-+/g, '-') // Supprime les tirets multiples
      .replace(/^-|-$/g, ''); // Supprime les tirets en début/fin
  }

  // Met à jour la date de publication si la ressource est publiée pour la première fois
  if (this.isModified('isPublished') && this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  next();
});

// Validation conditionnelle du contenu selon le type
ResourceSchema.pre('validate', function(next) {
  const resource = this as ResourceDocument;

  // Validation du contenu selon le type
  if (resource.type === ResourceType.ARTICLE) {
    const content = resource.content as ArticleContent;
    if (!content.elements || content.elements.length === 0) {
      return next(new Error('Le contenu d\'un article doit contenir au moins un élément'));
    }
  }

  if (resource.type === ResourceType.VIDEO) {
    const content = resource.content as VideoContent;
    if (!content.videoUrl) {
      return next(new Error('Le contenu d\'une vidéo doit contenir une URL de vidéo'));
    }
  }

  if (resource.type === ResourceType.GUIDE) {
    const content = resource.content as GuideContent;
    if (!content.sections || content.sections.length === 0) {
      return next(new Error('Le contenu d\'un guide doit contenir au moins une section'));
    }
  }

  next();
});

// Méthodes utilitaires
ResourceSchema.methods.incrementViews = function() {
  this.viewsCount += 1;
  return this.save();
};

ResourceSchema.methods.incrementLikes = function() {
  this.likesCount += 1;
  return this.save();
};

ResourceSchema.methods.decrementLikes = function() {
  if (this.likesCount > 0) {
    this.likesCount -= 1;
  }
  return this.save();
};

ResourceSchema.methods.incrementShares = function() {
  this.sharesCount += 1;
  return this.save();
};

ResourceSchema.methods.updateRating = function(newRating: number) {
  this.rating = newRating;
  return this.save();
};

ResourceSchema.methods.addTag = function(tag: string) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
  }
  return this.save();
};

ResourceSchema.methods.removeTag = function(tag: string) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

ResourceSchema.methods.publish = function() {
  this.isPublished = true;
  this.publishedAt = new Date();
  return this.save();
};

ResourceSchema.methods.unpublish = function() {
  this.isPublished = false;
  return this.save();
};

ResourceSchema.methods.generateSlug = function(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// Méthodes statiques
ResourceSchema.statics.findByType = function(type: ResourceType) {
  return this.find({ type, isPublished: true });
};

ResourceSchema.statics.findByCategory = function(category: ResourceCategory) {
  return this.find({ category, isPublished: true });
};

ResourceSchema.statics.findByAuthor = function(authorId: Types.ObjectId) {
  return this.find({ author: authorId, isPublished: true });
};

ResourceSchema.statics.findByCommunity = function(communityId: Types.ObjectId) {
  return this.find({ communityId, isPublished: true });
};

ResourceSchema.statics.findFeatured = function() {
  return this.find({ isFeature: true, isPublished: true });
};

ResourceSchema.statics.findPremium = function() {
  return this.find({ isPremium: true, isPublished: true });
};

ResourceSchema.statics.searchByText = function(searchText: string) {
  return this.find({
    $text: { $search: searchText },
    isPublished: true
  }).sort({ score: { $meta: 'textScore' } });
}; 