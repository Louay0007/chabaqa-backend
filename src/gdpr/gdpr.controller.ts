import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GdprService } from './gdpr.service';
import { RecordConsentDto } from './dto/gdpr.dto';

@ApiTags('GDPR / Privacy')
@Controller('user/me/consents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  private resolveUserId(req: any): string {
    return req.user?.sub || req.user?._id || req.user?.id;
  }

  @Get()
  @ApiOperation({ summary: 'Get all consent records for the current user' })
  async getConsents(@Request() req: any) {
    const userId = this.resolveUserId(req);
    const data = await this.gdprService.getUserConsents(userId);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Record or update a consent choice' })
  async recordConsent(@Request() req: any, @Body() dto: RecordConsentDto) {
    const userId = this.resolveUserId(req);
    const data = await this.gdprService.recordConsent(
      userId,
      dto.consentType,
      dto.granted,
      req,
      dto.version,
    );
    return { success: true, data };
  }
}
