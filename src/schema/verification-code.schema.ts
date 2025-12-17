import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Interface pour les méthodes d'instance du document VerificationCode
 */
export interface VerificationCodeDocument extends Document {
  _id: Types.ObjectId;
  email?: string;
  userId?: Types.ObjectId;
  adminId?: Types.ObjectId;
  code: string;
  type: string;
  expiresAt: Date;
  isUsed: boolean;
  rememberMe: boolean;
  createdAt: Date;
}

/**
 * Schéma Mongoose pour l'entité VerificationCode
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false }
})
export class VerificationCode {
  _id: Types.ObjectId;

  /**
   * Email de l'utilisateur (pour mot de passe oublié)
   */
  @Prop({
    required: false,
    trim: true,
    lowercase: true
  })
  email?: string;

  /**
   * ID de l'utilisateur (pour 2FA)
   */
  @Prop({
    required: false,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId?: Types.ObjectId;

  /**
   * ID de l'administrateur (pour 2FA admin)
   */
  @Prop({
    required: false,
    type: Types.ObjectId,
    ref: 'Admin'
  })
  adminId?: Types.ObjectId;

  /**
   * Code de vérification à 6 chiffres
   */
  @Prop({
    required: true,
    length: 6
  })
  code: string;

  /**
   * Type de vérification ('password_reset', '2fa', ou '2fa_login')
   */
  @Prop({
    required: true,
    enum: ['password_reset', '2fa', '2fa_login'],
    default: 'password_reset'
  })
  type: string;

  /**
   * Date d'expiration du code (10 minutes après création)
   */
  @Prop({
    required: true
  })
  expiresAt: Date;

  /**
   * Indique si le code a déjà été utilisé
   */
  @Prop({
    default: false
  })
  isUsed: boolean;

  /**
   * Option "Remember Me" pour cette session
   */
  @Prop({
    default: false
  })
  rememberMe: boolean;

  /**
   * Date de création du code
   */
  createdAt: Date;
}

/**
 * Création du schéma Mongoose
 */
export const VerificationCodeSchema = SchemaFactory.createForClass(VerificationCode);

// Index pour optimiser les requêtes
VerificationCodeSchema.index({ email: 1 });
VerificationCodeSchema.index({ userId: 1 });
VerificationCodeSchema.index({ type: 1 });
VerificationCodeSchema.index({ isUsed: 1 });

// Index composé pour les requêtes fréquentes
VerificationCodeSchema.index({ email: 1, type: 1 });
VerificationCodeSchema.index({ userId: 1, type: 1 });

// Index TTL pour supprimer automatiquement les codes expirés après 1 heure
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 }); 