export interface PresignRequest {
  fileName: string;
  mimeType: string;
  size: number;
  storageKey?: string;
}

export interface PresignResult {
  uploadMode: 'direct' | 'proxy';
  uploadUrl: string;
  method: 'PUT' | 'POST';
  fields?: Record<string, string>;
  headers?: Record<string, string>;
  expiresInSeconds: number;
  storageKey?: string;
}

export interface StorageAdapter {
  readonly driver: 'disk' | 's3';
  presignUpload(req: PresignRequest): Promise<PresignResult>;
  deleteByStorageKey(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
