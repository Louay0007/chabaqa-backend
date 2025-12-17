import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DmService } from './dm.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService, FileType } from '../upload/upload.service';

@ApiTags('Direct Messages')
@Controller('dm')
export class DmController {
  constructor(private readonly dmService: DmService, private readonly uploadService: UploadService) {}

  @Post('community/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Démarrer une conversation avec le créateur de la communauté' })
  async startCommunityConversation(@Body('communityId') communityId: string, @Request() req: any) {
    const conv = await this.dmService.startCommunityConversation(req.user._id || req.user.userId, communityId);
    return { conversation: conv };
  }

  @Post('help/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Démarrer une conversation d'aide avec un admin" })
  async startHelpConversation(@Request() req: any) {
    const conv = await this.dmService.startHelpConversation(req.user._id || req.user.userId);
    return { conversation: conv };
  }

  @Get('inbox')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les conversations' })
  async listInbox(@Query('type') type: 'community' | 'help', @Query('page') page = 1, @Query('limit') limit = 20, @Request() req: any) {
    return this.dmService.listInbox(req.user._id || req.user.userId, type, Number(page), Number(limit));
  }

  @Get(':conversationId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les messages d\'une conversation' })
  async listMessages(@Param('conversationId') conversationId: string, @Query('page') page = 1, @Query('limit') limit = 30, @Request() req: any) {
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin === true;
    return this.dmService.listMessages(conversationId, req.user._id || req.user.userId, Number(page), Number(limit), { isAdmin });
  }

  @Post(':conversationId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Envoyer un message' })
  @Throttle({ default: { ttl: 60, limit: 20 } } as any)
  async sendMessage(@Param('conversationId') conversationId: string, @Body() body: { text?: string; attachments?: { url: string; type: 'image' | 'file' | 'video'; size: number }[] }, @Request() req: any) {
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin === true;
    const message = await this.dmService.sendMessage(conversationId, req.user._id || req.user.userId, body, { isAdmin });
    return { message };
  }

  @Post(':conversationId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Uploader une pièce jointe et l\'envoyer dans la conversation' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    if (!file) {
      return { message: 'Aucun fichier' };
    }
    const uniqueName = this.uploadService.generateFilename(file.originalname);
    const processed = await this.uploadService.processUploadedFile(file, uniqueName, { userId: req.user._id || req.user.userId });
    const attachmentType: 'image' | 'file' | 'video' =
      processed.type === FileType.IMAGE ? 'image' : processed.type === FileType.VIDEO ? 'video' : 'file';
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin === true;
    const message = await this.dmService.sendMessage(conversationId, req.user._id || req.user.userId, {
      attachments: [{ url: processed.url, type: attachmentType, size: processed.size }]
    }, { isAdmin });
    return { message };
  }

  @Patch(':conversationId/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marquer comme lu' })
  async markRead(@Param('conversationId') conversationId: string, @Request() req: any) {
    return this.dmService.markRead(conversationId, req.user._id || req.user.userId);
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
    return this.dmService.assignHelpThread(conversationId, req.user._id || req.user.userId);
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


