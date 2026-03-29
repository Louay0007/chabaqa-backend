import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Enumération des rôles utilisateur disponibles
 */
export enum UserRole {
  CREATOR = 'creator',
  USER = 'user'
}

/**
 * Enumération des fournisseurs d'authentification
 */
export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
}

/**
 * Interface pour les méthodes d'instance du document User
 */
export interface UserDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  username: string;
  email: string;
  password: string;
  authProvider: AuthProvider;
  hasLocalPassword: boolean;
  role: UserRole;
  createdAt: Date;
  createdCommunities: Types.ObjectId[];
  joinedCommunities: Types.ObjectId[];
  adminCommunities: Types.ObjectId[];
  moderatorCommunities: Types.ObjectId[];
  purchasedProducts: Types.ObjectId[];
  numtel: string;
  date_naissance: Date;
  sexe: string;
  pays: string;
  ville: string;
  code_postal: string;
  adresse: string;
  photo_profil: string;
  bio: string;
  lien_instagram: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
    tiktok?: string;
    github?: string;
    website?: string;
  };
  profile_picture: string;
  twoFactorEnabled: boolean;
  walletBalance: number;
  totalPointsEarned: number;
  googleTokens?: {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expiry_date: number;
  };
  // Admin-specific fields
  isSuspended: boolean;
  suspensionReason?: string;
  suspensionEndDate?: Date;
  suspendedBy?: Types.ObjectId;
  adminNotes?: string;
  accountStatus: string;
}

/**
 * Statut de l'utilisateur
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

/**
 * Schéma Mongoose pour l'entité User
 * 
 * Cette classe définit la structure d'un utilisateur avec les attributs essentiels.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false }
})
export class User {
  _id: Types.ObjectId;

  /**
   * Nom complet de l'utilisateur
   */
  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  })
  name: string;

  /**
   * Identifiant public du profil (handle)
   */
  @Prop({
    required: false,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  })
  username: string;

  /**
   * Adresse email unique
   */
  @Prop({
    required: true,
    trim: true,
    lowercase: true
  })
  email: string;

  /**
   * Mot de passe hashé
   */
  @Prop({
    required: true,
    minlength: 8
  })
  password: string;

  /**
   * Fournisseur d'authentification utilisé pour créer ce compte
   */
  @Prop({
    type: String,
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  authProvider: AuthProvider;

  /**
   * Indique si l'utilisateur a défini un mot de passe local qu'il connaît.
   * Les utilisateurs Google OAuth commencent avec hasLocalPassword=false (ils ont un hash aléatoire).
   * Une fois qu'ils définissent un mot de passe via change-password, cela passe à true.
   */
  @Prop({ default: true })
  hasLocalPassword: boolean;

  /**
   * Rôle de l'utilisateur dans le système
   */
  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER
  })
  role: UserRole;

  /**
   * Communautés créées par l'utilisateur
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Community' }],
    default: []
  })
  createdCommunities: Types.ObjectId[];

  /**
   * Communautés dont l'utilisateur est membre
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Community' }],
    default: []
  })
  joinedCommunities: Types.ObjectId[];

  /**
   * Communautés où l'utilisateur est administrateur
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Community' }],
    default: []
  })
  adminCommunities: Types.ObjectId[];

  /**
   * Communautés où l'utilisateur est modérateur
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Community' }],
    default: []
  })
  moderatorCommunities: Types.ObjectId[];

  /**
   * Products purchased by the user
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Product' }],
    default: []
  })
  purchasedProducts: Types.ObjectId[];

  /**
   * Google OAuth tokens for calendar integration
   */
  @Prop({
    type: Object,
    required: false
  })
  googleTokens?: {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expiry_date: number;
  };

  /**
   * Date de création de l'utilisateur
   */
  createdAt: Date;

  /**
   * Numéro de téléphone de l'utilisateur
   */
  @Prop({
    required: false,
  })
  numtel: string;

  /**
   * Date de naissance de l'utilisateur
   */
  @Prop({
    required: false,
  })
  date_naissance: Date;

  /**
   * Sexe de l'utilisateur
   */
  @Prop({
    required: false,
  })
  sexe: string;

  /**
   * Pays de l'utilisateur
   */
  @Prop({
    required: false,
  })
  pays: string;

  /**
   * Ville de l'utilisateur
   */
  @Prop({
    required: false,
  })
  ville: string;

  /**
   * Code postal de l'utilisateur
   */
  @Prop({
    required: false,
  })
  code_postal: string;

  /**
   * Adresse de l'utilisateur
   */
  @Prop({
    required: false,
  })
  adresse: string;

  /**
   * Photo de profil de l'utilisateur
   */
  @Prop({
    required: false,
  })
  photo_profil: string;

  /**
   * Bio de l'utilisateur
   */
  @Prop({
    required: false,
  })
  bio: string;

  /**
   * Lien Instagram de l'utilisateur
   */
  @Prop({
    required: false,
  })
  lien_instagram: string;

  /**
   * Liens sociaux de l'utilisateur
   */
  @Prop({
    type: Object,
    required: false,
    default: {},
  })
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
    tiktok?: string;
    github?: string;
    website?: string;
  };

  /**
   * Photo de profil de l'utilisateur
   */
  @Prop({
    required: false,
  })
  profile_picture: string;

  /**
   * Coordonnées bancaires pour les paiements manuels
   */
  @Prop({
    type: Object,
    required: false
  })
  bankDetails?: {
    rib: string;
    bankName?: string;
    ownerName?: string;
  };

  /**
   * Indique si l'authentification à deux facteurs est activée
   */
  @Prop({ default: false })
  twoFactorEnabled: boolean;

  /**
   * Timestamp de la dernière activité de l'utilisateur
   * Utilisé pour déterminer le statut en ligne/hors ligne
   */
  @Prop({
    type: Date,
    default: () => new Date()
  })
  lastActive: Date;

  /**
   * Wallet balance in points (1 DT = 1 point)
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  walletBalance: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  totalPointsEarned: number;

  // Admin-specific fields
  /**
   * Whether the user account is suspended
   */
  @Prop({ default: false })
  isSuspended: boolean;

  /**
   * Reason for account suspension
   */
  @Prop()
  suspensionReason?: string;

  /**
   * Date when suspension ends (if applicable)
   */
  @Prop()
  suspensionEndDate?: Date;

  /**
   * Admin user who suspended this account
   */
  @Prop({ type: Types.ObjectId, ref: 'AdminUser' })
  suspendedBy?: Types.ObjectId;

  /**
   * Admin notes about this user
   */
  @Prop()
  adminNotes?: string;

  /**
   * User account status for admin management
   */
  @Prop({ 
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'active'
  })
  accountStatus: string;
}

