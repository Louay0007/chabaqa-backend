import { Types } from 'mongoose';
import { UserRole } from '../schema/user.schema';

/**
 * Interface de base pour un utilisateur avec propriétés readonly
 * Assure l'immutabilité des données utilisateur
 */
export interface IUser {
  readonly _id: Types.ObjectId;
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly password: string;
  readonly role: UserRole;
  readonly createdAt: Date;
  photo_profil?: string;
  profile_picture?: string;
  readonly ville?: string;
  readonly pays?: string;
  readonly bio?: string;
}


