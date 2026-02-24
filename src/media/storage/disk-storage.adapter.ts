import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { PresignRequest, PresignResult, StorageAdapter } from './storage-adapter.interface';

@Injectable()
export class DiskStorageAdapter implements StorageAdapter {
  readonly driver: 'disk' = 'disk';

  private readonly uploadsRoot = join(process.cwd(), process.env.UPLOAD_PATH || 'uploads');

  async presignUpload(_req: PresignRequest): Promise<PresignResult> {
    return {
      uploadMode: 'proxy',
      uploadUrl: '/api/media/upload',
      method: 'POST',
      expiresInSeconds: 0,
    };
  }

  async deleteByStorageKey(storageKey: string): Promise<void> {
    const filePath = join(this.uploadsRoot, storageKey);
    await fs.unlink(filePath);
  }

  async exists(storageKey: string): Promise<boolean> {
    return existsSync(join(this.uploadsRoot, storageKey));
  }
}

