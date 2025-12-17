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
 * Interface pour les méthodes d'instance du document User
 */
export interface UserDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  createdCommunities: Types.ObjectId[];
  joinedCommunities: Types.ObjectId[];
  adminCommunities: Types.ObjectId[];
  moderatorCommunities: Types.ObjectId[];
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
  profile_picture: string;
  twoFactorEnabled: boolean;
  googleTokens?: {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expiry_date: number;
  };
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
   * Photo de profil de l'utilisateur
   */
  @Prop({
    required: false,
  })
  profile_picture: string;

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
}

/**
 * Création du schéma Mongoose
 */
export const UserSchema = SchemaFactory.createForClass(User);

// Index pour optimiser les requêtes
UserSchema.index({ email: 1 }, { unique: true });
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