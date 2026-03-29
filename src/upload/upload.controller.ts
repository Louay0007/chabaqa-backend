import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  BadRequestException,
  NotFoundException,
  HttpStatus,
  HttpCode,
  Request,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService, FileType } from './upload.service';
import { UploadResponseDto, MultipleUploadResponseDto, DeleteFileResponseDto } from './dto/upload-response.dto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MediaPurpose, MediaVisibility } from '../media/media.types';

/**
 * Shared logic for determining upload destination
 */
const getDestination = (req, file, cb) => {
  const extension = extname(file.originalname).toLowerCase();
  let folder = 'uploads/document';

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)) {
    folder = 'uploads/image';
  } else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(extension)) {
    folder = 'uploads/video';
  } else if (['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'].includes(extension)) {
    folder = 'uploads/document';
  } else if (['.mp3', '.wav', '.ogg', '.aac', '.flac'].includes(extension)) {
    folder = 'uploads/audio';
  }

  cb(null, folder);
};

/**
 * Shared logic for generating unique filename
 */
const getFilename = (req, file, cb) => {
  const extension = extname(file.originalname);
  const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;
  cb(null, uniqueName);
};

const commonMulterOptions = {
  storage: diskStorage({
    destination: getDestination,
    filename: getFilename,
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
};

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Upload d'un seul fichier
   * POST /upload/single
   */
  @Post('single')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', commonMulterOptions))
  @ApiOperation({
    summary: 'Upload Single File',
    description: 'Upload a single file with automatic type detection. Supports images, videos, documents, and audio.',
    tags: ['Upload']
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File upload data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload'
        }
      },
      required: ['file']
    }
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: FileType,
    description: 'Optional file type override (auto-detected if not provided)'
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: UploadResponseDto,
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'Fichier uploadé avec succès',
          file: {
            originalName: 'document.pdf',
            filename: 'document-1234567890.pdf',
            mimetype: 'application/pdf',
            size: 1024000,
            url: 'https://api.shabaka.com/uploads/document/document-1234567890.pdf',
            type: 'document',
            uploadedAt: '2023-07-01T10:00:00.000Z'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - no file provided or invalid file',
    content: {
      'application/json': {
        example: {
          statusCode: 400,
          message: 'Aucun fichier fourni',
          error: 'Bad Request'
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid token',
    content: {
      'application/json': {
        example: {
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized'
        }
      }
    }
  })
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
    @Query('type') fileType?: string,
    @Query('purpose') purpose?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('visibility') visibility?: string,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    console.log('🔧 DEBUG - UploadController.uploadSingle');
    console.log(`   📁 Fichier: ${file.originalname}`);
    console.log(`   📊 Taille: ${file.size} bytes`);
    console.log(`   🏷️ Type MIME: ${file.mimetype}`);

    try {
      const userId = req?.user?._id || req?.user?.sub;
      const result = await this.uploadService.processUploadedFile(file, file.filename, {
        userId,
        purpose: purpose as MediaPurpose | undefined,
        entityType,
        entityId,
        visibility: visibility as MediaVisibility | undefined,
      });
      
      return {
        assetId: result.assetId,
        filename: result.filename,
        originalName: result.originalName,
        url: result.url,
        size: result.size,
        mimetype: result.mimetype,
        type: result.type,
        uploadedAt: new Date()
      };
    } catch (error) {
      console.error('❌ Erreur lors de l\'upload:', error);
      throw new BadRequestException(error.message || 'Erreur lors de l\'upload du fichier');
    }
  }

  /**
   * Upload d'images spécifiquement
   * POST /upload/image
   */
  @Post('image')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: (req, file, cb) => cb(null, 'uploads/image'),
      filename: getFilename,
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
  }))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucune image fournie');
    }

    const fileType = this.uploadService.getFileType(file.originalname);
    if (fileType !== FileType.IMAGE) {
      throw new BadRequestException('Le fichier doit être une image');
    }

    const userId = req?.user?._id || req?.user?.sub;
    const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
    
    return {
      assetId: result.assetId,
      filename: result.filename,
      originalName: result.originalName,
      url: result.url,
      size: result.size,
      mimetype: result.mimetype,
      type: result.type,
      uploadedAt: new Date()
    };
  }

  /**
   * Upload de vidéos spécifiquement
   * POST /upload/video
   */
  @Post('video')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('video', {
    storage: diskStorage({
      destination: (req, file, cb) => cb(null, 'uploads/video'),
      filename: getFilename,
    }),
    limits: { fileSize: 500 * 1024 * 1024 }
  }))
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucune vidéo fournie');
    }

    console.log('🎬 [VIDEO UPLOAD ENDPOINT] Received video upload request');
    console.log('   📁 Original name:', file.originalname);
    console.log('   📊 Size:', file.size, 'bytes');
    console.log('   🏷️ MIME type:', file.mimetype);
    console.log('   💾 Temp filename:', file.filename);

    const fileType = this.uploadService.getFileType(file.originalname);
    if (fileType !== FileType.VIDEO) {
      console.error('❌ [VIDEO UPLOAD ENDPOINT] Invalid file type:', fileType);
      throw new BadRequestException('Le fichier doit être une vidéo');
    }

    const userId = req?.user?._id || req?.user?.sub;
    console.log('   👤 User ID:', userId);
    
    const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
    
    console.log('✅ [VIDEO UPLOAD ENDPOINT] Upload processed successfully');
    console.log('   🔗 Generated URL:', result.url);
    console.log('   📝 Filename:', result.filename);
    
    return {
      assetId: result.assetId,
      filename: result.filename,
      originalName: result.originalName,
      url: result.url,
      size: result.size,
      mimetype: result.mimetype,
      type: result.type,
      uploadedAt: new Date()
    };
  }

  /**
   * Upload de documents spécifiquement
   * POST /upload/document
   */
  @Post('document')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('document', {
    storage: diskStorage({
      destination: (req, file, cb) => cb(null, 'uploads/document'),
      filename: getFilename,
    }),
    limits: { fileSize: 50 * 1024 * 1024 }
  }))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucun document fourni');
    }

    const fileType = this.uploadService.getFileType(file.originalname);
    if (fileType !== FileType.DOCUMENT) {
      throw new BadRequestException('Le fichier doit être un document');
    }

    const userId = req?.user?._id || req?.user?.sub;
    const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
    
    return {
      assetId: result.assetId,
      filename: result.filename,
      originalName: result.originalName,
      url: result.url,
      size: result.size,
      mimetype: result.mimetype,
      type: result.type,
      uploadedAt: new Date()
    };
  }

  /**
   * Upload multiple de fichiers
   * POST /upload/multiple
   */
  @Post('multiple')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 10, commonMulterOptions)) // Maximum 10 fichiers
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ): Promise<MultipleUploadResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    console.log('🔧 DEBUG - UploadController.uploadMultiple');
    console.log(`   📁 Nombre de fichiers: ${files.length}`);

    const results: UploadResponseDto[] = [];
    const errors: string[] = [];
    let successCount = 0;

    for (const file of files) {
      try {
        const userId = req?.user?._id || req?.user?.sub;
        const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
        results.push({
          assetId: result.assetId,
          filename: result.filename,
          originalName: result.originalName,
          url: result.url,
          size: result.size,
          mimetype: result.mimetype,
          type: result.type,
          uploadedAt: new Date()
        });
        successCount++;
      } catch (error) {
        errors.push(`${file.originalname}: ${error.message}`);
      }
    }

    return {
      files: results,
      totalFiles: files.length,
      successCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Supprimer un fichier
   * DELETE /upload/:type/:filename
   */
  @Delete(':type/:filename')
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Param('type') type: string,
    @Param('filename') filename: string
  ): Promise<DeleteFileResponseDto> {
    const fileType = type as FileType;
    
    if (!Object.values(FileType).includes(fileType)) {
      throw new BadRequestException('Type de fichier invalide');
    }

    console.log('🔧 DEBUG - UploadController.deleteFile');
    console.log(`   📁 Fichier: ${filename}`);
    console.log(`   🏷️ Type: ${fileType}`);

    const success = await this.uploadService.deleteFile(filename, fileType);
    
    if (!success) {
      throw new NotFoundException('Fichier non trouvé');
    }

    return {
      success: true,
      message: 'Fichier supprimé avec succès',
      filename
    };
  }

  /**
   * Obtenir les informations d'un fichier
   * GET /upload/:type/:filename/info
   */
  @Get(':type/:filename/info')
  async getFileInfo(
    @Param('type') type: string,
    @Param('filename') filename: string
  ): Promise<UploadResponseDto> {
    const fileType = type as FileType;
    
    if (!Object.values(FileType).includes(fileType)) {
      throw new BadRequestException('Type de fichier invalide');
    }

    const fileInfo = this.uploadService.getFileInfo(filename, fileType);
    
    if (!fileInfo) {
      throw new NotFoundException('Fichier non trouvé');
    }

    return {
      filename: fileInfo.filename,
      originalName: fileInfo.originalName,
      url: fileInfo.url,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      type: fileInfo.type,
      uploadedAt: new Date() // On ne stocke pas la date, donc on met la date actuelle
    };
  }
}
