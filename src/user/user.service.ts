import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { IUser } from 'src/interface/user.interface';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from 'src/dto-user/create-user.dto';
import { UpdateUserDto } from 'src/dto-user/update-user.dto';
import { ForgotPasswordDto } from 'src/dto-user/forgot-password.dto';
import { ResetPasswordDto } from 'src/dto-user/reset-password.dto';
import { EmailService } from 'src/common/services/email.service';
import { VerificationCode, VerificationCodeDocument } from 'src/schema/verification-code.schema';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class UserService {
  constructor(
    @InjectModel('User') private userModel: Model<IUser>,
    @InjectModel('VerificationCode') private verificationCodeModel: Model<VerificationCodeDocument>,
    private emailService: EmailService,
    private uploadService: UploadService,
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
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * Vérifie si un email ou un nom existe déjà
   */
  async checkUserExists(email: string, name: string): Promise<{ emailExists: boolean; nameExists: boolean }> {
    const emailExists = await this.userModel.findOne({ email: email.toLowerCase() });
    const nameExists = await this.userModel.findOne({ name: name });

    return {
      emailExists: !!emailExists,
      nameExists: !!nameExists
    };
  }

  // create user
  async createUser(createUserDto: CreateUserDto): Promise<IUser> {
    console.log('UserService: Creating user with data:', { ...createUserDto, password: '[REDACTED]' });

    // Vérifier si l'email ou le nom existe déjà
    const { emailExists, nameExists } = await this.checkUserExists(createUserDto.email, createUserDto.name);

    if (emailExists) {
      console.log('UserService: Email already exists:', createUserDto.email);
      throw new ConflictException(`L'email '${createUserDto.email}' est déjà utilisé par un autre compte`);
    }

    if (nameExists) {
      console.log('UserService: Name already exists:', createUserDto.name);
      throw new ConflictException(`Le nom '${createUserDto.name}' est déjà utilisé par un autre compte`);
    }

    // Hash le mot de passe avant de sauvegarder
    const hashedPassword = await this.hashPassword(createUserDto.password);
    console.log('UserService: Password hashed successfully');

    const newUser = await new this.userModel({
      ...createUserDto,
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

  // get user by username/handle (email local-part)
  async getUserByUsername(handle: string): Promise<IUser> {
    // Find user where email starts with handle@
    const user = await this.userModel.findOne({
      email: { $regex: `^${handle}@`, $options: 'i' }
    });
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
  async deleteUserAccount(userId: string): Promise<void> {
    console.log(`🗑️ [DELETE ACCOUNT] Starting deletion process for user ${userId}`);
    
    // Find user first
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User #${userId} not found`);
    }

    try {
      // 1. Delete user's posts
      const Post = this.userModel.db.model('Post');
      const deletedPosts = await Post.deleteMany({ authorId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedPosts.deletedCount} posts`);

      // 2. Delete user's comments
      const Comment = this.userModel.db.model('Comment');
      const deletedComments = await Comment.deleteMany({ userId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedComments.deletedCount} comments`);

      // 3. Remove user from communities (memberships)
      const Community = this.userModel.db.model('Community');
      const updatedCommunities = await Community.updateMany(
        { members: userId },
        { 
          $pull: { members: userId },
          $inc: { membersCount: -1 }
        }
      );
      console.log(`✅ [DELETE ACCOUNT] Removed from ${updatedCommunities.modifiedCount} communities`);

      // 4. Delete communities created by user (optional - or transfer ownership)
      const deletedCommunities = await Community.deleteMany({ creatorId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedCommunities.deletedCount} created communities`);

      // 5. Delete user's events
      const Event = this.userModel.db.model('Event');
      const deletedEvents = await Event.deleteMany({ creatorId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedEvents.deletedCount} events`);

      // 6. Delete user's event registrations
      const EventRegistration = this.userModel.db.model('EventRegistration');
      const deletedRegistrations = await EventRegistration.deleteMany({ userId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedRegistrations.deletedCount} event registrations`);

      // 7. Delete user's session bookings
      const SessionBooking = this.userModel.db.model('SessionBooking');
      const deletedBookings = await SessionBooking.deleteMany({ userId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedBookings.deletedCount} session bookings`);

      // 8. Delete user's sessions
      const Session = this.userModel.db.model('Session');
      const deletedSessions = await Session.deleteMany({ creatorId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedSessions.deletedCount} sessions`);

      // 9. Delete user's challenges
      const Challenge = this.userModel.db.model('Challenge');
      const deletedChallenges = await Challenge.deleteMany({ creatorId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedChallenges.deletedCount} challenges`);

      // 10. Remove user from challenge participants
      await Challenge.updateMany(
        { 'participants.userId': userId },
        { $pull: { participants: { userId: userId } } }
      );
      console.log(`✅ [DELETE ACCOUNT] Removed from challenge participants`);

      // 11. Delete user's courses
      const Cours = this.userModel.db.model('Cours');
      const deletedCourses = await Cours.deleteMany({ creatorId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedCourses.deletedCount} courses`);

      // 12. Delete user's products
      const Product = this.userModel.db.model('Product');
      const deletedProducts = await Product.deleteMany({ creatorId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedProducts.deletedCount} products`);

      // 13. Delete user's wallet transactions
      const WalletTransaction = this.userModel.db.model('WalletTransaction');
      const deletedTransactions = await WalletTransaction.deleteMany({ userId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedTransactions.deletedCount} wallet transactions`);

      // 14. Delete user's top-up requests
      const TopUpRequest = this.userModel.db.model('TopUpRequest');
      const deletedTopUps = await TopUpRequest.deleteMany({ userId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedTopUps.deletedCount} top-up requests`);

      // 15. Delete user's messages
      const Message = this.userModel.db.model('Message');
      const deletedMessages = await Message.deleteMany({ 
        $or: [{ senderId: userId }, { receiverId: userId }]
      });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedMessages.deletedCount} messages`);

      // 16. Delete user's conversations
      const Conversation = this.userModel.db.model('Conversation');
      const deletedConversations = await Conversation.deleteMany({
        participants: userId
      });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedConversations.deletedCount} conversations`);

      // 17. Delete user's notifications
      const Notification = this.userModel.db.model('Notification');
      const deletedNotifications = await Notification.deleteMany({ userId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedNotifications.deletedCount} notifications`);

      // 18. Delete user's tracking data (views, bookmarks, etc.)
      const TrackingData = this.userModel.db.model('TrackingData');
      const deletedTracking = await TrackingData.deleteMany({ userId: userId });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedTracking.deletedCount} tracking records`);

      // 19. Delete user's verification codes
      const deletedCodes = await this.verificationCodeModel.deleteMany({ email: user.email });
      console.log(`✅ [DELETE ACCOUNT] Deleted ${deletedCodes.deletedCount} verification codes`);

      // 20. Delete user's uploaded files (avatar, etc.)
      if (user.avatar || user.photo_profil) {
        try {
          const avatarPath = user.avatar || user.photo_profil;
          if (avatarPath && !avatarPath.startsWith('http')) {
            await this.uploadService.deleteFile(avatarPath);
            console.log(`✅ [DELETE ACCOUNT] Deleted avatar file`);
          }
        } catch (error) {
          console.warn(`⚠️ [DELETE ACCOUNT] Could not delete avatar file:`, error.message);
        }
      }

      // 21. Finally, delete the user account
      await this.userModel.findByIdAndDelete(userId);
      console.log(`✅ [DELETE ACCOUNT] User account deleted`);

      console.log(`🎉 [DELETE ACCOUNT] Account deletion completed successfully for user ${userId}`);
    } catch (error) {
      console.error(`❌ [DELETE ACCOUNT] Error during deletion:`, error);
      throw new BadRequestException(`Failed to delete account: ${error.message}`);
    }
  }

  // update user
  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<IUser> {
    const updatedUser = await this.userModel.findByIdAndUpdate(id, updateUserDto, { new: true });
    if (!updatedUser) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return updatedUser;
  }

  // update user password
  async updateUserPassword(id: string, updateUserDto: UpdateUserDto): Promise<IUser> {
    // Vérifier que le mot de passe existe
    if (!updateUserDto.password) {
      throw new Error('Le mot de passe est requis');
    }

    // Hash le nouveau mot de passe
    const hashedPassword = await this.hashPassword(updateUserDto.password);
    const updatedUser = await this.userModel.findByIdAndUpdate(
      id,
      { password: hashedPassword },
      { new: true }
    );
    if (!updatedUser) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return updatedUser;
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
