import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SecurityService } from './security.service';
import * as path from 'path';
import * as fs from 'fs';

export interface FileValidationResult {
  isValid: boolean;
  reason?: string;
  sanitizedFilename?: string;
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);

  // Allowed file types (whitelist approach is safer)
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ];

  private readonly ALLOWED_DOCUMENT_TYPES = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  private readonly ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo', // .avi
    'video/x-ms-wmv'   // .wmv
  ];

  // Dangerous file extensions to block
  private readonly BLOCKED_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
    '.jar', '.php', '.asp', '.aspx', '.jsp', '.sh', '.py', '.pl',
    '.rb', '.ps1', '.psm1', '.psd1', '.msi', '.dll', '.sys'
  ];

  // File size limits (in bytes)
  private readonly MAX_FILE_SIZES = {
    image: 5 * 1024 * 1024,    // 5MB
    document: 10 * 1024 * 1024, // 10MB  
    video: 100 * 1024 * 1024,   // 100MB
    default: 5 * 1024 * 1024    // 5MB
  };

  constructor(private securityService: SecurityService) {}

  /**
   * Validate uploaded file
   */
  async validateFile(
    file: Express.Multer.File,
    allowedTypes?: string[],
    maxSize?: number
  ): Promise<FileValidationResult> {
    try {
      // Basic validation
      if (!file) {
        return { isValid: false, reason: 'No file provided' };
      }

      // Check file size
      const sizeLimit = maxSize || this.getMaxSizeForFile(file.mimetype);
      if (file.size > sizeLimit) {
        return { 
          isValid: false, 
          reason: `File too large. Max size: ${Math.round(sizeLimit / 1024 / 1024)}MB` 
        };
      }

      // Check file type
      const typeCheck = this.validateFileType(file, allowedTypes);
      if (!typeCheck.isValid) {
        return typeCheck;
      }

      // Check filename for malicious patterns
      const filenameCheck = this.validateFilename(file.originalname);
      if (!filenameCheck.isValid) {
        return filenameCheck;
      }

      // Basic content validation
      const contentCheck = await this.validateFileContent(file);
      if (!contentCheck.isValid) {
        return contentCheck;
      }

      // Generate safe filename
      const sanitizedFilename = this.sanitizeFilename(file.originalname);

      this.logger.log(`File validation passed: ${file.originalname} (${file.mimetype})`);

      return {
        isValid: true,
        sanitizedFilename
      };

    } catch (error) {
      this.logger.error('File validation error:', error);
      return { isValid: false, reason: 'File validation failed' };
    }
  }

  /**
   * Validate file type against allowed types
   */
  private validateFileType(file: Express.Multer.File, allowedTypes?: string[]): FileValidationResult {
    let validTypes: string[];

    if (allowedTypes) {
      validTypes = allowedTypes;
    } else {
      // Default allowed types
      validTypes = [
        ...this.ALLOWED_IMAGE_TYPES,
        ...this.ALLOWED_DOCUMENT_TYPES,
        ...this.ALLOWED_VIDEO_TYPES
      ];
    }

    if (!validTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        reason: `File type not allowed: ${file.mimetype}`
      };
    }

    return { isValid: true };
  }

  /**
   * Validate filename for malicious patterns
   */
  private validateFilename(filename: string): FileValidationResult {
    if (!filename || filename.trim() === '') {
      return { isValid: false, reason: 'Invalid filename' };
    }

    // Check for path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return { isValid: false, reason: 'Invalid characters in filename' };
    }

    // Check file extension
    const ext = path.extname(filename).toLowerCase();
    if (this.BLOCKED_EXTENSIONS.includes(ext)) {
      return { isValid: false, reason: `Blocked file extension: ${ext}` };
    }

    // Check for null bytes and control characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(filename)) {
      return { isValid: false, reason: 'Invalid characters in filename' };
    }

    // Check length
    if (filename.length > 255) {
      return { isValid: false, reason: 'Filename too long' };
    }

    return { isValid: true };
  }

  /**
   * Basic file content validation
   */
  private async validateFileContent(file: Express.Multer.File): Promise<FileValidationResult> {
    try {
      // Check for common malicious signatures in file headers
      const buffer = file.buffer;
      
      if (!buffer || buffer.length === 0) {
        return { isValid: false, reason: 'Empty file' };
      }

      // Check for executable signatures
      const header = buffer.slice(0, 4);
      
      // PE executable (Windows .exe)
      if (header[0] === 0x4D && header[1] === 0x5A) {
        return { isValid: false, reason: 'Executable file detected' };
      }

      // ELF executable (Linux)
      if (header[0] === 0x7F && header[1] === 0x45 && header[2] === 0x4C && header[3] === 0x46) {
        return { isValid: false, reason: 'Executable file detected' };
      }

      // Java class file
      if (header[0] === 0xCA && header[1] === 0xFE && header[2] === 0xBA && header[3] === 0xBE) {
        return { isValid: false, reason: 'Java class file detected' };
      }

      // Check for script content in supposed image files
      if (file.mimetype.startsWith('image/')) {
        const content = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
        
        // Look for script tags or PHP code
        if (/<script|<\?php|<%|javascript:|vbscript:/i.test(content)) {
          return { isValid: false, reason: 'Malicious content in image file' };
        }
      }

      // Validate image files have proper headers
      if (file.mimetype.startsWith('image/')) {
        const imageValidation = this.validateImageHeader(buffer, file.mimetype);
        if (!imageValidation.isValid) {
          return imageValidation;
        }
      }

      return { isValid: true };

    } catch (error) {
      this.logger.error('Content validation error:', error);
      return { isValid: false, reason: 'Content validation failed' };
    }
  }

  /**
   * Validate image file headers
   */
  private validateImageHeader(buffer: Buffer, mimetype: string): FileValidationResult {
    const header = buffer.slice(0, 8);

    switch (mimetype) {
      case 'image/jpeg':
      case 'image/jpg':
        // JPEG files start with FF D8 FF
        if (!(header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF)) {
          return { isValid: false, reason: 'Invalid JPEG header' };
        }
        break;

      case 'image/png':
        // PNG files start with 89 50 4E 47 0D 0A 1A 0A
        const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        for (let i = 0; i < pngSignature.length; i++) {
          if (header[i] !== pngSignature[i]) {
            return { isValid: false, reason: 'Invalid PNG header' };
          }
        }
        break;

      case 'image/gif':
        // GIF files start with GIF87a or GIF89a
        const gifHeader = buffer.slice(0, 6).toString('ascii');
        if (!(gifHeader === 'GIF87a' || gifHeader === 'GIF89a')) {
          return { isValid: false, reason: 'Invalid GIF header' };
        }
        break;

      case 'image/webp':
        // WebP files have 'RIFF' at start and 'WEBP' at offset 8
        const riff = buffer.slice(0, 4).toString('ascii');
        const webp = buffer.slice(8, 12).toString('ascii');
        if (riff !== 'RIFF' || webp !== 'WEBP') {
          return { isValid: false, reason: 'Invalid WebP header' };
        }
        break;
    }

    return { isValid: true };
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(filename: string): string {
    // Remove path components
    const baseName = path.basename(filename);
    
    // Replace dangerous characters
    let sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Ensure it doesn't start with a dot (hidden file)
    if (sanitized.startsWith('.')) {
      sanitized = 'file_' + sanitized;
    }

    // Add timestamp to prevent conflicts
    const timestamp = Date.now();
    const ext = path.extname(sanitized);
    const nameWithoutExt = path.basename(sanitized, ext);
    
    return `${nameWithoutExt}_${timestamp}${ext}`;
  }

  /**
   * Get max file size based on type
   */
  private getMaxSizeForFile(mimetype: string): number {
    if (mimetype.startsWith('image/')) {
      return this.MAX_FILE_SIZES.image;
    } else if (mimetype.startsWith('video/')) {
      return this.MAX_FILE_SIZES.video;
    } else if (mimetype.includes('pdf') || mimetype.includes('document') || mimetype.includes('text')) {
      return this.MAX_FILE_SIZES.document;
    }
    
    return this.MAX_FILE_SIZES.default;
  }

  /**
   * Get allowed types for specific upload context
   */
  getAllowedTypes(context: 'image' | 'document' | 'video' | 'all'): string[] {
    switch (context) {
      case 'image':
        return [...this.ALLOWED_IMAGE_TYPES];
      case 'document':
        return [...this.ALLOWED_DOCUMENT_TYPES];
      case 'video':
        return [...this.ALLOWED_VIDEO_TYPES];
      case 'all':
      default:
        return [
          ...this.ALLOWED_IMAGE_TYPES,
          ...this.ALLOWED_DOCUMENT_TYPES,
          ...this.ALLOWED_VIDEO_TYPES
        ];
    }
  }
}
