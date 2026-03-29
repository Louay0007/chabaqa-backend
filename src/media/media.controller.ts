import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from '../upload/upload.service';
import { MediaCompleteDto, MediaPresignDto, MediaUploadBodyDto } from './dto/media.dto';
import { MediaService } from './media.service';
import { MediaPurpose, MediaVisibility } from './media.types';

const multerOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const extension = extname(file.originalname).toLowerCase();
      let folder = 'uploads/document';
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)) {
        folder = 'uploads/image';
      } else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'].includes(extension)) {
        folder = 'uploads/video';
      } else if (['.mp3', '.wav', '.ogg', '.aac', '.flac'].includes(extension)) {
        folder = 'uploads/audio';
      }
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      const extension = extname(file.originalname);
      cb(null, `${Date.now()}-${uuidv4()}${extension}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
};

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly uploadService: UploadService,
  ) {}

  private getRequester(req: any): { userId?: string; isAdmin?: boolean } {
    const userId = (req?.user?._id || req?.user?.sub || req?.user?.id || '').toString();
    const role = (req?.user?.role || '').toString().toLowerCase();
    return {
      userId: userId || undefined,
      isAdmin: role === 'admin' || req?.user?.isAdmin === true,
    };
  }

  private ensureMediaEnabled() {
    if (process.env.MEDIA_V2_ENABLED === 'false') {
      throw new BadRequestException('Media V2 endpoints are disabled');
    }
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', multerOptions))
  @ApiOperation({ summary: 'Canonical media upload endpoint' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: { type: 'string' },
        entityType: { type: 'string' },
        entityId: { type: 'string' },
        visibility: { type: 'string' },
      },
    },
  })
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: MediaUploadBodyDto,
    @Request() req: any,
  ) {
    this.ensureMediaEnabled();
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const requester = this.getRequester(req);
    const result = await this.uploadService.processUploadedFile(file, file.filename, {
      userId: requester.userId,
      purpose: body.purpose as MediaPurpose | undefined,
      entityType: body.entityType,
      entityId: body.entityId,
      visibility: body.visibility as MediaVisibility | undefined,
    });

    if (!result.assetId) {
      throw new BadRequestException('Upload succeeded but media asset registration failed');
    }

    const asset = await this.mediaService.findById(result.assetId);
    if (!asset) {
      throw new BadRequestException('Media asset not found after upload');
    }

    return {
      success: true,
      data: this.mediaService.buildCanonicalData(asset),
    };
  }

  @Post('presign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Presign upload URL for direct-to-storage flow' })
  async presignUpload(@Body() dto: MediaPresignDto) {
    this.ensureMediaEnabled();
    return this.mediaService.createPresign(dto);
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete a direct-to-storage upload and register media asset' })
  async completeUpload(@Body() dto: MediaCompleteDto, @Request() req: any) {
    this.ensureMediaEnabled();
    const requester = this.getRequester(req);
    return this.mediaService.completeUpload(dto, requester.userId);
  }

  @Get('private/:assetId/file')
  @ApiOperation({ summary: 'Stream a private media file with signed token access' })
  async streamPrivateFile(
    @Param('assetId') assetId: string,
    @Query('token') token: string,
    @Query('expires', ParseIntPipe) expires: number,
    @Res() res: any,
  ) {
    return this.mediaService.streamPrivateAsset(assetId, token, expires, res);
  }

  @Get(':assetId/access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get access URL for media asset (signed for private assets)' })
  async getAccess(@Param('assetId') assetId: string, @Request() req: any) {
    this.ensureMediaEnabled();
    return this.mediaService.getAccess(assetId, this.getRequester(req));
  }

  @Get(':assetId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get media asset metadata' })
  async getAsset(@Param('assetId') assetId: string) {
    this.ensureMediaEnabled();
    return this.mediaService.getAsset(assetId);
  }

  @Delete(':assetId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete media asset' })
  async deleteAsset(@Param('assetId') assetId: string, @Request() req: any) {
    this.ensureMediaEnabled();
    return this.mediaService.deleteAsset(assetId, this.getRequester(req));
  }
}
