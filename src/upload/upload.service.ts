import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorageUsage, StorageUsageDocument } from '../schema/storage-usage.schema';
import { PolicyService } from '../common/services/policy.service';

export enum FileType {
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
  AUDIO = 'audio'
}

export interface UploadResult {
  filename: string;
  originalName: string;
  path: string;
  url: string;
  size: number;
  mimetype: string;
  type: FileType;
}

@Injectable()
export class UploadService {
  private readonly uploadPath = 'uploads';
  private readonly baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  private readonly storageUsageMap = new Map<string, number>(); // legacy in-memory (fallback)

  // Configuration des types de fichiers autorisés
  private readonly allowedTypes = {
    [FileType.IMAGE]: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    [FileType.VIDEO]: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
    [FileType.DOCUMENT]: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'],
    [FileType.AUDIO]: ['.mp3', '.wav', '.ogg', '.aac', '.flac']
  };

  // Taille maximale par type (en bytes)
  private readonly maxSizes = {
    [FileType.IMAGE]: 5 * 1024 * 1024, // 5MB
    [FileType.VIDEO]: 100 * 1024 * 1024, // 100MB
    [FileType.DOCUMENT]: 10 * 1024 * 1024, // 10MB
    [FileType.AUDIO]: 20 * 1024 * 1024 // 20MB
  };

  constructor(
    @InjectModel(StorageUsage.name) private storageModel: Model<StorageUsageDocument>,
    private readonly policyService: PolicyService,
  ) {
    this.ensureUploadDirectories();
  }

  /**
   * Créer les dossiers d'upload s'ils n'existent pas
   */
  private ensureUploadDirectories(): void {
    const baseDir = join(process.cwd(), this.uploadPath);
    
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }

