import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { PolicyModule } from '../common/modules/policy.module';
import { StorageUsage, StorageUsageSchema } from '../schema/storage-usage.schema';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StorageUsage.name, schema: StorageUsageSchema },
    ]),
    PolicyModule,
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          // Déterminer le type de fichier et le dossier de destination
          const extension = extname(file.originalname).toLowerCase();
          let folder = 'uploads';
          
          // Images
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)) {
            folder = 'uploads/image';
          }
          // Vidéos
          else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(extension)) {
            folder = 'uploads/video';
          }
          // Documents
          else if (['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'].includes(extension)) {
            folder = 'uploads/document';
          }
          // Audio
          else if (['.mp3', '.wav', '.ogg', '.aac', '.flac'].includes(extension)) {
            folder = 'uploads/audio';
          }
          
          cb(null, folder);
        },
        filename: (req, file, cb) => {
          // Générer un nom de fichier unique
          const extension = extname(file.originalname);
          const uuid = uuidv4();
          const timestamp = Date.now();
          const uniqueName = `${timestamp}-${uuid}${extension}`;
          cb(null, uniqueName);
        }
      }),
      fileFilter: (req, file, cb) => {
        // Validation basique des types de fichiers
        const allowedTypes = [
          // Images
          'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
          // Vidéos
          'video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/webm',
          // Documents
          'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain', 'application/rtf', 'application/vnd.oasis.opendocument.text',
          // Audio
          'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Type de fichier non supporté: ${file.mimetype}`), false);
        }
      },
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max (sera validé plus finement dans le service)
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService], // Exporter le service pour utilisation dans d'autres modules
})
export class UploadModule {}