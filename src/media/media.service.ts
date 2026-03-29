import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac } from 'crypto';
import { existsSync } from 'fs';
import { Model, Types } from 'mongoose';
import { join } from 'path';
import { MediaAsset, MediaAssetDocument } from '../schema/media-asset.schema';
import { MediaCompleteDto, MediaPresignDto } from './dto/media.dto';
import {
  MediaAssetStatus,
  MediaPurpose,
  MediaType,
  MediaVisibility,
  PURPOSE_DEFAULT_VISIBILITY,
} from './media.types';
import { DiskStorageAdapter } from './storage/disk-storage.adapter';
import { S3StorageAdapter } from './storage/s3-storage.adapter';
import { StorageAdapter } from './storage/storage-adapter.interface';
import { getMediaPrivateTokenSecret } from '../common/utils/security-config.util';

@Injectable()
export class MediaService {
  private readonly uploadsRoot = join(process.cwd(), process.env.UPLOAD_PATH || 'uploads');
  private readonly publicBaseUrl = (process.env.MEDIA_PUBLIC_BASE_URL || process.env.SERVER_URL || 'https://api.chabaqa.io').replace(/\/+$/, '');
  private readonly privateEnforcement = process.env.MEDIA_PRIVATE_ENFORCEMENT === 'true';
  private readonly tokenSecret = getMediaPrivateTokenSecret();
  private readonly presignedEnabled = process.env.MEDIA_PRESIGNED_ENABLED === 'true';

  constructor(
    @InjectModel(MediaAsset.name) private readonly mediaModel: Model<MediaAssetDocument>,
    private readonly diskStorageAdapter: DiskStorageAdapter,
    private readonly s3StorageAdapter: S3StorageAdapter,
  ) {}

  getStorageDriver(): 'disk' | 's3' {
    return (process.env.MEDIA_STORAGE_DRIVER || 'disk').toLowerCase() === 's3' ? 's3' : 'disk';
  }

  private getStorageAdapter(): StorageAdapter {
    return this.getStorageDriver() === 's3' ? this.s3StorageAdapter : this.diskStorageAdapter;
  }

  private toObjectId(value?: string): Types.ObjectId | undefined {
    if (!value || !Types.ObjectId.isValid(value)) return undefined;
    return new Types.ObjectId(value);
  }

  private getVisibility(purpose?: MediaPurpose, visibility?: MediaVisibility): MediaVisibility {
    if (visibility) return visibility;
    if (!purpose) return MediaVisibility.PUBLIC;
    return PURPOSE_DEFAULT_VISIBILITY[purpose] || MediaVisibility.PUBLIC;
  }

  private buildPublicFileUrl(storageKey: string): string {
    return `${this.publicBaseUrl}/uploads/${storageKey}`;
  }

  private buildSignedToken(assetId: string, expires: number): string {
    const payload = `${assetId}.${expires}`;
    return createHmac('sha256', this.tokenSecret).update(payload).digest('hex');
  }

  private buildPrivateStreamUrl(assetId: string, ttlSeconds = 300): string {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = this.buildSignedToken(assetId, expires);
    return `${this.publicBaseUrl}/api/media/private/${assetId}/file?expires=${expires}&token=${token}`;
  }

  isPrivateTokenValid(assetId: string, token: string, expires: number): boolean {
    if (!token || !expires || Number.isNaN(expires)) return false;
    if (expires < Math.floor(Date.now() / 1000)) return false;
    const expected = this.buildSignedToken(assetId, expires);
    return expected === token;
  }

  buildCanonicalData(asset: MediaAssetDocument) {
    return {
      assetId: String(asset._id),
      url: asset.url,
      mediaType: asset.mediaType,
      purpose: asset.purpose,
      visibility: asset.visibility,
      mimeType: asset.mimeType,
      size: asset.size,
      checksum: asset.checksum || '',
      storageKey: asset.storageKey,
      createdAt: asset.createdAt,
      status: asset.status,
      entityType: asset.entityType,
      entityId: asset.entityId,
    };
  }

  async createPresign(dto: MediaPresignDto) {
    if (!this.presignedEnabled) {
      return {
        success: true,
        data: {
          uploadMode: 'proxy',
          uploadUrl: '/api/media/upload',
          method: 'POST',
          expiresInSeconds: 0,
          note: 'Presigned uploads are disabled. Use proxy upload endpoint.',
        },
      };
    }

    const purpose = dto.purpose || MediaPurpose.GENERIC;
    const storageKey = `${purpose}/${Date.now()}-${dto.fileName}`;
    const result = await this.getStorageAdapter().presignUpload({
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      size: dto.size,
      storageKey,
    });

    return {
      success: true,
      data: {
        ...result,
        purpose,
      },
    };
  }