    // Créer les sous-dossiers pour chaque type
    Object.values(FileType).forEach(type => {
      const typeDir = join(baseDir, type);
      if (!existsSync(typeDir)) {
        mkdirSync(typeDir, { recursive: true });
      }
    });
  }

  /**
   * Déterminer le type de fichier basé sur l'extension
   */
  getFileType(filename: string): FileType {
    const extension = extname(filename).toLowerCase();
    
    for (const [type, extensions] of Object.entries(this.allowedTypes)) {
      if (extensions.includes(extension)) {
        return type as FileType;
      }
    }
    
    throw new BadRequestException(`Type de fichier non supporté: ${extension}`);
  }

  /**
   * Valider un fichier avant upload
   */
  validateFile(file: Express.Multer.File): FileType {
    const fileType = this.getFileType(file.originalname);
    
    // Vérifier la taille
    if (file.size > this.maxSizes[fileType]) {
      const maxSizeMB = this.maxSizes[fileType] / (1024 * 1024);
      throw new BadRequestException(
        `Fichier trop volumineux. Taille maximale pour ${fileType}: ${maxSizeMB}MB`
      );
    }

    // Vérifier le mimetype selon le type de fichier
    const validMimeTypes = {
      'image': ['image/'],
      'video': ['video/'],
      'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument', 'text/plain', 'application/rtf', 'application/vnd.oasis.opendocument'],
      'audio': ['audio/']
    };

    const allowedMimeTypes = validMimeTypes[fileType] || [];
    const isValidMimeType = allowedMimeTypes.some(mimePrefix => 
      file.mimetype.startsWith(mimePrefix) || file.mimetype === mimePrefix
    );

    if (!isValidMimeType) {
      console.error(`❌ Type MIME rejeté: ${file.mimetype} pour le type ${fileType}`);
      console.error(`   Types acceptés: ${allowedMimeTypes.join(', ')}`);
      throw new BadRequestException(`Type MIME invalide pour ${fileType}. Types acceptés: ${allowedMimeTypes.join(', ')}`);
    }

    return fileType;
  }

  // Track and enforce storage quotas (DB-backed)
  private async getUsageBytes(userId: string): Promise<number> {
    const doc = await this.storageModel.findOne({ userId: new Types.ObjectId(userId) });
    return doc?.usedBytes || 0;
  }

  private async addUsageBytes(userId: string, bytes: number): Promise<void> {
    await this.storageModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $inc: { usedBytes: bytes } },
      { upsert: true }
    );
  }

  /**
   * Générer un nom de fichier unique
   */
  generateFilename(originalName: string): string {
    const extension = extname(originalName);
    const uuid = uuidv4();
    const timestamp = Date.now();
    return `${timestamp}-${uuid}${extension}`;
  }

  /**
   * Obtenir le chemin de destination pour un type de fichier
   */
  getDestinationPath(fileType: FileType): string {
    return join(process.cwd(), this.uploadPath, fileType);
  }

  /**
   * Générer l'URL publique du fichier
   */
  generateFileUrl(filename: string, fileType: FileType): string {
    return `${this.baseUrl}/uploads/${fileType}/${filename}`;
  }

  /**
   * Traiter un fichier uploadé
   */
  async processUploadedFile(file: Express.Multer.File, filename: string, context?: { userId?: string }): Promise<UploadResult> {
    const fileType = this.validateFile(file);
    if (context?.userId) {
      const limits = await this.policyService.getEffectiveLimitsForCreator(context.userId);
      const used = await this.getUsageBytes(context.userId);
      const limitBytes = limits.storageGB * 1024 * 1024 * 1024;
      if (used + file.size > limitBytes) {
        throw new ForbiddenException('Quota de stockage atteint pour votre plan.');
      }
      await this.addUsageBytes(context.userId, file.size);
    }
    const url = this.generateFileUrl(filename, fileType);

    return {
      filename,
      originalName: file.originalname,
      path: file.path,
      url,
      size: file.size,
      mimetype: file.mimetype,
      type: fileType
    };
  }

  /**
   * Obtenir la configuration multer pour un type de fichier (méthode utilitaire)
   * Cette méthode n'est plus utilisée directement par le module mais peut être utile pour des cas spéciaux
   */
  getMulterOptions(fileType?: FileType) {
    const multer = require('multer');
    return {
      storage: multer.diskStorage({
        destination: (req: any, file: Express.Multer.File, cb: Function) => {
          const detectedType = fileType || this.getFileType(file.originalname);
          const destinationPath = this.getDestinationPath(detectedType);
          cb(null, destinationPath);
        },
        filename: (req: any, file: Express.Multer.File, cb: Function) => {
          const uniqueName = this.generateFilename(file.originalname);
          cb(null, uniqueName);
        }
      }),
      fileFilter: (req: any, file: Express.Multer.File, cb: Function) => {
        try {
          this.validateFile(file);
          cb(null, true);
        } catch (error) {
          cb(error, false);
        }
      },
      limits: {
        fileSize: Math.max(...Object.values(this.maxSizes))
      }
    };
  }

  /**
   * Supprimer un fichier uploadé
   */
  async deleteFile(filename: string, fileType: FileType): Promise<boolean> {
    try {
      const fs = require('fs').promises;
      const filePath = join(this.getDestinationPath(fileType), filename);
      
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erreur lors de la suppression du fichier:', error);
      return false;
    }
  }

  /**
   * Obtenir les informations d'un fichier
   */
  getFileInfo(filename: string, fileType: FileType): UploadResult | null {
    const filePath = join(this.getDestinationPath(fileType), filename);
    
    if (!existsSync(filePath)) {
      return null;
    }

    const fs = require('fs');
    const stats = fs.statSync(filePath);
    
    return {
      filename,
      originalName: filename,
      path: filePath,
      url: this.generateFileUrl(filename, fileType),
      size: stats.size,
      mimetype: this.getMimeType(filename),
      type: fileType
    };
  }

  /**
   * Upload d'une image encodée en base64 (utile pour les avatars générés côté client)
   */
  async uploadBase64Image(
    base64Data: string,
    options?: { userId?: string; folder?: string }
  ): Promise<UploadResult> {
    if (!base64Data) {
      throw new BadRequestException('Aucune image fournie');
    }

    const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new BadRequestException('Format base64 invalide');
    }

    const mimeType = matches[1];
    const encodedData = matches[2];
    const extension = this.getExtensionFromMime(mimeType);

    if (!extension) {
      throw new BadRequestException(`Type d'image non supporté: ${mimeType}`);
    }

    if (!this.allowedTypes[FileType.IMAGE].includes(extension)) {
      throw new BadRequestException(`Extension non autorisée: ${extension}`);
    }

    const buffer = Buffer.from(encodedData, 'base64');
    if (buffer.length > this.maxSizes[FileType.IMAGE]) {
      const maxSizeMB = this.maxSizes[FileType.IMAGE] / (1024 * 1024);
      throw new BadRequestException(`Image trop volumineuse. Taille maximale: ${maxSizeMB}MB`);
    }

    if (options?.userId) {
      const limits = await this.policyService.getEffectiveLimitsForCreator(options.userId);
      const used = await this.getUsageBytes(options.userId);
      const limitBytes = limits.storageGB * 1024 * 1024 * 1024;
      if (used + buffer.length > limitBytes) {
        throw new ForbiddenException('Quota de stockage atteint pour votre plan.');
      }
    }

    const filename = this.generateFilename(`upload${extension}`);
    const rootDestination = this.getDestinationPath(FileType.IMAGE);
    const targetDirectory = options?.folder ? join(rootDestination, options.folder) : rootDestination;

    if (!existsSync(targetDirectory)) {
      mkdirSync(targetDirectory, { recursive: true });
    }

    const fs = require('fs').promises;
    const filePath = join(targetDirectory, filename);
    await fs.writeFile(filePath, buffer);

    if (options?.userId) {
      await this.addUsageBytes(options.userId, buffer.length);
    }

    const relativePath = options?.folder
      ? `${FileType.IMAGE}/${options.folder}/${filename}`
      : `${FileType.IMAGE}/${filename}`;
    const url = `${this.baseUrl}/uploads/${relativePath}`;

    return {
      filename,
      originalName: filename,
      path: filePath,
      url,
      size: buffer.length,
      mimetype: mimeType,
      type: FileType.IMAGE,
    };
  }

  /**
   * Obtenir le mimetype d'un fichier basé sur son extension
   */
  private getMimeType(filename: string): string {
    const extension = extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }

  private getExtensionFromMime(mimeType: string): string | null {
    const normalized = mimeType.toLowerCase();
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    return map[normalized] || null;
  }
}