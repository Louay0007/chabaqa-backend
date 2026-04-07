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

  /**
   * Public endpoint — no auth guards.
   * Validates the HMAC-signed token, adds the email to the community suppression
   * list, and returns a plain confirmation page.
   */
  @Get('unsubscribe')
  @HttpCode(HttpStatus.OK)
  async trackUnsubscribe(@Query('t') token: string | undefined, @Res() res: Response): Promise<void> {
    const success = await this.emailCampaignService.recordUnsubscribeByToken(token);
    this.setNoCacheHeaders(res);
    res.type('text/html').status(HttpStatus.OK).send(this.buildUnsubscribePage(success));
  }

  private setNoCacheHeaders(res: Response): void {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  private buildUnsubscribePage(success: boolean): string {
    const title = success ? 'You have been unsubscribed' : 'Invalid unsubscribe link';
    const message = success
      ? 'You have been successfully unsubscribed and will no longer receive emails from this community.'
      : 'This unsubscribe link is invalid or has expired. Please contact the sender directly if you wish to opt out.';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f5; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 8px; padding: 40px;
            max-width: 480px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size: 22px; color: #111; margin-bottom: 12px; }
    p  { font-size: 15px; color: #555; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}
