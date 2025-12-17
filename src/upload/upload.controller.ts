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
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService, FileType } from './upload.service';
import { UploadResponseDto, MultipleUploadResponseDto, DeleteFileResponseDto } from './dto/upload-response.dto';

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
  @UseInterceptors(FileInterceptor('file'))
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
    @Query('type') fileType?: FileType
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    console.log('🔧 DEBUG - UploadController.uploadSingle');
    console.log(`   📁 Fichier: ${file.originalname}`);
    console.log(`   📊 Taille: ${file.size} bytes`);
    console.log(`   🏷️ Type MIME: ${file.mimetype}`);

    try {
      const reqAny = (arguments as any)[0]; // controller context workaround
      const userId = (reqAny as any)?.user?._id || (reqAny as any)?.user?.sub;
      const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
      
      return {
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
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucune image fournie');
    }

    const fileType = this.uploadService.getFileType(file.originalname);
    if (fileType !== FileType.IMAGE) {
      throw new BadRequestException('Le fichier doit être une image');
    }

    const reqAny = (arguments as any)[0];
    const userId = (reqAny as any)?.user?._id || (reqAny as any)?.user?.sub;
    const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
    
    return {
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
  @UseInterceptors(FileInterceptor('video'))
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucune vidéo fournie');
    }

    const fileType = this.uploadService.getFileType(file.originalname);
    if (fileType !== FileType.VIDEO) {
      throw new BadRequestException('Le fichier doit être une vidéo');
    }

    const reqAny = (arguments as any)[0];
    const userId = (reqAny as any)?.user?._id || (reqAny as any)?.user?.sub;
    const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
    
    return {
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
  @UseInterceptors(FileInterceptor('document'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucun document fourni');
    }

    const fileType = this.uploadService.getFileType(file.originalname);
    if (fileType !== FileType.DOCUMENT) {
      throw new BadRequestException('Le fichier doit être un document');
    }

    const reqAny = (arguments as any)[0];
    const userId = (reqAny as any)?.user?._id || (reqAny as any)?.user?.sub;
    const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
    
    return {
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
  @UseInterceptors(FilesInterceptor('files', 10)) // Maximum 10 fichiers
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[]
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
        const reqAny = (arguments as any)[0];
        const userId = (reqAny as any)?.user?._id || (reqAny as any)?.user?.sub;
        const result = await this.uploadService.processUploadedFile(file, file.filename, { userId });
        results.push({
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