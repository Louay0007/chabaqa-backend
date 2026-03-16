import {
  Controller, Get, Param, Req, Res, Logger, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AffiliateAttributionService } from './affiliate-attribution.service';

@ApiTags('Affiliate – Redirect')
@Controller('affiliate/redirect')
export class AffiliateRedirectController {
  private readonly logger = new Logger(AffiliateRedirectController.name);

  constructor(private readonly attributionService: AffiliateAttributionService) {}

  @Get(':code')
  @ApiOperation({ summary: 'Public redirect for affiliate links (/r/:code via Nginx rewrite)' })
  async redirect(
    @Param('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code || code.length > 20) {
      throw new BadRequestException('Invalid affiliate code');
    }

    const result = await this.attributionService.recordClick(code, {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      referrer: (req.headers['referer'] || req.headers['referrer']) as string | undefined,
      utmSource: req.query?.utm_source as string,
      utmMedium: req.query?.utm_medium as string,
      utmCampaign: req.query?.utm_campaign as string,
      viewerUserId: (req as any).user?._id?.toString(),
    });

    if (!result) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://chabaqa.io';
      return res.redirect(302, frontendUrl);
    }

    const { click, link, program } = result;

    // Security: only allow relative paths starting with /
    let targetPath = link.targetPath;
    if (!targetPath.startsWith('/')) {
      targetPath = '/';
    }
    // Prevent protocol-relative URLs (//evil.com)
    if (targetPath.startsWith('//')) {
      targetPath = '/';
    }

    const cookie = this.attributionService.getCookieConfig(program.cookieWindowDays);
    res.cookie(cookie.name, click.clickId, cookie.options);

    const frontendUrl = (process.env.FRONTEND_URL || 'https://chabaqa.io').replace(/\/+$/, '');
    const redirectUrl = `${frontendUrl}${targetPath}`;

    return res.redirect(302, redirectUrl);
  }
}
