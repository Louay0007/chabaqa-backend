import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Le rang représente la position de la communauté dans le classement
 * basé sur le nombre de membres (1 = communauté avec le plus de membres)
 */

/**
 * Sous-schéma pour les éléments de description longue
 */
@Schema({ _id: false })
export class LongDescriptionElement {
  @Prop({
    required: true,
    enum: ['text', 'video', 'image', 'link'],
    type: String
  })
  type: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export const LongDescriptionElementSchema = SchemaFactory.createForClass(LongDescriptionElement);

/**
 * Sous-schéma pour les liens sociaux - 100% compatible avec frontend
 */
@Schema({ _id: false })
export class SocialLinks {
  @Prop()
  twitter?: string;

  @Prop()
  instagram?: string;

  @Prop()
  linkedin?: string;

  @Prop()
  discord?: string;

  @Prop()
  behance?: string;

  @Prop()
  github?: string;

  @Prop()
  facebook?: string;

  @Prop()
  youtube?: string;

  @Prop()
  tiktok?: string;

  @Prop()
  website?: string;
}

export const SocialLinksSchema = SchemaFactory.createForClass(SocialLinks);

/**
 * Sous-schéma pour les sections personnalisées
 */
@Schema({ _id: false })
export class CustomSection {
  @Prop({ required: true, type: Number })
  id: number;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Boolean, default: true })
  visible: boolean;
}

export const CustomSectionSchema = SchemaFactory.createForClass(CustomSection);

/**
 * Sous-schéma pour les paramètres de la communauté
 */
@Schema({ _id: false })
export class CommunitySettings {
  @Prop({ default: '#0066cc' })
  primaryColor: string;

  @Prop({ default: '#f5f5f5' })
  secondaryColor: string;

  @Prop({ default: 'Bienvenue dans notre communauté !' })
  welcomeMessage: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ type: [String], default: [] })
  benefits: string[];

  @Prop({ default: 'default' })
  template: string;

  @Prop({ default: 'Inter' })
  fontFamily: string;

  @Prop({ type: Number, default: 8 })
  borderRadius: number;

  @Prop({ default: 'solid' })
  backgroundStyle: string;

  @Prop({ default: 'centered' })
  heroLayout: string;

  @Prop({ type: Boolean, default: true })
  showStats: boolean;

  @Prop({ type: Boolean, default: true })
  showFeatures: boolean;

  @Prop({ type: Boolean, default: true })
  showTestimonials: boolean;

  @Prop({ type: Boolean, default: true })
  showPosts: boolean;

  @Prop({ type: Boolean, default: true })
  showFAQ: boolean;

  @Prop({ type: Boolean, default: true })
  enableAnimations: boolean;

  @Prop({ type: Boolean, default: false })
  enableParallax: boolean;

  @Prop()
  logo: string;

  @Prop()
  heroBackground: string;

  @Prop({ type: [String], default: [] })
  gallery: string[];

  @Prop()
  videoUrl?: string;

  @Prop({ type: SocialLinksSchema, default: {} })
  socialLinks: SocialLinks;

  @Prop({ type: [CustomSectionSchema], default: [] })
  customSections: CustomSection[];

  @Prop()
  metaTitle: string;

  @Prop()
  metaDescription: string;
}

export const CommunitySettingsSchema = SchemaFactory.createForClass(CommunitySettings);

/**
 * Sous-schéma pour les statistiques de la communauté
 */
@Schema({ _id: false })
export class CommunityStats {
  @Prop({ type: Number, default: 0 })
  totalRevenue: number;

  @Prop({ type: Number, default: 0 })
  monthlyGrowth: number;

  @Prop({ type: Number, default: 0 })
  engagementRate: number;

  @Prop({ type: Number, default: 0 })
  retentionRate: number;
}

export const CommunityStatsSchema = SchemaFactory.createForClass(CommunityStats);

/**
 * Interface pour le document Community
 */
