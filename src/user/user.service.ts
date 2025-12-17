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

@Injectable()
export class UserService {
  constructor(
    @InjectModel('User') private userModel: Model<IUser>,
    @InjectModel('VerificationCode') private verificationCodeModel: Model<VerificationCodeDocument>,
    private emailService: EmailService,
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
    return users;
  }

  // get user by id
  async getUserById(id: string): Promise<IUser> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
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
    return user;
  }


  // delete user
  async deleteUser(id: string): Promise<IUser> {
    const deletedUser = await this.userModel.findByIdAndDelete(id);
    if (!deletedUser) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return deletedUser;
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
