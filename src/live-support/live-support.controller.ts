import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LiveSupportService, LiveSupportView } from './live-support.service';
import { AdminAuthGuard } from '../admin/common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../admin/common/guards/admin-roles.guard';

@ApiTags('Live Support')
@Controller('live-support')
export class LiveSupportController {
  constructor(private readonly liveSupportService: LiveSupportService) {}

  private getRequestUserId(req: any): string {
    return (req?.user?._id || req?.user?.userId || req?.user?.sub || req?.user?.id || '').toString();
  }

  private getAdminActorId(req: any): string {
    return (req?.adminUser?._id || req?.user?._id || req?.user?.userId || req?.user?.sub || req?.user?.id || '').toString();
  }

  @Get('me/ticket')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user live support ticket' })
  async getMyTicket(@Request() req: any) {
    return this.liveSupportService.getMyOpenOrLatestTicket(this.getRequestUserId(req));
  }

  @Get('me/ticket/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user ticket messages' })
  async getMyMessages(
    @Request() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 40,
  ) {
    return this.liveSupportService.getTicketMessagesForUser(this.getRequestUserId(req), cursor, Number(limit));
  }

  @Post('me/message')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a live support message as user' })
  async sendMyMessage(@Request() req: any, @Body() body: { text: string }) {
    if (!body?.text || !String(body.text).trim()) {
      throw new BadRequestException('Text is required');
    }
    return this.liveSupportService.sendUserMessage(this.getRequestUserId(req), body.text);
  }

  @Post('me/request-admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Escalate ticket to admin' })
  async requestAdmin(@Request() req: any, @Body() body: { conversationId: string }) {
    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }
    return this.liveSupportService.requestAdmin(this.getRequestUserId(req), body.conversationId);
  }

  @Get('admin/tickets')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List admin live support tickets' })
  async listAdminTickets(
    @Request() req: any,
    @Query('view') view: LiveSupportView = 'available',
    @Query('search') search?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.liveSupportService.listAdminTickets(
      this.getAdminActorId(req),
      view,
      search,
      Number(page),
      Number(limit),
    );
  }

  @Get('admin/tickets/:id/messages')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ticket messages for admin' })
  async getAdminMessages(
    @Request() req: any,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 40,
  ) {
    return this.liveSupportService.getTicketMessagesForAdmin(
      this.getAdminActorId(req),
      id,
      cursor,
      Number(limit),
    );
  }

  @Post('admin/tickets/:id/claim')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Claim available ticket' })
  async claimTicket(@Request() req: any, @Param('id') id: string) {
    return this.liveSupportService.claimTicket(this.getAdminActorId(req), id);
  }

  @Post('admin/tickets/:id/message')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send message to assigned ticket' })
  async sendAdminMessage(@Request() req: any, @Param('id') id: string, @Body() body: { text: string }) {
    if (!body?.text || !String(body.text).trim()) {
      throw new BadRequestException('Text is required');
    }
    return this.liveSupportService.sendAdminMessage(this.getAdminActorId(req), id, body.text);
  }

  @Post('admin/tickets/:id/close')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Close assigned ticket' })
  async closeTicket(@Request() req: any, @Param('id') id: string) {
    return this.liveSupportService.closeTicket(this.getAdminActorId(req), id);
  }

  @Get('admin/queue-counts')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get queue counts for sidebar/header badges' })
  async getQueueCounts(@Request() req: any) {
    return this.liveSupportService.getQueueCounts(this.getAdminActorId(req));
  }
}