/**
 * Création du schéma Mongoose
 */
export const UserSchema = SchemaFactory.createForClass(User);

// Index pour optimiser les requêtes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ createdCommunities: 1 });
UserSchema.index({ joinedCommunities: 1 });

// Méthode toJSON personnalisée pour exclure le mot de passe
UserSchema.methods.toJSON = function (): any {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Méthode pour ajouter une communauté créée
UserSchema.methods.addCreatedCommunity = function (communityId: Types.ObjectId) {
  if (!this.createdCommunities.includes(communityId)) {
    this.createdCommunities.push(communityId);
  }
};

// Méthode pour ajouter une communauté rejointe
UserSchema.methods.addJoinedCommunity = function (communityId: Types.ObjectId) {
  if (!this.joinedCommunities.includes(communityId)) {
    this.joinedCommunities.push(communityId);
  }
};

// Méthode pour quitter une communauté
UserSchema.methods.leaveCommunity = function (communityId: Types.ObjectId) {
  this.joinedCommunities = this.joinedCommunities.filter(community => !community.equals(communityId));
  this.adminCommunities = this.adminCommunities.filter(community => !community.equals(communityId));
  this.moderatorCommunities = this.moderatorCommunities.filter(community => !community.equals(communityId));
};

// Méthode pour vérifier si l'utilisateur est créateur d'une communauté
UserSchema.methods.isCreatorOf = function (communityId: Types.ObjectId): boolean {
  return this.createdCommunities.some(community => community.equals(communityId));
};

// Méthode pour vérifier si l'utilisateur est membre d'une communauté
UserSchema.methods.isMemberOf = function (communityId: Types.ObjectId): boolean {
  return this.joinedCommunities.some(community => community.equals(communityId));
};
