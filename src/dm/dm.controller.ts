import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DmService } from './dm.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService, FileType } from '../upload/upload.service';
import { MediaPurpose } from '../media/media.types';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Direct Messages')
@Controller('dm')
export class DmController {
  constructor(private readonly dmService: DmService, private readonly uploadService: UploadService) {}
  private getRequestUserId(req: any): string {
    return (req?.user?._id || req?.user?.userId || req?.user?.sub || req?.user?.id || '').toString();
  }

  @Post('community/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Démarrer une conversation avec le créateur de la communauté' })
  async startCommunityConversation(@Body('communityId') communityId: string, @Request() req: any) {
    const conv = await this.dmService.startCommunityConversation(this.getRequestUserId(req), communityId);
    return { conversation: conv };
  }

  @Post('peer/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Démarrer une conversation avec un autre membre de la communauté' })
  async startPeerConversation(@Body() body: { communityId: string; targetUserId: string }, @Request() req: any) {
    const conv = await this.dmService.startPeerConversation(
      this.getRequestUserId(req),
      body.targetUserId,
      body.communityId
    );
    return { conversation: conv };
  }

  @Post('session/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Démarrer une conversation temporaire avec le mentor de session' })
  async startSessionConversation(@Body() body: { bookingId: string }, @Request() req: any) {
    const conv = await this.dmService.startSessionConversation(
      this.getRequestUserId(req),
      body.bookingId,
    );
    return { conversation: conv };
  }

  @Post('help/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Démarrer une conversation d'aide avec un admin" })
  async startHelpConversation(@Request() req: any) {
    const conv = await this.dmService.startHelpConversation(this.getRequestUserId(req));
    return { conversation: conv };
  }

  @Get('inbox')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les conversations' })
  async listInbox(@Query('type') type: 'community' | 'help' | 'peer' | 'session', @Query('page') page = 1, @Query('limit') limit = 20, @Request() req: any) {
    return this.dmService.listInbox(this.getRequestUserId(req), type, Number(page), Number(limit));
  }

  @Get(':conversationId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les messages d\'une conversation' })
  async listMessages(@Param('conversationId') conversationId: string, @Query('page') page = 1, @Query('limit') limit = 30, @Request() req: any) {
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin === true;
    const userId = (req.user?._id || req.user?.userId || req.user?.sub || req.user?.id || '').toString();
    return this.dmService.listMessages(conversationId, userId, Number(page), Number(limit), { isAdmin });
  }

  @Post(':conversationId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Envoyer un message' })
  @Throttle({ default: { ttl: 60, limit: 20 } } as any)
  async sendMessage(@Param('conversationId') conversationId: string, @Body() body: { text?: string; attachments?: { url: string; type: 'image' | 'file' | 'video'; size: number }[] }, @Request() req: any) {
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin === true;
    const message = await this.dmService.sendMessage(conversationId, this.getRequestUserId(req), body, { isAdmin });
    return { message };
  }

  @Post(':conversationId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Uploader une pièce jointe et l\'envoyer dans la conversation' })
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase();
        let folder = 'uploads/document';

        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)) {
          folder = 'uploads/image';
        } else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(extension)) {
          folder = 'uploads/video';
        } else if (['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'].includes(extension)) {
          folder = 'uploads/document';
        } else if (['.mp3', '.wav', '.ogg', '.aac', '.flac'].includes(extension)) {
          folder = 'uploads/audio';
        }

        cb(null, folder);
      },
      filename: (req, file, cb) => {
        const extension = extname(file.originalname);
        const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;
        cb(null, uniqueName);
      },
    }),
    limits: {
      fileSize: 500 * 1024 * 1024,
    },
  }))
  async uploadAttachment(
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    if (!file) {
      return { message: 'Aucun fichier' };
    }
    const processed = await this.uploadService.processUploadedFile(file, file.filename, {
      userId: req.user._id || req.user.userId,
      purpose: MediaPurpose.DM_ATTACHMENT,
      entityType: 'conversation',
      entityId: conversationId,
    });
    const attachmentType: 'image' | 'file' | 'video' =
      processed.type === FileType.IMAGE ? 'image' : processed.type === FileType.VIDEO ? 'video' : 'file';
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin === true;
    const message = await this.dmService.sendMessage(conversationId, this.getRequestUserId(req), {
      attachments: [{ url: processed.url, type: attachmentType, size: processed.size }]
    }, { isAdmin });
    return { message };
  }

  @Patch(':conversationId/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marquer comme lu' })
  async markRead(@Param('conversationId') conversationId: string, @Request() req: any) {
    return this.dmService.markRead(conversationId, this.getRequestUserId(req));
  }

  @Get('help/queue')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les fils d\'aide non assignés (admin)' })
  async helpQueue() {
    return this.dmService.listUnassignedHelpThreads();
  }

  @Patch('help/:conversationId/assign')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assigner un fil d\'aide (admin)' })
  async assignHelp(@Param('conversationId') conversationId: string, @Request() req: any) {
    // Assumes req.user has role 'admin' (role guard can be added later)
    return this.dmService.assignHelpThread(conversationId, this.getRequestUserId(req));
  }

  @Get(':conversationId/admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir les informations de l\'admin pour une conversation d\'aide' })
  async getHelpAdmin(@Param('conversationId') conversationId: string) {
    const admin = await this.dmService.getHelpConversationAdmin(conversationId);
    return { admin };
  }
}


