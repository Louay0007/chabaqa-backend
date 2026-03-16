import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Sous-schéma pour les commentaires d'un post
 */
@Schema({ _id: false })
export class PostComment {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 2000
  })
  content: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  userId: Types.ObjectId;

  @Prop({
    required: false,
    type: String
  })
  parentId?: string;

  @Prop({
    required: true,
    type: Date,
    default: Date.now
  })
  createdAt: Date;

  @Prop({
    required: true,
    type: Date,
    default: Date.now
  })
  updatedAt: Date;
}

export const PostCommentSchema = SchemaFactory.createForClass(PostComment);

/**
 * Interface pour le document PostComment
 */
export interface PostCommentDocument extends Document {
  id: string;
  content: string;
  userId: Types.ObjectId;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Schema({ _id: false })
export class PostReaction {
  @Prop({
    required: true,
    type: String,
    trim: true,
  })
  emoji: string;

  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: []
  })
  userIds: Types.ObjectId[];
}

export const PostReactionSchema = SchemaFactory.createForClass(PostReaction);

/**
 * Schéma principal pour l'entité Post
 */
@Schema({
  timestamps: true,
  collection: 'posts'
})
export class Post {
  _id: Types.ObjectId;

  /**
   * ID unique du post (différent de l'_id MongoDB)
   */
  @Prop({
    required: true,
    type: String,
    unique: true
  })
  id: string;

  /**
   * Titre du post (optionnel)
   */
  @Prop({
    required: false,
    trim: true,
    minlength: 2,
    maxlength: 200
  })
  title?: string;

  /**
   * Contenu principal du post
   */
  @Prop({
    required: true,
    trim: true,
    maxlength: 10000
  })
  content: string;

  /**
   * Extrait du post (optionnel)
   */
  @Prop({
    trim: true,
    maxlength: 500
  })
  excerpt?: string;

  /**
   * Image miniature du post
   */
  @Prop({
    trim: true
  })
  thumbnail?: string;

  /**
   * ID de la communauté à laquelle appartient le post
   */
  @Prop({
    required: true,
    trim: true,
    type: String,
    ref: 'Community'
  })
  communityId: string;

  /**
   * Référence vers l'utilisateur auteur du post
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  authorId: Types.ObjectId;

  /**
   * Indique si le post est publié (toujours true - pas de brouillon)
   */
  @Prop({
    type: Boolean,
    default: true
  })
  isPublished: boolean;

  /**
   * Nombre de likes du post
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  likes: number;

  /**
   * Nombre de partages du post
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  shareCount: number;

  /**
   * Commentaires du post
   */
  @Prop({
    type: [PostCommentSchema],
    default: []
  })
  comments: PostComment[];

  /**
   * Tags du post
   */
  @Prop({
    type: [String],
    default: []
  })
  tags: string[];

  /**
   * Utilisateurs qui ont liké le post
   */
  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: []
  })
  likedBy: Types.ObjectId[];

  /**
   * Utilisateurs qui ont partagé le post
   */
  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: []
  })
  sharedBy: Types.ObjectId[];

  /**
   * Utilisateurs qui ont mis le post en favoris
   */
  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: []
  })
  bookmarks: Types.ObjectId[];

  @Prop({
    type: [PostReactionSchema],
    default: []
  })
  reactions: PostReaction[];

  @Prop({
    type: Boolean,
    default: false,
  })
  isPinned: boolean;

  @Prop({
    type: Date,
    required: false,
  })
  pinnedAt?: Date;

  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: []
  })
  mentionedUserIds: Types.ObjectId[];

  /**
   * Images attachées au post
   */
  @Prop({
    type: [String],
    default: []
  })
  images: string[];

  /**
   * Vidéos attachées au post
   */
  @Prop({
    type: [String],
    default: []
  })
  videos: string[];

  /**
   * Liens attachés au post
   */
  @Prop({
    type: [{
      url: { type: String, required: true },
      title: { type: String },
      description: { type: String },
      thumbnail: { type: String }
    }],
    default: []
  })
  links: { url: string; title?: string; description?: string; thumbnail?: string }[];

  /**
   * Configuration de prix du post
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

      // Post premium
      isPremium: { type: Boolean, default: false },

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
    isPremium: boolean;
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
   * Date de création
   */
  @Prop({
    type: Date,
    default: Date.now
  })
  createdAt: Date;

  /**
   * Date de dernière modification
   */
  @Prop({
    type: Date,
    default: Date.now
  })
  updatedAt: Date;
}

/**
 * Interface pour le document Post
 */