export interface CommunityDocument extends Document {
  _id: Types.ObjectId;
  slug: string;
  logo: string;
  photo_de_couverture: string;
  short_description: string;
  country: string;
  currency: string;
  members: Types.ObjectId[];
  admins: Types.ObjectId[];
  createur: Types.ObjectId;
  moderateurs: Types.ObjectId[];
  rank: number;
  fees_of_join: number;
  pricing?: {
    price: number;
    currency: string;
    priceType: 'free' | 'one-time' | 'monthly' | 'yearly';
    isRecurring: boolean;
    recurringInterval?: 'month' | 'year' | 'week';
    features: string[];
    limits: {
      maxMembers: number;
      maxCourses: number;
      maxPosts: number;
      storageLimit: string;
    };
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
  long_description: LongDescriptionElement[];
  name: string;
  creatorBanner?: string;
  creatorAvatar: string;
  category: string;
  priceType: string;
  image: string;
  tags: string[];
  featured: boolean;
  settings: CommunitySettings;
  stats: CommunityStats;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isPrivate: boolean;
  isVerified: boolean;
  membersCount: number;
  inviteCode: string;
  inviteLink: string;
  cours: Types.ObjectId[];

  // ============ Champs supplémentaires pour compatibilité frontend ============
  longDescription?: string;
  coverImage?: string;
  rating: number;
  price: number;
  createdDate?: string;
  updatedDate?: string;

  // Méthodes du schéma
  addMember(userId: Types.ObjectId): void;
  removeMember(userId: Types.ObjectId): void;
  isMember(userId: Types.ObjectId): boolean;
  isAdmin(userId: Types.ObjectId): boolean;
  isModerator(userId: Types.ObjectId): boolean;
  generateInviteCode(): string;
  generateInviteLink(baseUrl: string): string;
  updateRating(newRating: number): void;
  updateStats(stats: Partial<CommunityStats>): void;
  addTag(tag: string): void;
  removeTag(tag: string): void;
  generateSlug(baseName: string): string;
  ajouterCours(coursId: Types.ObjectId): void;
  supprimerCours(coursId: Types.ObjectId): void;
  possedeCours(coursId: Types.ObjectId): boolean;
  obtenirNombreCours(): number;
}

/**
 * Schéma Mongoose pour l'entité Community
 * 
 * Cette classe définit la structure d'une communauté avec toutes les relations avec les utilisateurs.
 */
@Schema({
  timestamps: true
})
export class Community {
  _id: Types.ObjectId;

