import { Injectable, NotImplementedException } from '@nestjs/common';
import { PresignRequest, PresignResult, StorageAdapter } from './storage-adapter.interface';

@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  readonly driver: 's3' = 's3';

  async presignUpload(_req: PresignRequest): Promise<PresignResult> {
    throw new NotImplementedException(
      'S3 presigned upload is not wired in this build. Configure MEDIA_STORAGE_DRIVER=disk or implement provider SDK wiring.',
    );
  }

  async deleteByStorageKey(_storageKey: string): Promise<void> {
    throw new NotImplementedException('S3 delete is not wired in this build.');
  }

  async exists(_storageKey: string): Promise<boolean> {
    throw new NotImplementedException('S3 exists check is not wired in this build.');
  }
}