export interface PostDocument extends Document {
  _id: Types.ObjectId;
  id: string;
  title?: string;
  content: string;
  excerpt?: string;
  thumbnail?: string;
  communityId: string;
  authorId: Types.ObjectId;
  isPublished: boolean;
  likes: number;
  shareCount: number;
  comments: PostComment[];
  tags: string[];
  likedBy: Types.ObjectId[];
  sharedBy: Types.ObjectId[];
  bookmarks: Types.ObjectId[];
  reactions: PostReaction[];
  isPinned: boolean;
  pinnedAt?: Date;
  mentionedUserIds: Types.ObjectId[];
  images: string[];
  videos: string[];
  links: { url: string; title?: string; description?: string; thumbnail?: string }[];
  pricing?: {
    price: number;
    currency: string;
    priceType: 'free' | 'one-time' | 'monthly' | 'yearly';
    isRecurring: boolean;
    recurringInterval?: 'month' | 'year' | 'week';
    isPremium: boolean;
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
  createdAt: Date;
  updatedAt: Date;

  // Methods
  addComment(comment: PostComment): void;
  removeComment(commentId: string): void;
  updateComment(commentId: string, content: string): void;
  likePost(userId: Types.ObjectId): boolean;
  unlikePost(userId: Types.ObjectId): boolean;
  isLikedBy(userId: Types.ObjectId): boolean;
  sharePost(userId: Types.ObjectId): boolean;
  isSharedBy(userId: Types.ObjectId): boolean;
  getCommentsCount(): number;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Index pour optimiser les requêtes
PostSchema.index({ communityId: 1, isPublished: 1, createdAt: -1 });
PostSchema.index({ communityId: 1, isPinned: -1, createdAt: -1 });
PostSchema.index({ authorId: 1, isPublished: 1 });
PostSchema.index({ tags: 1 });
PostSchema.index({ likes: -1 });
PostSchema.index({ 'comments.userId': 1 });

// Middleware pour générer l'ID unique avant sauvegarde
PostSchema.pre('save', function (next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }

  // Mettre à jour updatedAt
  this.updatedAt = new Date();

  next();
});

// ============= MÉTHODES POUR LES COMMENTAIRES =============

// Méthode pour ajouter un commentaire
PostSchema.methods.addComment = function (comment: PostComment): void {
  if (!comment.id) {
    comment.id = new Types.ObjectId().toString();
  }

  comment.createdAt = new Date();
  comment.updatedAt = new Date();

  this.comments.push(comment);
  this.comments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};

// Méthode pour supprimer un commentaire
PostSchema.methods.removeComment = function (commentId: string): void {
  const target = this.comments.find((comment) => comment.id === commentId);
  if (!target) return;

  const idsToRemove = new Set<string>([commentId]);
  if (!target.parentId) {
    this.comments.forEach((comment) => {
      if (comment.parentId === commentId) {
        idsToRemove.add(comment.id);
      }
    });
  }

  this.comments = this.comments.filter((comment) => !idsToRemove.has(comment.id));
};

// Méthode pour mettre à jour un commentaire
PostSchema.methods.updateComment = function (commentId: string, content: string): void {
  const comment = this.comments.find(c => c.id === commentId);
  if (comment) {
    comment.content = content;
    comment.updatedAt = new Date();
  }
};

// Méthode pour obtenir le nombre de commentaires
PostSchema.methods.getCommentsCount = function (): number {
  return this.comments.length;
};

// ============= MÉTHODES POUR LES LIKES =============

// Méthode pour liker un post
PostSchema.methods.likePost = function (userId: Types.ObjectId): boolean {
  // Use .some() with .equals() for proper ObjectId comparison
  if (this.likedBy.some((id: Types.ObjectId) => id.equals(userId))) {
    return false; // Déjà liké
  }

  this.likedBy.push(userId);
  this.likes = this.likedBy.length;
  return true;
};

// Méthode pour partager un post (compte unique par utilisateur)
PostSchema.methods.sharePost = function (userId: Types.ObjectId): boolean {
  if (this.sharedBy.some((id: Types.ObjectId) => id.equals(userId))) {
    return false; // déjà partagé par cet utilisateur
  }

  this.sharedBy.push(userId);
  this.shareCount = this.sharedBy.length;
  return true;
};

// Méthode pour vérifier si un utilisateur a partagé le post
PostSchema.methods.isSharedBy = function (userId: Types.ObjectId): boolean {
  return this.sharedBy.some((id: Types.ObjectId) => id.equals(userId));
};

// Méthode pour unliker un post
PostSchema.methods.unlikePost = function (userId: Types.ObjectId): boolean {
  // Use findIndex with .equals() for proper ObjectId comparison
  const index = this.likedBy.findIndex((id: Types.ObjectId) => id.equals(userId));
  if (index === -1) {
    return false; // Pas liké
  }

  this.likedBy.splice(index, 1);
  this.likes = this.likedBy.length;
  return true;
};

// Méthode pour vérifier si un utilisateur a liké le post
PostSchema.methods.isLikedBy = function (userId: Types.ObjectId): boolean {
  // Use .some() with .equals() for proper ObjectId comparison
  return this.likedBy.some((id: Types.ObjectId) => id.equals(userId));
};