  /**
   * Nom de la communauté
   */
  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  })
  name: string;

  /**
   * Slug unique pour l'URL de la communauté
   */
  @Prop({
    required: true,
    trim: true,
    lowercase: true
  })
  slug: string;

  /**
   * URL du logo de la communauté
   */
  @Prop({
    required: true,
    trim: true
  })
  logo: string;

  /**
   * URL de la photo de couverture
   */
  @Prop({
    required: true,
    trim: true
  })
  photo_de_couverture: string;

  /**
   * Description courte de la communauté
   */
  @Prop({
    required: true,
    trim: true,
    maxlength: 500
  })
  short_description: string;

  /**
   * Pays/localisation de la communauté
   */
  @Prop({
    required: true,
    trim: true
  })
  country: string;

  /**
   * Devise utilisée pour les frais d'adhésion
   */
  @Prop({
    enum: ['USD', 'TND', 'EUR'],
    default: 'TND'
  })
  currency: string;

  /**
   * Description longue avec éléments multimédias
   */
  @Prop({
    type: [LongDescriptionElementSchema],
    default: []
  })
  long_description: LongDescriptionElement[];

  /**
   * Référence vers l'utilisateur créateur de la communauté
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  createur: Types.ObjectId;

  /**
   * Bannière du créateur
   */
  @Prop({
    trim: true
  })
  creatorBanner?: string;

  /**
   * Avatar du créateur
   */
  @Prop({
    required: true,
    trim: true
  })
  creatorAvatar: string;

  /**
   * Catégorie de la communauté
   */
  @Prop({
    required: true,
    trim: true
  })
  category: string;



  /**
   * Type de prix (free, one-time, monthly, yearly)
   */
  @Prop({
    required: true,
    enum: ['free', 'one-time', 'monthly', 'yearly'],
    default: 'free'
  })
  priceType: string;

  /**
   * Image principale de la communauté
   */
  @Prop({
    required: true,
    trim: true
  })
  image: string;

  /**
   * Tags associés à la communauté
   */
  @Prop({
    type: [String],
    default: []
  })
  tags: string[];

  /**
   * Communauté mise en avant
   */
  @Prop({
    type: Boolean,
    default: false
  })
  featured: boolean;

  /**
   * Type de contenu (pour compatibilité UI)
   */
  @Prop({
    enum: ['community', 'course', 'challenge', 'product', 'oneToOne', 'event'],
    default: 'community'
  })
  type: string;

  /**
   * Paramètres de personnalisation de la communauté
   */
  @Prop({
    type: CommunitySettingsSchema,
    default: () => ({})
  })
  settings: CommunitySettings;

  /**
   * Statistiques de la communauté
   */
  @Prop({
    type: CommunityStatsSchema,
    default: () => ({})
  })
  stats: CommunityStats;

  /**
   * Liste des membres de la communauté
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: []
  })
  members: Types.ObjectId[];

  /**
   * Liste des administrateurs de la communauté
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: []
  })
  admins: Types.ObjectId[];

  /**
   * Liste des modérateurs de la communauté
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: []
  })
  moderateurs: Types.ObjectId[];

  /**
   * Rang de la communauté basé sur le nombre de membres
   * (1 = communauté avec le plus de membres)
   */
  @Prop({
    type: Number,
    default: 0
  })
  rank: number;

  /**
   * Frais d'adhésion à la communauté
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  fees_of_join: number;

  /**
   * Configuration de prix de la communauté
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

      // Fonctionnalités incluses
      features: [{ type: String }],

      // Limites
      limits: {
        maxMembers: { type: Number, default: 1000 },
        maxCourses: { type: Number, default: 50 },
        maxPosts: { type: Number, default: 1000 },
        storageLimit: { type: String, default: '10GB' }
      },

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
    features: string[];
    limits: {
      maxMembers: number;
      maxCourses: number;
      maxPosts: number;
      storageLimit: string;
    };
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
   * Statut actif de la communauté
   */
  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  /**
   * Communauté privée ou publique
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isPrivate: boolean;

  /**
   * Statut de vérification de la communauté
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isVerified: boolean;

  /**
   * Nombre de membres (calculé automatiquement)
   */
  @Prop({
    type: Number,
    default: 0
  })
  membersCount: number;

  /**
   * Code d'invitation unique pour rejoindre la communauté
   */
  @Prop({
    type: String,
    unique: true,
    sparse: true,
    default: null
  })
  inviteCode: string;

  /**
   * Lien d'invitation complet pour rejoindre la communauté
   */
  @Prop({
    type: String,
    default: null
  })
  inviteLink: string;

  /**
   * Note moyenne de la communauté
   */
  @Prop({ type: Number, default: 0 })
  averageRating: number;

  /**
   * Nombre de notes
   */
  @Prop({ type: Number, default: 0 })
  ratingCount: number;

  /**
   * Liste des cours de la communauté
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Cours' }],
    default: []
  })
  cours: Types.ObjectId[];

  // ============ Champs supplémentaires pour compatibilité frontend ============

  /**
   * Description longue de la communauté (pour compatibilité frontend)
   */
  @Prop({
    trim: true
  })
  longDescription?: string;

  /**
   * Description courte (alias pour UI compatibility)
   */
  @Prop({
    trim: true
  })
  description?: string;

  /**
   * Image de couverture (pour compatibilité frontend)
   */
  @Prop({
    trim: true
  })
  coverImage?: string;

  /**
   * Note moyenne de la communauté (pour compatibilité frontend)
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0,
    max: 5
  })
  rating: number;

  /**
   * Prix de la communauté (pour compatibilité frontend)
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  price: number;

  /**
   * Statut vérifié (alias pour UI compatibility)
   */
  @Prop({
    type: Boolean,
    default: false
  })
  verified?: boolean;

  /**
   * Nom du créateur (pour compatibilité UI)
   */
  @Prop({
    trim: true
  })
  creator?: string;

  /**
   * Date de création (format string pour compatibilité frontend)
   */
  @Prop()
  createdDate?: string;

  /**
   * Date de mise à jour (format string pour compatibilité frontend)
   */
  @Prop()
  updatedDate?: string;

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
export const CommunitySchema = SchemaFactory.createForClass(Community);

