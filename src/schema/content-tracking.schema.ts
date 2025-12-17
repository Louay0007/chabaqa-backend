import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Enum pour les types de contenu trackable
 */
export enum TrackableContentType {
  COURSE = 'course',
  CHALLENGE = 'challenge',
  SESSION = 'session',
  POST = 'post',
  EVENT = 'event',
  PRODUCT = 'product',
  RESOURCE = 'resource',
  COMMUNITY = 'community'
  , SUBSCRIPTION = 'subscription'
}

/**
 * Enum pour les types d'actions de tracking
 */
export enum TrackingActionType {
  VIEW = 'view',
  START = 'start',
  COMPLETE = 'complete',
  LIKE = 'like',
  SHARE = 'share',
  DOWNLOAD = 'download',
  BOOKMARK = 'bookmark',
  COMMENT = 'comment',
  RATE = 'rate'
}

/**
 * Sous-schéma pour le tracking d'un élément de contenu
 */
@Schema({ timestamps: true })
export class ContentProgress {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    type: String
  })
  contentId: string;

  @Prop({
    required: true,
    enum: Object.values(TrackableContentType),
    type: String
  })
  contentType: TrackableContentType;

  @Prop({
    type: Boolean,
    default: false
  })
  isCompleted: boolean;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  watchTime: number; // en secondes

  @Prop({
    type: Number,
    default: 0,
    min: 0,
    max: 5
  })
  rating?: number;

  @Prop({
    type: String,
    trim: true,
    maxlength: 1000
  })
  review?: string;

  @Prop({
    type: Date
  })
  completedAt?: Date;

  @Prop({
    type: Date,
    default: Date.now
  })
  lastAccessedAt: Date;

  @Prop({
    type: [String],
    default: []
  })
  bookmarks: string[];

  @Prop({
    type: Number,
    default: 0
  })
  viewCount: number;

  @Prop({
    type: Number,
    default: 0
  })
  likeCount: number;

  @Prop({
    type: Number,
    default: 0
  })
  shareCount: number;

  @Prop({
    type: Number,
    default: 0
  })
  downloadCount: number;

  @Prop({
    type: Object,
    default: {}
  })
  metadata: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

export const ContentProgressSchema = SchemaFactory.createForClass(ContentProgress);

/**
 * Sous-schéma pour les actions de tracking
 */
@Schema({ timestamps: true })
export class TrackingAction {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    type: String
  })
  contentId: string;

  @Prop({
    required: true,
    enum: Object.values(TrackableContentType),
    type: String
  })
  contentType: TrackableContentType;

  @Prop({
    required: true,
    enum: Object.values(TrackingActionType),
    type: String
  })
  actionType: TrackingActionType;

  @Prop({
    type: Object,
    default: {}
  })
  metadata: Record<string, any>;

  @Prop({
    type: Date,
    default: Date.now
  })
  timestamp: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const TrackingActionSchema = SchemaFactory.createForClass(TrackingAction);

/**
 * Interface pour le document ContentProgress
 */
export interface ContentProgressDocument extends Document {
  _id: Types.ObjectId;
  id: string;
  userId: Types.ObjectId;
  contentId: string;
  contentType: TrackableContentType;
  isCompleted: boolean;
  watchTime: number;
  rating?: number;
  review?: string;
  completedAt?: Date;
  lastAccessedAt: Date;
  bookmarks: string[];
  viewCount: number;
  likeCount: number;
  shareCount: number;
  downloadCount: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  // Méthodes du schéma
  marquerComplete(): void;
  ajouterTempsVisionne(temps: number): void;
  mettreAJourDernierAcces(): void;
  ajouterBookmark(bookmarkId: string): void;
  retirerBookmark(bookmarkId: string): void;
  incrementerView(): void;
  incrementerLike(): void;
  incrementerShare(): void;
  incrementerDownload(): void;
  calculerProgression(): number;
}

/**
 * Interface pour le document TrackingAction
 */
export interface TrackingActionDocument extends Document {
  _id: Types.ObjectId;
  id: string;
  userId: Types.ObjectId;
  contentId: string;
  contentType: TrackableContentType;
  actionType: TrackingActionType;
  metadata: Record<string, any>;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============= MÉTHODES POUR CONTENTPROGRESS =============

// Pre-save hook pour générer l'ID
ContentProgressSchema.pre('save', function(next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }
  next();
});

// Méthodes pour ContentProgress
ContentProgressSchema.methods.marquerComplete = function() {
  this.isCompleted = true;
  this.completedAt = new Date();
  this.mettreAJourDernierAcces();
};

ContentProgressSchema.methods.ajouterTempsVisionne = function(temps: number) {
  this.watchTime += temps;
  this.mettreAJourDernierAcces();
};

ContentProgressSchema.methods.mettreAJourDernierAcces = function() {
  this.lastAccessedAt = new Date();
};

ContentProgressSchema.methods.ajouterBookmark = function(bookmarkId: string) {
  if (!this.bookmarks.includes(bookmarkId)) {
    this.bookmarks.push(bookmarkId);
  }
};

ContentProgressSchema.methods.retirerBookmark = function(bookmarkId: string) {
  this.bookmarks = this.bookmarks.filter(id => id !== bookmarkId);
};

ContentProgressSchema.methods.incrementerView = function() {
  this.viewCount += 1;
  this.mettreAJourDernierAcces();
};

ContentProgressSchema.methods.incrementerLike = function() {
  this.likeCount += 1;
};

ContentProgressSchema.methods.incrementerShare = function() {
  this.shareCount += 1;
};

ContentProgressSchema.methods.incrementerDownload = function() {
  this.downloadCount += 1;
};

ContentProgressSchema.methods.calculerProgression = function(): number {
  // Logique de calcul de progression basée sur le type de contenu
  if (this.isCompleted) return 100;
  
  // Pour les contenus avec temps de visionnage
  if (this.watchTime > 0) {
    // Cette logique peut être adaptée selon le type de contenu
    return Math.min((this.watchTime / 3600) * 10, 100); // Exemple: 1h = 10% de progression
  }
  
  return 0;
};

// ============= MÉTHODES POUR TRACKINGACTION =============

// Pre-save hook pour générer l'ID
TrackingActionSchema.pre('save', function(next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }
  next();
});
