import { Controller, Get, HttpCode, HttpStatus, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { EmailCampaignService } from './email-campaign.service';

@Controller('email-campaigns/track')
export class EmailCampaignTrackingController {
  constructor(private readonly emailCampaignService: EmailCampaignService) {}

  @Get('open')
  @HttpCode(HttpStatus.OK)
  async trackOpen(@Query('t') token: string | undefined, @Res() res: Response): Promise<void> {
    await this.emailCampaignService.recordOpenByToken(token);
    this.setNoCacheHeaders(res);
    res.type('image/gif').status(HttpStatus.OK).send(this.emailCampaignService.getOpenTrackingPixel());
  }

  @Get('click')
  @HttpCode(HttpStatus.FOUND)
  async trackClick(@Query('t') token: string | undefined, @Res() res: Response): Promise<void> {
    const destinationUrl = await this.emailCampaignService.recordClickByToken(token);
    this.setNoCacheHeaders(res);
    res.redirect(HttpStatus.FOUND, destinationUrl);
  }

  private setNoCacheHeaders(res: Response): void {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
}
