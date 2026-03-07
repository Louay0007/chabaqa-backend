import { Injectable, NotFoundException, ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { IUser } from '../interface/user.interface';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from '../dto-user/create-user.dto';
import { UpdateUserDto } from '../dto-user/update-user.dto';
import { ForgotPasswordDto } from '../dto-user/forgot-password.dto';
import { ResetPasswordDto } from '../dto-user/reset-password.dto';
import { ChangePasswordDto } from '../dto-user/change-password.dto';
import { DeleteAccountDto } from '../dto-user/delete-account.dto';
import { EmailService } from '../common/services/email.service';
import { VerificationCode, VerificationCodeDocument } from '../schema/verification-code.schema';
import { UploadService, FileType } from '../upload/upload.service';
import { CommunityAffCreaJoinService } from '../community-aff-crea-join/community-aff-crea-join.service';
import { generateUniqueUsername, slugifyFullNameToUsername } from '../common/utils/username.util';
import { CacheService } from '../common/services/cache.service';

@Injectable()
export class UserService {
  constructor(
    @InjectModel('User') private userModel: Model<IUser>,
    @InjectModel('VerificationCode') private verificationCodeModel: Model<VerificationCodeDocument>,
    private emailService: EmailService,
    private uploadService: UploadService,
    private communityAffCreaJoinService: CommunityAffCreaJoinService,
    private cacheService: CacheService,
  ) { }

  /**
   * Hash un mot de passe
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Vérifie un mot de passe
   */
  private async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    if (!password || !hashedPassword) return false;
    return bcrypt.compare(password, hashedPassword);
  }

  private getModelIfRegistered<T = any>(connection: Connection, modelName: string): Model<T> | null {
    return connection.modelNames().includes(modelName) ? (connection.model(modelName) as Model<T>) : null;
  }

  private getAffectedCount(result: any): number {
    if (!result) return 0;
    if (typeof result.deletedCount === 'number') return result.deletedCount;
    if (typeof result.modifiedCount === 'number') return result.modifiedCount;
    if (typeof result.matchedCount === 'number') return result.matchedCount;
    return 0;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async cleanupLocalAvatarFile(user: IUser): Promise<void> {
    const avatarUrl = ((user as any).photo_profil || (user as any).profile_picture || '').trim();
    if (!avatarUrl || avatarUrl.startsWith('http')) return;

    try {
      const marker = '/uploads/image/';
      const markerIndex = avatarUrl.indexOf(marker);
      if (markerIndex === -1) return;

      const filename = avatarUrl.slice(markerIndex + marker.length);
      if (!filename) return;

      await this.uploadService.deleteFile(filename, FileType.IMAGE);
      console.log('✅ [DELETE ACCOUNT] Local avatar file deleted');
    } catch (error: any) {
      console.warn(`⚠️ [DELETE ACCOUNT] Could not delete avatar file: ${error?.message || 'unknown error'}`);
    }
  }

  private async invalidateUserProfileCaches(user?: Partial<IUser> & { username?: string; _id?: any }): Promise<void> {
    const patterns = ['http:/user/by-username*'];

    const username = String((user as any)?.username || '').trim();
    if (username) {
      patterns.push(`http:/user/by-username/${username}*`);
    }

    const id = String((user as any)?._id || '').trim();
    if (id) {
      patterns.push(`http:/user/user/${id}*`);
    }

    await Promise.allSettled(patterns.map((pattern) => this.cacheService.deletePattern(pattern)));
  }

  /**
   * Vérifie si un email existe déjà
   */
  async checkUserExists(email: string): Promise<{ emailExists: boolean }> {
    const emailExists = await this.userModel.findOne({ email: email.toLowerCase() });

    return {
      emailExists: !!emailExists,
    };
  }

  // create user
  async createUser(createUserDto: CreateUserDto): Promise<IUser> {
    console.log('UserService: Creating user with data:', { ...createUserDto, password: '[REDACTED]' });

    // Vérifier si l'email existe déjà
    const { emailExists } = await this.checkUserExists(createUserDto.email);

    if (emailExists) {
      console.log('UserService: Email already exists:', createUserDto.email);
      throw new ConflictException(`L'email '${createUserDto.email}' est déjà utilisé par un autre compte`);
    }

    // Hash le mot de passe avant de sauvegarder
    const hashedPassword = await this.hashPassword(createUserDto.password);
    const normalizedName = String(createUserDto.name || '').trim() || 'User';
    const username = await generateUniqueUsername(this.userModel as any, normalizedName);
    console.log('UserService: Password hashed successfully');

    const newUser = await new this.userModel({
      ...createUserDto,
      name: normalizedName,
      username,
      password: hashedPassword,
    });

    console.log('UserService: Saving user to database...');
    const savedUser = await newUser.save();
    console.log('UserService: User saved successfully with ID:', savedUser._id);

    return savedUser;
  }

  // get all users
  async getAllUsers(): Promise<IUser[]> {
    const users = await this.userModel.find();
    return users.map(user => {
      const u = user.toObject();
      u.photo_profil = this.uploadService.ensureAbsoluteUrl(u.photo_profil);
      u.profile_picture = this.uploadService.ensureAbsoluteUrl(u.profile_picture);
      return u as IUser;
    });
  }

  // get user by id
  async getUserById(id: string): Promise<IUser> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    const u = user.toObject();
    u.photo_profil = this.uploadService.ensureAbsoluteUrl(u.photo_profil);
    u.profile_picture = this.uploadService.ensureAbsoluteUrl(u.profile_picture);
    return u as IUser;
  }

  // get user by username/handle
  async getUserByUsername(handle: string): Promise<IUser> {
    const rawHandle = String(handle || '').trim();
    const canonicalHandle = slugifyFullNameToUsername(rawHandle);
    const candidateHandles = Array.from(new Set([rawHandle.toLowerCase(), canonicalHandle]));

    let user = await this.userModel.findOne({
      username: { $in: candidateHandles },
    });

    // Legacy compatibility: old profile URLs used email local-part
    if (!user) {
      const escaped = this.escapeRegex(rawHandle);
      user = await this.userModel.findOne({
        email: { $regex: `^${escaped}@`, $options: 'i' },
      });
    }

    if (!user) {
      throw new NotFoundException(`User with handle '${handle}' not found`);
    }
    const u = user.toObject();
    u.photo_profil = this.uploadService.ensureAbsoluteUrl(u.photo_profil);
    u.profile_picture = this.uploadService.ensureAbsoluteUrl(u.profile_picture);
    return u as IUser;
  }


  // delete user
  async deleteUser(id: string): Promise<IUser> {
    const deletedUser = await this.userModel.findByIdAndDelete(id);
    if (!deletedUser) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return deletedUser;
  }

  /**
   * Delete user account and all associated data
   * This is a comprehensive deletion that removes:
   * - User profile
   * - User posts and comments
   * - User communities (if creator)
   * - User memberships
   * - User bookings
   * - User wallet data
   * - User uploaded files
   */
  async deleteUserAccount(userId: string, deleteAccountDto: DeleteAccountDto): Promise<void> {
    const normalizedId = String(userId || '').trim();
    if (!Types.ObjectId.isValid(normalizedId)) {
      throw new BadRequestException('Format ID utilisateur invalide');
    }

    if ((deleteAccountDto.confirmText || '').trim() !== 'DELETE') {
      throw new BadRequestException('Le texte de confirmation doit etre DELETE');
    }

    const userObjectId = new Types.ObjectId(normalizedId);
    const user = await this.userModel.findById(userObjectId).select('+password');
    if (!user) {
      throw new NotFoundException(`User #${normalizedId} not found`);
    }

    const userPassword = String((user as any).password || '');
    if (!userPassword) {
      throw new BadRequestException('Aucun mot de passe local defini. Utilisez la reinitialisation de mot de passe.');
    }

    const passwordOk = await this.verifyPassword(deleteAccountDto.currentPassword, userPassword);
    if (!passwordOk) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    console.log(`🗑️ [DELETE ACCOUNT] Starting deletion for user ${normalizedId}`);
    console.log('⚠️ [DELETE ACCOUNT] Running non-transactional cascade cleanup (Mongo replica set transaction not enabled).');

    const connection = this.userModel.db as Connection;
    const Community = this.getModelIfRegistered(connection, 'Community');
    const Post = this.getModelIfRegistered(connection, 'Post');
    const Cours = this.getModelIfRegistered(connection, 'Cours');
    const Product = this.getModelIfRegistered(connection, 'Product');
    const Challenge = this.getModelIfRegistered(connection, 'Challenge');
    const Session = this.getModelIfRegistered(connection, 'Session');
    const Event = this.getModelIfRegistered(connection, 'Event');
    const Order = this.getModelIfRegistered(connection, 'Order');
    const Subscription = this.getModelIfRegistered(connection, 'Subscription');
    const Conversation = this.getModelIfRegistered(connection, 'Conversation');
    const Message = this.getModelIfRegistered(connection, 'Message');
    const Notification = this.getModelIfRegistered(connection, 'Notification');
    const NotificationPreferences = this.getModelIfRegistered(connection, 'NotificationPreferences');
    const ContentProgress = this.getModelIfRegistered(connection, 'ContentProgress');
    const TrackingAction = this.getModelIfRegistered(connection, 'TrackingAction');
    const CourseEnrollment = this.getModelIfRegistered(connection, 'CourseEnrollment');
    const UserCourseNote = this.getModelIfRegistered(connection, 'UserCourseNote');
    const CourseProgress = this.getModelIfRegistered(connection, 'CourseProgress');
    const WalletTransaction = this.getModelIfRegistered(connection, 'WalletTransaction');
    const TopUpRequest = this.getModelIfRegistered(connection, 'TopUpRequest');
    const Payout = this.getModelIfRegistered(connection, 'Payout');
    const UserAchievement = this.getModelIfRegistered(connection, 'UserAchievement');
    const ChallengeSubmission = this.getModelIfRegistered(connection, 'ChallengeSubmission');
    const Feedback = this.getModelIfRegistered(connection, 'Feedback');
    const MediaAsset = this.getModelIfRegistered(connection, 'MediaAsset');
    const StorageUsage = this.getModelIfRegistered(connection, 'StorageUsage');
    const RevokedToken = this.getModelIfRegistered(connection, 'RevokedToken');
    const PromoCode = this.getModelIfRegistered(connection, 'PromoCode');
    const EmailCampaign = this.getModelIfRegistered(connection, 'EmailCampaign');
    const AnalyticsDaily = this.getModelIfRegistered(connection, 'AnalyticsDaily');
    const UserLoginActivity = this.getModelIfRegistered(connection, 'UserLoginActivity');

    const logStep = (label: string, result?: any) => {
      const count = this.getAffectedCount(result);
      console.log(`✅ [DELETE ACCOUNT] ${label}: ${count}`);
    };

    try {
      if (Community) {
        const createdCommunities = await Community.find({ createur: userObjectId }).select('_id').lean();
        for (const community of createdCommunities) {
          await this.communityAffCreaJoinService.deleteCommunity(String((community as any)._id));
        }
        console.log(`✅ [DELETE ACCOUNT] Creator communities deleted via cascade service: ${createdCommunities.length}`);

        const communityCleanup = await Community.updateMany(
          {
            $or: [
              { members: userObjectId },
              { admins: userObjectId },
              { moderateurs: userObjectId },
            ],
          },
          {
            $pull: {
              members: userObjectId,
              admins: userObjectId,
              moderateurs: userObjectId,
            },
          },
        );
        logStep('Removed user from community memberships/roles', communityCleanup);
      }

      if (Post) {
        logStep('Deleted authored posts', await Post.deleteMany({ authorId: userObjectId }));
        logStep(
          'Removed user comments and reactions from posts',
          await Post.updateMany(
            {
              $or: [
                { 'comments.userId': userObjectId },
                { likedBy: userObjectId },
                { sharedBy: userObjectId },
                { bookmarks: userObjectId },
              ],
            },
            {
              $pull: {
                comments: { userId: userObjectId },
                likedBy: userObjectId,
                sharedBy: userObjectId,
                bookmarks: userObjectId,
              },
            },
          ),
        );
      }

      if (Challenge) {
        logStep('Deleted creator challenges', await Challenge.deleteMany({ creatorId: userObjectId }));
        logStep(
          'Removed user from challenge participants and posts',
          await Challenge.updateMany(
            {
              $or: [
                { 'participants.userId': userObjectId },
                { 'posts.userId': userObjectId },
              ],
            },
            {
              $pull: {
                participants: { userId: userObjectId },
                posts: { userId: userObjectId },
              },
            },
          ),
        );
        logStep(
          'Removed user comments from challenge posts',
          await Challenge.updateMany(
            { 'posts.comments.userId': userObjectId },
            {
              $pull: {
                'posts.$[].comments': { userId: userObjectId },
              },
            },
          ),
        );
      }

      if (Session) {
        logStep('Deleted creator sessions', await Session.deleteMany({ creatorId: userObjectId }));
        logStep(
          'Removed user from session bookings',
          await Session.updateMany(
            { 'bookings.userId': userObjectId },
            { $pull: { bookings: { userId: userObjectId } } },
          ),
        );
        logStep(
          'Released booked session slots',
          await Session.updateMany(
            { 'availableSlots.bookedBy': userObjectId },
            {
              $set: { 'availableSlots.$[slot].isAvailable': true },
              $unset: {
                'availableSlots.$[slot].bookedBy': 1,
                'availableSlots.$[slot].bookedAt': 1,
              },
            },
            {
              arrayFilters: [{ 'slot.bookedBy': userObjectId }],
            },
          ),
        );
      }

      if (Event) {
        logStep('Deleted creator events', await Event.deleteMany({ creatorId: userObjectId }));
        logStep(
          'Removed user from event attendees',
          await Event.updateMany(
            { 'attendees.userId': userObjectId },
            { $pull: { attendees: { userId: userObjectId } } },
          ),
        );
      }

      if (Cours) logStep('Deleted creator courses', await Cours.deleteMany({ creatorId: userObjectId }));
      if (Product) logStep('Deleted creator products', await Product.deleteMany({ creatorId: userObjectId }));
      if (EmailCampaign) {
        logStep(
          'Deleted creator/user email campaigns',
          await EmailCampaign.deleteMany({ $or: [{ creatorId: userObjectId }, { userId: userObjectId }] }),
        );
      }
      if (AnalyticsDaily) logStep('Deleted creator analytics snapshots', await AnalyticsDaily.deleteMany({ creatorId: userObjectId }));
      if (UserLoginActivity) logStep('Deleted user login activity', await UserLoginActivity.deleteMany({ userId: userObjectId }));
      if (PromoCode) logStep('Deleted creator promo codes', await PromoCode.deleteMany({ creatorId: userObjectId }));

      if (CourseEnrollment) {
        const enrollments = await CourseEnrollment.find({ userId: userObjectId }).select('_id').lean();
        const enrollmentIds = enrollments.map((item: any) => item._id).filter(Boolean);

        logStep('Deleted user course enrollments', await CourseEnrollment.deleteMany({ userId: userObjectId }));
        if (Cours && enrollmentIds.length > 0) {
          logStep(
            'Removed enrollment references from courses',
            await Cours.updateMany({ inscriptions: { $in: enrollmentIds } }, { $pull: { inscriptions: { $in: enrollmentIds } } }),
          );
        }
        if (CourseProgress && enrollmentIds.length > 0) {
          logStep('Deleted related course progress', await CourseProgress.deleteMany({ enrollmentId: { $in: enrollmentIds } }));
        }
      }

      if (UserCourseNote) logStep('Deleted user course notes', await UserCourseNote.deleteMany({ userId: userObjectId }));
      if (ContentProgress) logStep('Deleted content progress', await ContentProgress.deleteMany({ userId: userObjectId }));
      if (TrackingAction) logStep('Deleted tracking actions', await TrackingAction.deleteMany({ userId: userObjectId }));
      if (Order) logStep('Deleted user orders', await Order.deleteMany({ $or: [{ buyerId: userObjectId }, { creatorId: userObjectId }] }));
      if (Subscription) {
        logStep(
          'Deleted user subscriptions',
          await Subscription.deleteMany({ $or: [{ subscriberId: userObjectId }, { creatorId: userObjectId }] }),
        );
      }
      if (WalletTransaction) logStep('Deleted wallet transactions', await WalletTransaction.deleteMany({ userId: userObjectId }));
      if (TopUpRequest) {
        logStep(
          'Deleted top-up requests',
          await TopUpRequest.deleteMany({ $or: [{ userId: userObjectId }, { processedBy: userObjectId }] }),
        );
      }
      if (Payout) logStep('Deleted payouts', await Payout.deleteMany({ creatorId: userObjectId }));
      if (UserAchievement) logStep('Deleted user achievements', await UserAchievement.deleteMany({ userId: userObjectId }));
      if (ChallengeSubmission) {
        logStep(
          'Deleted challenge submissions',
          await ChallengeSubmission.deleteMany({ $or: [{ userId: userObjectId }, { reviewedBy: userObjectId }] }),
        );
      }
      if (Feedback) logStep('Deleted feedback records', await Feedback.deleteMany({ user: userObjectId }));
      if (Conversation) {
        logStep(
          'Deleted conversations',
          await Conversation.deleteMany({ $or: [{ participantA: userObjectId }, { participantB: userObjectId }] }),
        );
      }
      if (Message) {
        logStep(
          'Deleted direct messages',
          await Message.deleteMany({ $or: [{ senderId: userObjectId }, { recipientId: userObjectId }] }),
        );
        logStep('Cleaned soft-delete references in messages', await Message.updateMany({ deletedFor: userObjectId }, { $pull: { deletedFor: userObjectId } }));
      }
      if (Notification) {
        logStep(
          'Deleted notifications',
          await Notification.deleteMany({ $or: [{ recipient: userObjectId }, { sender: userObjectId }] }),
        );
      }
      if (NotificationPreferences) {
        logStep('Deleted notification preferences', await NotificationPreferences.deleteMany({ user: userObjectId }));
      }
      if (MediaAsset) logStep('Deleted media assets', await MediaAsset.deleteMany({ uploadedBy: userObjectId }));
      if (StorageUsage) logStep('Deleted storage usage records', await StorageUsage.deleteMany({ userId: userObjectId }));

      logStep(
        'Deleted verification codes',
        await this.verificationCodeModel.deleteMany({
          $or: [{ email: String((user as any).email || '').toLowerCase() }, { userId: userObjectId }],
        }),
      );
      if (RevokedToken) logStep('Deleted revoked token records', await RevokedToken.deleteMany({ userId: userObjectId }));

      await this.cleanupLocalAvatarFile(user);
      await this.userModel.findByIdAndDelete(userObjectId);
      await this.invalidateUserProfileCaches(user as any);
      console.log(`✅ [DELETE ACCOUNT] User account deleted: ${normalizedId}`);
    } catch (error: any) {
      console.error('❌ [DELETE ACCOUNT] Cascade deletion failed:', error);
      throw new BadRequestException(`Failed to delete account: ${error?.message || 'Unknown error'}`);
    }
  }

  // update user
  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<IUser> {
    const updatedUser = await this.userModel.findByIdAndUpdate(id, updateUserDto, { new: true });
    if (!updatedUser) {
      throw new NotFoundException(`User #${id} not found`);
    }
    await this.invalidateUserProfileCaches(updatedUser as any);
    const u = updatedUser.toObject();
    u.photo_profil = this.uploadService.ensureAbsoluteUrl(u.photo_profil);
    u.profile_picture = this.uploadService.ensureAbsoluteUrl(u.profile_picture);
    return u as IUser;
  }

  // update user password
  async updateUserPassword(id: string, changePasswordDto: ChangePasswordDto): Promise<void> {
    const user = await this.userModel.findById(id).select('+password');
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }

    const userPassword = String((user as any).password || '');
    if (!userPassword) {
      throw new BadRequestException('Aucun mot de passe local defini. Utilisez la reinitialisation de mot de passe.');
    }

    const currentPasswordValid = await this.verifyPassword(changePasswordDto.currentPassword, userPassword);
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const isSamePassword = await this.verifyPassword(changePasswordDto.newPassword, userPassword);
    if (isSamePassword) {
      throw new BadRequestException('Le nouveau mot de passe doit etre different du mot de passe actuel');
    }

    const hashedPassword = await this.hashPassword(changePasswordDto.newPassword);
    await this.userModel.findByIdAndUpdate(id, { password: hashedPassword });
  }

  /**
   * Génère un code de vérification à 6 chiffres
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Demande de mot de passe oublié - envoie un code de vérification par email
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    // Vérifier si l'utilisateur existe
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Pour des raisons de sécurité, on ne révèle pas si l'email existe ou non
      return { message: 'Si cet email existe dans notre base de données, vous recevrez un code de vérification.' };
    }

    // Supprimer les anciens codes de vérification pour cet email
    await this.verificationCodeModel.deleteMany({ email: email.toLowerCase(), type: 'password_reset' });

    // Générer un nouveau code de vérification
    const verificationCode = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Sauvegarder le code de vérification
    await new this.verificationCodeModel({
      email: email.toLowerCase(),
      code: verificationCode,
      type: 'password_reset',
      expiresAt,
      isUsed: false,
    }).save();

    // Envoyer l'email
    try {
      await this.emailService.sendPasswordResetEmail(email, verificationCode, user.name);
    } catch (error) {
      // Supprimer le code si l'envoi d'email échoue
      await this.verificationCodeModel.deleteOne({ email: email.toLowerCase(), code: verificationCode });
      throw new BadRequestException(`Erreur lors de l'envoi de l'email: ${error.message}`);
    }

    return { message: 'Si cet email existe dans notre base de données, vous recevrez un code de vérification.' };
  }

  /**
   * Réinitialise le mot de passe avec le code de vérification
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { email, verificationCode, newPassword } = resetPasswordDto;

    // Vérifier si l'utilisateur existe
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new BadRequestException('Email ou code de vérification invalide');
    }

    // Vérifier le code de vérification
    const codeDoc = await this.verificationCodeModel.findOne({
      email: email.toLowerCase(),
      code: verificationCode,
      type: 'password_reset',
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!codeDoc) {
      throw new BadRequestException('Code de vérification invalide ou expiré');
    }

    // Marquer le code comme utilisé
    await this.verificationCodeModel.findByIdAndUpdate(codeDoc._id, { isUsed: true });

    // Hash et mettre à jour le nouveau mot de passe
    const hashedPassword = await this.hashPassword(newPassword);
    await this.userModel.findByIdAndUpdate(user._id, { password: hashedPassword });

    // Supprimer tous les codes de vérification pour cet email
    await this.verificationCodeModel.deleteMany({ email: email.toLowerCase() });

    return { message: 'Mot de passe réinitialisé avec succès' };
  }
}
