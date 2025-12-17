import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RevokedToken, RevokedTokenDocument } from '../../schema/revoked-token.schema';
import { Types as MongooseTypes } from 'mongoose';

@Injectable()
export class TokenBlacklistService {
  constructor(
    @InjectModel(RevokedToken.name) private revokedTokenModel: Model<RevokedTokenDocument>,
  ) {}

  /**
   * Ajouter un token à la blacklist
   */
  async revokeToken(
    userId: Types.ObjectId,
    tokenId: string,
    tokenType: 'access' | 'refresh',
    expiresAt: Date
  ): Promise<void> {
    try {
      await this.revokedTokenModel.create({
        userId,
        tokenId,
        tokenType,
        expiresAt,
      });
    } catch (error) {
      // Ignorer si le token est déjà révoqué (duplicate key error)
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  /**
    * Vérifier si un token est révoqué
    */
   async isTokenRevoked(tokenId: string, userId?: string): Promise<boolean> {
     // First check if the specific token is revoked
     const revokedToken = await this.revokedTokenModel.findOne({
       tokenId,
       expiresAt: { $gt: new Date() }, // Seulement si pas encore expiré
     });

     if (revokedToken) {
       return true;
     }

     // Then check if all tokens for the user are revoked
     if (userId) {
       const allRevoked = await this.revokedTokenModel.findOne({
         userId,
         tokenType: 'all',
         expiresAt: { $gt: new Date() },
       });
       if (allRevoked) {
         return true;
       }
     }

     return false;
   }

  /**
    * Révoquer tous les tokens d'un utilisateur
    */
   async revokeAllUserTokens(userId: Types.ObjectId): Promise<void> {
     const currentTime = new Date();
     const futureTime = new Date(currentTime.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 jours

     // Create a special entry to mark all tokens revoked for this user
     await this.revokedTokenModel.create({
       userId,
       tokenId: `all-tokens-revoked-${Date.now()}`,
       tokenType: 'all',
       expiresAt: futureTime,
     });
   }

  /**
   * Révoquer un token spécifique avec ses informations JWT
   */
  async revokeTokenFromJWT(
    userId: Types.ObjectId,
    jwtPayload: any,
    tokenType: 'access' | 'refresh'
  ): Promise<void> {
    const tokenId = jwtPayload.jti || `${jwtPayload.sub}-${jwtPayload.iat}`;
    const expiresAt = new Date(jwtPayload.exp * 1000);

    await this.revokeToken(userId, tokenId, tokenType, expiresAt);
  }

  /**
   * Nettoyer les tokens expirés (maintenance)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.revokedTokenModel.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    
    return result.deletedCount || 0;
  }

  /**
   * Obtenir les statistiques de la blacklist
   */
  async getBlacklistStats(): Promise<{
    totalRevoked: number;
    revokedByType: { access: number; refresh: number };
    expiredCount: number;
  }> {
    const currentTime = new Date();
    
    const [
      totalRevoked,
      accessCount,
      refreshCount,
      expiredCount
    ] = await Promise.all([
      this.revokedTokenModel.countDocuments(),
      this.revokedTokenModel.countDocuments({ tokenType: 'access' }),
      this.revokedTokenModel.countDocuments({ tokenType: 'refresh' }),
      this.revokedTokenModel.countDocuments({ expiresAt: { $lt: currentTime } })
    ]);

    return {
      totalRevoked,
      revokedByType: {
        access: accessCount,
        refresh: refreshCount
      },
      expiredCount
    };
  }
} 