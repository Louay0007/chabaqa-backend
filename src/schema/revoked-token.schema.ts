import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Interface pour les tokens révoqués
 */
export interface RevokedTokenDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenId: string;
  tokenType: 'access' | 'refresh';
  revokedAt: Date;
  expiresAt: Date;
}

/**
 * Schéma pour les tokens révoqués (blacklist)
 */
@Schema({
  timestamps: { createdAt: 'revokedAt', updatedAt: false }
})
export class RevokedToken {
  _id: Types.ObjectId;

  /**
   * ID de l'utilisateur propriétaire du token
   */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId: Types.ObjectId;

  /**
   * ID unique du token (jti - JWT ID)
   */
  @Prop({
    required: true
  })
  tokenId: string;

  /**
   * Type de token révoqué
   */
  @Prop({
    required: true,
    enum: ['access', 'refresh', 'all'],
    default: 'refresh'
  })
  tokenType: string;

  /**
   * Date de révocation
   */
  revokedAt: Date;

  /**
   * Date d'expiration originale du token
   */
  @Prop({
    required: true
  })
  expiresAt: Date;
}

/**
 * Création du schéma Mongoose
 */
export const RevokedTokenSchema = SchemaFactory.createForClass(RevokedToken);

// Index pour optimiser les requêtes
RevokedTokenSchema.index({ userId: 1 });
RevokedTokenSchema.index({ tokenId: 1 }, { unique: true });
RevokedTokenSchema.index({ tokenType: 1 });
RevokedTokenSchema.index({ revokedAt: 1 });

// Index composé pour les requêtes fréquentes
RevokedTokenSchema.index({ userId: 1, tokenType: 1 });
RevokedTokenSchema.index({ tokenId: 1, tokenType: 1 });

// Index TTL pour supprimer automatiquement les tokens expirés
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); 