  async completeUpload(dto: MediaCompleteDto, userId?: string) {
    const purpose = (dto.purpose as MediaPurpose | undefined) || MediaPurpose.GENERIC;
    const visibility = this.getVisibility(purpose, dto.visibility as MediaVisibility | undefined);
    const mediaType = this.detectTypeFromKey(dto.storageKey);
    const baseUrl = this.buildPublicFileUrl(dto.storageKey);
    const asset = await this.mediaModel.create({
      mediaType,
      purpose,
      visibility,
      status: MediaAssetStatus.UPLOADED,
      filename: dto.fileName,
      originalName: dto.fileName,
      storageKey: dto.storageKey.replace(/^\/+/, ''),
      url: baseUrl,
      mimeType: dto.mimeType,
      size: dto.size,
      checksum: dto.checksum,
      uploadedBy: this.toObjectId(userId),
      entityType: dto.entityType,
      entityId: dto.entityId,
    });

    if (visibility === MediaVisibility.PRIVATE && this.privateEnforcement) {
      asset.url = this.buildPrivateStreamUrl(String(asset._id));
      await asset.save();
    }

    return {
      success: true,
      data: this.buildCanonicalData(asset),
    };
  }

  private detectTypeFromKey(storageKey: string): MediaType {
    const key = storageKey.toLowerCase();
    if (key.includes('/video/') || /\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/.test(key)) return MediaType.VIDEO;
    if (key.includes('/audio/') || /\.(mp3|wav|ogg|aac|flac)$/.test(key)) return MediaType.AUDIO;
    if (key.includes('/image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(key)) return MediaType.IMAGE;
    return MediaType.DOCUMENT;
  }

  async getAsset(assetId: string) {
    const asset = await this.mediaModel.findById(assetId);
    if (!asset || asset.status === MediaAssetStatus.DELETED) {
      throw new NotFoundException('Media asset not found');
    }
    return {
      success: true,
      data: this.buildCanonicalData(asset),
    };
  }

  async getAccess(assetId: string, requester?: { userId?: string; isAdmin?: boolean }) {
    const asset = await this.mediaModel.findById(assetId);
    if (!asset || asset.status === MediaAssetStatus.DELETED) {
      throw new NotFoundException('Media asset not found');
    }

    if (asset.visibility === MediaVisibility.PRIVATE && this.privateEnforcement) {
      const ownerId = asset.uploadedBy ? String(asset.uploadedBy) : '';
      const requesterId = requester?.userId || '';
      if (!requester?.isAdmin && ownerId && ownerId !== requesterId) {
        throw new ForbiddenException('You do not have access to this media');
      }
      return {
        success: true,
        data: {
          assetId: String(asset._id),
          url: this.buildPrivateStreamUrl(String(asset._id)),
          expiresInSeconds: 300,
          visibility: asset.visibility,
        },
      };
    }

    return {
      success: true,
      data: {
        assetId: String(asset._id),
        url: asset.url,
        expiresInSeconds: 0,
        visibility: asset.visibility,
      },
    };
  }

  async streamPrivateAsset(assetId: string, token: string, expires: number, res: any) {
    if (!this.isPrivateTokenValid(assetId, token, expires)) {
      throw new UnauthorizedException('Invalid or expired media token');
    }

    const asset = await this.mediaModel.findById(assetId);
    if (!asset || asset.status === MediaAssetStatus.DELETED) {
      throw new NotFoundException('Media asset not found');
    }

    const filePath = join(this.uploadsRoot, asset.storageKey);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Media file missing from storage');
    }

    res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
    return res.sendFile(filePath);
  }

  async deleteAsset(assetId: string, requester?: { userId?: string; isAdmin?: boolean }) {
    const asset = await this.mediaModel.findById(assetId);
    if (!asset || asset.status === MediaAssetStatus.DELETED) {
      throw new NotFoundException('Media asset not found');
    }

    const ownerId = asset.uploadedBy ? String(asset.uploadedBy) : '';
    const requesterId = requester?.userId || '';
    if (!requester?.isAdmin && ownerId && ownerId !== requesterId) {
      throw new ForbiddenException('You are not allowed to delete this media');
    }

    try {
      await this.getStorageAdapter().deleteByStorageKey(asset.storageKey);
    } catch {
      // Keep tombstoning even if physical delete fails.
    }

    asset.status = MediaAssetStatus.DELETED;
    asset.deletedAt = new Date();
    await asset.save();

    return {
      success: true,
      message: 'Media asset deleted',
      data: { assetId: String(asset._id), status: asset.status },
    };
  }

  async findById(assetId: string): Promise<MediaAssetDocument | null> {
    return this.mediaModel.findById(assetId);
  }
}
