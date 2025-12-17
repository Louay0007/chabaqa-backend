import { FileType } from '../upload.service';

export class UploadResponseDto {
  filename: string;
  originalName: string;
  url: string;
  size: number;
  mimetype: string;
  type: FileType;
  uploadedAt: Date;
}

export class MultipleUploadResponseDto {
  files: UploadResponseDto[];
  totalFiles: number;
  successCount: number;
  errorCount: number;
  errors?: string[];
}

export class DeleteFileResponseDto {
  success: boolean;
  message: string;
  filename?: string;
}