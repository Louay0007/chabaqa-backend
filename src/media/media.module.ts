import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadModule } from '../upload/upload.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { DiskStorageAdapter } from './storage/disk-storage.adapter';
import { S3StorageAdapter } from './storage/s3-storage.adapter';
import { MediaAsset, MediaAssetSchema } from '../schema/media-asset.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MediaAsset.name, schema: MediaAssetSchema }]),
    UploadModule,
  ],
  controllers: [MediaController],
  providers: [MediaService, DiskStorageAdapter, S3StorageAdapter],
  exports: [MediaService, MongooseModule],
})
export class MediaModule {}