// Index pour optimiser les requêtes
CommunitySchema.index({ name: 1 }, { unique: true });
CommunitySchema.index({ slug: 1 }, { unique: true });
CommunitySchema.index({ createur: 1 });
CommunitySchema.index({ members: 1 });
CommunitySchema.index({ rank: 1 });
CommunitySchema.index({ isActive: 1 });
CommunitySchema.index({ isPrivate: 1 });
CommunitySchema.index({ createdAt: -1 });
CommunitySchema.index({ category: 1 });

CommunitySchema.index({ featured: 1 });
CommunitySchema.index({ tags: 1 });
CommunitySchema.index({ priceType: 1 });
CommunitySchema.index({ cours: 1 });

// Index composé pour les requêtes complexes
CommunitySchema.index({ category: 1, featured: 1 });
CommunitySchema.index({ rating: -1, membersCount: -1 });
CommunitySchema.index({ isActive: 1, isPrivate: 1 });

// Middleware pour mettre à jour le nombre de membres
CommunitySchema.pre('save', function (next) {
  if (this.isModified('members')) {
    this.membersCount = this.members.length;
  }

  // Génération automatique du slug à partir du nom si pas défini
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  next();
});

// Méthode pour ajouter un membre
CommunitySchema.methods.addMember = function (userId: Types.ObjectId) {
  if (!this.members.includes(userId)) {
    this.members.push(userId);
    this.membersCount = this.members.length;
  }
};

// Méthode pour supprimer un membre
CommunitySchema.methods.removeMember = function (userId: Types.ObjectId) {
  this.members = this.members.filter(member => !member.equals(userId));
  this.membersCount = this.members.length;
};

// Méthode pour vérifier si un utilisateur est membre
CommunitySchema.methods.isMember = function (userId: Types.ObjectId): boolean {
  return this.members.some(member => member.equals(userId));
};

// Méthode pour vérifier si un utilisateur est administrateur
CommunitySchema.methods.isAdmin = function (userId: Types.ObjectId): boolean {
  return this.admins.some(admin => admin.equals(userId)) || this.createur.equals(userId);
};

// Méthode pour vérifier si un utilisateur est modérateur
CommunitySchema.methods.isModerator = function (userId: Types.ObjectId): boolean {
  return this.moderateurs.some(moderator => moderator.equals(userId)) || this.isAdmin(userId);
};

// Méthode pour générer un code d'invitation unique
CommunitySchema.methods.generateInviteCode = function (): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Méthode pour générer le lien d'invitation
CommunitySchema.methods.generateInviteLink = function (baseUrl: string): string {
  if (!this.inviteCode) {
    this.inviteCode = this.generateInviteCode();
  }
  this.inviteLink = `${baseUrl}/join/${this.inviteCode}`;
  return this.inviteLink;
};


// Méthode pour mettre à jour les statistiques
CommunitySchema.methods.updateStats = function (stats: Partial<CommunityStats>): void {
  this.stats = { ...this.stats, ...stats };
};

// Méthode pour ajouter un tag
CommunitySchema.methods.addTag = function (tag: string): void {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
  }
};

// Méthode pour supprimer un tag
CommunitySchema.methods.removeTag = function (tag: string): void {
  this.tags = this.tags.filter(t => t !== tag);
};

// Méthode pour générer un slug unique
CommunitySchema.methods.generateSlug = function (baseName: string): string {
  let slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Vous pouvez ajouter une logique pour vérifier l'unicité du slug
  // et ajouter un suffixe numérique si nécessaire

  return slug;
};

// Méthode pour ajouter un cours à la communauté
CommunitySchema.methods.ajouterCours = function (coursId: Types.ObjectId): void {
  if (!this.cours.includes(coursId)) {
    this.cours.push(coursId);
  }
};

// Méthode pour supprimer un cours de la communauté
CommunitySchema.methods.supprimerCours = function (coursId: Types.ObjectId): void {
  this.cours = this.cours.filter(cours => !cours.equals(coursId));
};

// Méthode pour vérifier si un cours appartient à la communauté
CommunitySchema.methods.possedeCours = function (coursId: Types.ObjectId): boolean {
  return this.cours.some(cours => cours.equals(coursId));
};

// Méthode pour obtenir le nombre de cours
CommunitySchema.methods.obtenirNombreCours = function (): number {
  return this.cours.length;
};
