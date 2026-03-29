import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private transportInitPromise: Promise<nodemailer.Transporter> | null = null;
  private useEthereal = false;
  private passwordNormalizationLogged = false;
  private readonly logger = new Logger(EmailService.name);

  private getEmailPassword(): string | undefined {
    const rawPassword =
      process.env.EMAIL_PASS ||
      process.env.EMAIL_PASSWORD ||
      process.env.SMTP_PASS ||
      process.env.EMAIL_APP_PASSWORD;
    const password = rawPassword?.trim();
    if (!password) return undefined;

    if (this.shouldStripPasswordSpaces(password)) {
      const normalized = password.replace(/\s+/g, '');
      if (normalized !== password && !this.passwordNormalizationLogged) {
        this.passwordNormalizationLogged = true;
        this.logger.warn(
          '⚠️ EMAIL_PASSWORD contient des espaces et a été normalisé (format App Password Gmail).',
        );
      }
      return normalized;
    }

    return password;
  }

  private getFromAddress(): string {
    return process.env.EMAIL_FROM || 'noreply@chabaqa.io';
  }

  private getFromHeader(): string {
    const fromAddress = this.getFromAddress();
    const fromName = process.env.EMAIL_FROM_NAME || 'Chabaqa';
    return `"${fromName}" <${fromAddress}>`;
  }

  private getReplyToAddress(): string {
    return process.env.EMAIL_REPLY_TO || this.getFromAddress();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildBrandedGenericEmailHtml(subject: string, htmlBody: string): string {
    const safeSubject = this.escapeHtml(subject);
    const logoUrl = process.env.EMAIL_LOGO_URL || 'https://i.ibb.co/bjbBK9yS/logo-chabaqa.png';
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${safeSubject}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:24px 24px 8px 24px;text-align:center;background:linear-gradient(135deg,#ffffff 0%,#f8fbff 100%);">
              <img src="${logoUrl}" alt="Chabaqa Logo" style="max-width:220px;width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px 24px;line-height:1.65;font-size:15px;">
              ${htmlBody}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;text-align:center;">
              © ${new Date().getFullYear()} Chabaqa
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  private generateChabaqaOtpTemplate(options: {
    otpCode: string;
    userName: string;
    heroTag: string;
    heroTitle: string;
    heroDescription: string;
    otpLabel: string;
    expiryMinutes: number;
    securityTitle: string;
    securityText: string;
    introText?: string;
  }): string {
    const code = String(options.otpCode || '').replace(/\D/g, '').slice(0, 6).padStart(6, '0');
    const digitColors = ['#8e78fb', '#a889fc', '#f65887', '#ff9b28', '#47c7ea', '#8e78fb'];
    const digitShadows = [
      'rgba(142,120,251,0.15)',
      'rgba(142,120,251,0.15)',
      'rgba(246,88,135,0.15)',
      'rgba(255,155,40,0.15)',
      'rgba(71,199,234,0.15)',
      'rgba(142,120,251,0.15)',
    ];
    const digitsHtml = code
      .split('')
      .map((digit, index) => {
        const spacer = index < code.length - 1 ? '<td width="8"></td>' : '';
        return `<td style="width:48px;height:56px;background:#ffffff;border:2px solid ${digitColors[index]};border-radius:12px;text-align:center;vertical-align:middle;font-size:24px;font-weight:900;color:#2d2d2d;font-family:'Poppins',Arial,sans-serif;box-shadow:0 4px 12px ${digitShadows[index]};">${this.escapeHtml(digit)}</td>${spacer}`;
      })
      .join('');
    const safeName = this.escapeHtml(options.userName || 'there');
    const safeHeroTag = this.escapeHtml(options.heroTag);
    const safeHeroTitle = this.escapeHtml(options.heroTitle).replace(/\n/g, '<br>');
    const safeHeroDescription = this.escapeHtml(options.heroDescription);
    const safeOtpLabel = this.escapeHtml(options.otpLabel);
    const safeSecurityTitle = this.escapeHtml(options.securityTitle);
    const safeSecurityText = this.escapeHtml(options.securityText);
    const safeExpiry = this.escapeHtml(String(options.expiryMinutes || 10));
    const safeIntroText = this.escapeHtml(
      options.introText ||
      "Thanks for signing up for Chabaqa! Before we start sending you product updates, tips, and resources, we just need to confirm it's really you with this verification code:",
    );

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chabaqa – Subscription Confirmation</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
  body { margin:0; padding:0; background:#f0f0f5; font-family:'Poppins',Arial,sans-serif; }
  .logo .c1 { color:#8e78fb; animation:bounce 1.2s ease infinite 0.0s; display:inline-block; }
  .logo .c2 { color:#47c7ea; animation:bounce 1.2s ease infinite 0.1s; display:inline-block; }
  .logo .c3 { color:#f65887; animation:bounce 1.2s ease infinite 0.2s; display:inline-block; }
  .logo .c4 { color:#ff9b28; animation:bounce 1.2s ease infinite 0.3s; display:inline-block; }
  .logo .c5 { color:#8e78fb; animation:bounce 1.2s ease infinite 0.4s; display:inline-block; }
  .logo .c6 { color:#47c7ea; animation:bounce 1.2s ease infinite 0.5s; display:inline-block; }
  .logo .c7 { color:#f65887; animation:bounce 1.2s ease infinite 0.6s; display:inline-block; }
  .logo .dot { color:#ff9b28; animation:bounce 1.2s ease infinite 0.7s; display:inline-block; }
  @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-7px)} }
  @media only screen and (max-width: 640px) {
    body { padding:16px 8px !important; }
    .mobile-stack { width:100% !important; max-width:100% !important; }
    .mobile-pad { padding:22px 16px !important; }
    .mobile-hero h1 { font-size:24px !important; }
    .mobile-otp td { width:40px !important; height:48px !important; font-size:20px !important; }
    .mobile-banner-pad { padding:22px 16px !important; }
    .mobile-stores .store-cell { display:block !important; width:100% !important; }
    .mobile-stores .store-gap { display:block !important; width:100% !important; height:10px !important; line-height:10px !important; font-size:0 !important; }
    .mobile-stores .store-btn { width:100% !important; }
    .mobile-stores .store-btn td { display:table-cell !important; width:auto !important; }
    .mobile-footer { padding:18px 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:40px 16px;background:#f0f0f5;font-family:'Poppins',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" class="mobile-stack" style="max-width:560px;width:100%;">
  <tr>
    <td style="background:#ffffff;border-radius:20px 20px 0 0;padding:28px 20px 20px;text-align:center;border-bottom:1px solid #f0f0f5;">
      <div class="logo" style="display:inline-block;font-size:26px;font-weight:900;letter-spacing:-1px;">
        <span class="c1">c</span><span class="c2">h</span><span class="c3">a</span><span class="c4">b</span><span class="c5">a</span><span class="c6">q</span><span class="c7">a</span><span class="dot">.</span>
      </div>
    </td>
  </tr>
  <tr>
    <td class="mobile-pad mobile-hero" style="background:#ffffff;padding:40px 36px;text-align:center;">
      <div style="display:inline-block;background:rgba(142,120,251,0.1);border:1px solid rgba(142,120,251,0.3);color:#8e78fb;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:6px 18px;border-radius:30px;margin-bottom:18px;">
        ✦ ${safeHeroTag}
      </div>
      <h1 style="font-size:30px;font-weight:900;color:#8e78fb;line-height:1.2;letter-spacing:-0.5px;margin:0 0 12px 0;">
        ${safeHeroTitle}
      </h1>
      <p style="font-size:14px;color:#666666;line-height:1.7;margin:0 auto;max-width:380px;">
        ${safeHeroDescription}
      </p>
    </td>
  </tr>
  <tr>
    <td class="mobile-pad" style="background:#ffffff;padding:36px 36px 28px;">
      <p style="font-size:15px;color:#444444;line-height:1.75;margin:0 0 28px 0;">
        Hey <strong style="color:#8e78fb;font-weight:700;">${safeName}</strong> 👋<br><br>
        ${safeIntroText}
      </p>
      <p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#8e78fb;margin:0 0 12px 0;">
        ${safeOtpLabel}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f5ff;border:2px solid #ede8ff;border-radius:16px;margin-bottom:14px;">
        <tr>
          <td style="padding:6px 0 0;background:linear-gradient(90deg,#8e78fb,#f65887,#ff9b28,#47c7ea);border-radius:14px 14px 0 0;height:4px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:24px 20px 16px;text-align:center;">
            <table cellpadding="0" cellspacing="0" border="0" class="mobile-otp" style="margin:0 auto 14px auto;">
              <tr>
                ${digitsHtml}
              </tr>
            </table>
            <p style="font-size:12px;color:#aaaaaa;margin:0;">🔒 Single use only &middot; Do not share</p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 0 auto;">
              <tr>
                <td align="center">
                  <a
                    href="#"
                    style="display:inline-block;background:#8e78fb;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:700;font-family:'Poppins',Arial,sans-serif;"
                    aria-label="Copy OTP code ${code}"
                  >
                    Copy OTP: ${code}
                  </a>
                </td>
              </tr>
            </table>
            <p style="font-size:11px;color:#9ca3af;margin:8px 0 0 0;">Tap and hold on the button text to copy the code quickly.</p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8f0;border:1px solid #ffe0b2;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#e07000;font-family:'Poppins',Arial,sans-serif;">
            ⏱ This code expires in <strong style="color:#ff9b28;">${safeExpiry} minutes</strong>. Use it before it's gone!
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
        <tr><td style="height:1px;background:#eeeeee;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5f8;border:1px solid #ffd6e3;border-radius:12px;margin-bottom:4px;">
        <tr>
          <td style="padding:16px;font-size:22px;vertical-align:top;width:36px;">🚨</td>
          <td style="padding:16px 16px 16px 0;font-size:13px;color:#c0446a;line-height:1.6;font-family:'Poppins',Arial,sans-serif;">
            <strong style="color:#f65887;">${safeSecurityTitle}</strong> ${safeSecurityText}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(120deg,#7c5cf7 0%,#8e78fb 40%,#6a9ef5 100%);border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(142,120,251,0.35);">
        <tr>
          <td class="mobile-banner-pad" style="padding:32px 28px;position:relative;">
            <h2 style="font-size:22px;font-weight:900;color:#ffffff;margin:0 0 8px 0;letter-spacing:-0.3px;font-family:'Poppins',Arial,sans-serif;">Get Chabaqa APP</h2>
            <p style="font-size:12px;color:rgba(255,255,255,0.85);line-height:1.6;margin:0 0 20px 0;font-family:'Poppins',Arial,sans-serif;">
              Grow your audience, launch paid courses, host live sessions &amp; monetize effortlessly on your phone.
            </p>
            <table cellpadding="0" cellspacing="0" border="0" class="mobile-stores">
              <tr>
                <td class="store-cell" align="center">
                  <a href="https://expo.dev/accounts/mariembenali/projects/mobile/builds/f85b1b45-f20f-47c7-bb5b-78f3f36ce556" target="_blank" style="text-decoration:none;">
                    <table cellpadding="0" cellspacing="0" border="0" class="store-btn" style="background:#ffffff;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                      <tr>
                        <td style="padding:8px 6px 8px 12px;font-size:18px;">🍎</td>
                        <td style="padding:8px 14px 8px 6px;">
                          <div style="font-size:9px;color:#888888;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins',Arial,sans-serif;">Get it on</div>
                          <div style="font-size:13px;font-weight:700;color:#1a1a2e;font-family:'Poppins',Arial,sans-serif;">App Store</div>
                        </td>
                      </tr>
                    </table>
                  </a>
                </td>
                <td class="store-gap" width="10"></td>
                <td class="store-cell" align="center">
                  <a href="https://expo.dev/accounts/mariembenali/projects/mobile/builds/f85b1b45-f20f-47c7-bb5b-78f3f36ce556" target="_blank" style="text-decoration:none;">
                    <table cellpadding="0" cellspacing="0" border="0" class="store-btn" style="background:#ffffff;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                      <tr>
                        <td style="padding:8px 6px 8px 12px;font-size:18px;">▶</td>
                        <td style="padding:8px 14px 8px 6px;">
                          <div style="font-size:9px;color:#888888;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins',Arial,sans-serif;">Get it on</div>
                          <div style="font-size:13px;font-weight:700;color:#1a1a2e;font-family:'Poppins',Arial,sans-serif;">Google Play</div>
                        </td>
                      </tr>
                    </table>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td class="mobile-footer" style="background:#ffffff;border-radius:0 0 20px 20px;padding:24px 36px;text-align:center;border-top:1px solid #f0f0f5;">
      <p style="font-size:12px;color:#aaaaaa;line-height:1.7;margin:0 0 6px 0;font-family:'Poppins',Arial,sans-serif;">
        You received this email because you created an account or <a href="#" style="color:#8e78fb;text-decoration:none;font-weight:600;">subscribed</a> to updates from Chabaqa.
      </p>
      <p style="font-size:12px;color:#aaaaaa;line-height:1.7;margin:0 0 10px 0;font-family:'Poppins',Arial,sans-serif;">
        To update your communication settings or to unsubscribe, use the links below.<br>
        <a href="#" style="color:#8e78fb;text-decoration:none;font-weight:600;">Manage Preferences</a> | <a href="#" style="color:#8e78fb;text-decoration:none;font-weight:600;">Unsubscribe</a>
      </p>
      <p style="font-size:11px;color:#cccccc;margin:0 0 16px 0;font-family:'Poppins',Arial,sans-serif;">© ${new Date().getFullYear()} Chabaqa. All rights reserved.</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#8e78fb,#f65887,#ff9b28,#47c7ea);border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>
    `;
  }

  private isSmtpConfigured(): boolean {
    const hasEndpoint = Boolean(process.env.EMAIL_HOST || process.env.EMAIL_SERVICE);
    return Boolean(hasEndpoint && process.env.EMAIL_USER && this.getEmailPassword());
  }

  private isEtherealFallbackAllowed(): boolean {
    const envValue = process.env.EMAIL_ALLOW_ETHEREAL_FALLBACK;
    if (envValue !== undefined) {
      return envValue.toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'production';
  }

  private isGmailTransportConfigured(): boolean {
    const host = String(process.env.EMAIL_HOST || '').toLowerCase();
    const service = String(process.env.EMAIL_SERVICE || '').toLowerCase();
    return host.includes('gmail') || service === 'gmail';
  }

  private shouldStripPasswordSpaces(password: string): boolean {
    if (!/\s/.test(password)) return false;
    if (String(process.env.EMAIL_PASSWORD_STRIP_SPACES || '').toLowerCase() === 'false') {
      return false;
    }
    return this.isGmailTransportConfigured();
  }

  private isAuthenticationError(error: any): boolean {
    const message = String(error?.message || '');
    return (
      error?.code === 'EAUTH' ||
      message.includes('Invalid login') ||
      message.includes('BadCredentials') ||
      message.includes('535-5.7.8')
    );
  }

  isAuthenticationFailureError(error: unknown): boolean {
    return this.isAuthenticationError(error);
  }

  private isTransportError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
      error?.code === 'ECONNECTION' ||
      error?.code === 'ETIMEDOUT' ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('closed')
    );
  }

  private shouldFallbackToEthereal(error: any): boolean {
    return this.isEtherealFallbackAllowed() && (this.isAuthenticationError(error) || this.isTransportError(error));
  }

  private buildSmtpTransportOptions(): nodemailer.TransportOptions {
    const port = Number(process.env.EMAIL_PORT || 587);
    const secure = String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || port === 465;
    const options: any = {
      port,
      secure,
      auth: {
        user: process.env.EMAIL_USER!,
        pass: this.getEmailPassword()!,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    };

    if (process.env.EMAIL_HOST) {
      (options as any).host = process.env.EMAIL_HOST;
    }

    if (process.env.EMAIL_SERVICE) {
      (options as any).service = process.env.EMAIL_SERVICE;
    }

    return options;
  }

  private logPreviewUrl(result: nodemailer.SentMessageInfo): void {
    const previewUrl = nodemailer.getTestMessageUrl(result);
    if (previewUrl) {
      this.logger.log(`🔗 Prévisualisation: ${previewUrl}`);
    }
  }

  private async createTransporter(): Promise<nodemailer.Transporter> {
    if (!this.isSmtpConfigured()) {
      if (!this.isEtherealFallbackAllowed()) {
        throw new Error(
          'SMTP non configuré. Définissez EMAIL_HOST ou EMAIL_SERVICE, EMAIL_USER et EMAIL_PASSWORD.',
        );
      }
      this.logger.log('📧 SMTP non configuré, utilisation de Ethereal Email');
      return this.createEtherealAccount();
    }

    const smtpTransporter = nodemailer.createTransport(this.buildSmtpTransportOptions());
    try {
      await smtpTransporter.verify();
      this.useEthereal = false;
      this.logger.log('✅ Email SMTP configuré avec succès');
      return smtpTransporter;
    } catch (error: any) {
      this.logger.error(`❌ SMTP indisponible: ${error.message}`);
      if (!this.isEtherealFallbackAllowed()) {
        if (this.isAuthenticationError(error)) {
          throw new Error(
            `Échec d'authentification SMTP. Vérifiez EMAIL_USER et EMAIL_PASSWORD (Gmail: App Password requis). Détail: ${error.message}`,
          );
        }
        throw error;
      }
      this.logger.warn('⚠️ Bascule vers Ethereal Email (fallback)');
    }

    return this.createEtherealAccount();
  }

  private async ensureTransporter(forceRefresh = false): Promise<nodemailer.Transporter> {
    if (forceRefresh) {
      this.transporter = null;
    }

    if (this.transporter && !forceRefresh) {
      return this.transporter;
    }

    if (this.transportInitPromise && !forceRefresh) {
      return this.transportInitPromise;
    }

    this.transportInitPromise = this.createTransporter()
      .then((transporter) => {
        this.transporter = transporter;
        return transporter;
      })
      .finally(() => {
        this.transportInitPromise = null;
      });

    return this.transportInitPromise;
  }

  private async sendWithAutoFallback(
    mailOptions: nodemailer.SendMailOptions,
    contextLabel: string,
  ): Promise<nodemailer.SentMessageInfo> {
    try {
      const transporter = await this.ensureTransporter();
      const result = await transporter.sendMail(mailOptions);
      this.logPreviewUrl(result);
      return result;
    } catch (error: any) {
      if (!this.shouldFallbackToEthereal(error)) {
        throw error;
      }

      this.logger.warn(
        `⚠️ Échec SMTP pendant ${contextLabel} (${error.message}). Nouvelle tentative avec Ethereal.`,
      );
      const fallbackTransporter = await this.ensureTransporter(true);
      const result = await fallbackTransporter.sendMail(mailOptions);
      this.logPreviewUrl(result);
      return result;
    }
  }

  constructor() {
    this.ensureTransporter().catch((error: any) => {
      this.logger.error(`❌ Échec d'initialisation du transporteur email: ${error.message}`);
      this.logger.warn(
        '⚠️ Le service email est indisponible pour l’instant. Vérifiez EMAIL_HOST, EMAIL_USER et EMAIL_PASSWORD.',
      );
    });
  }

  private async initializeTransporter(usePool: boolean = false): Promise<nodemailer.Transporter> {
    if (usePool) {
      this.logger.warn('⚠️ Pool mode is deprecated in this EmailService and will be ignored');
    }
    return this.createTransporter();
  }

  private async createTransporterForSend(): Promise<nodemailer.Transporter> {
    return this.ensureTransporter();
  }

  private async createEtherealAccount(): Promise<nodemailer.Transporter> {
    // Créer un compte Ethereal Email pour les tests
    const testAccount = await nodemailer.createTestAccount();
    
    this.logger.log('📧 Compte Ethereal Email créé:');
    this.logger.log(`   Email: ${testAccount.user}`);
    this.logger.log(`   Mot de passe: ${testAccount.pass}`);
    this.logger.log(`   Serveur: ${testAccount.smtp.host}:${testAccount.smtp.port}`);
    
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  /**
   * Envoie un email de réinitialisation de mot de passe
   */
  async sendPasswordResetEmail(
    email: string,
    code: string,
    userName: string,
    expiresInMinutes = 10,
  ): Promise<void> {
    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: email,
      subject: 'Réinitialisation de votre mot de passe - Chabaqa',
      html: this.generateChabaqaOtpTemplate({
        otpCode: code,
        userName,
        heroTag: 'Password Reset',
        heroTitle: 'Reset your password',
        heroDescription: 'Use the following code to confirm your password reset request.',
        otpLabel: 'Password reset code',
        expiryMinutes: expiresInMinutes,
        securityTitle: "Didn't request a reset?",
        securityText: 'You can safely ignore this email and your password will stay unchanged.',
      }),
    };

    try {
      this.logger.log(`📧 Tentative d'envoi d'email à: ${email}`);
      await this.sendWithAutoFallback(mailOptions, `l'envoi d'email à ${email}`);
      this.logger.log('✅ Email envoyé avec succès');
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de l\'envoi d\'email:', error.message);
      throw new Error(`Erreur lors de l'envoi de l'email: ${error.message}`);
    }
  }

  async sendRegistrationOtpEmail(
    email: string,
    code: string,
    userName: string,
    expiresInMinutes = 10,
  ): Promise<void> {
    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: email,
      subject: 'Vérification de votre email - Chabaqa',
      html: this.generateChabaqaOtpTemplate({
        otpCode: code,
        userName,
        heroTag: 'Subscription Confirmation',
        heroTitle: 'Welcome to\nChabaqa 🎉',
        heroDescription: "You're one step away from joining the community. Confirm your email to unlock everything.",
        otpLabel: 'Your one-time code',
        expiryMinutes: expiresInMinutes,
        securityTitle: "Didn't sign up?",
        securityText: "If you didn't create a Chabaqa account, you can safely ignore this email. Someone may have entered your email by mistake.",
      }),
    };

    try {
      this.logger.log(`📧 Tentative d'envoi d'email OTP d'inscription à: ${email}`);
      await this.sendWithAutoFallback(mailOptions, `l'envoi d'email OTP d'inscription à ${email}`);
      this.logger.log('✅ Email OTP d’inscription envoyé avec succès');
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de l\'envoi d\'email OTP d’inscription:', error.message);
      throw new Error(`Erreur lors de l'envoi de l'email OTP d'inscription: ${error.message}`);
    }
  }

  /**
   * Envoie un email avec code 2FA pour la connexion
   * Returns true if sent successfully, false otherwise (non-blocking)
   */
  async send2FACode(email: string, code: string, userName: string): Promise<boolean> {
    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: email,
      subject: 'Code de vérification pour votre connexion - Chabaqa',
      html: this.generateChabaqaOtpTemplate({
        otpCode: code,
        userName,
        heroTag: 'Login Verification',
        heroTitle: 'Verify your login',
        heroDescription: 'Use this one-time code to validate your login attempt.',
        otpLabel: 'Login verification code',
        expiryMinutes: 10,
        securityTitle: "Wasn't you?",
        securityText: 'If you did not try to sign in, ignore this email and secure your account password.',
        introText:
          'A new sign-in attempt was detected on your Chabaqa account. Enter the following code to continue securely.',
      }),
    };

    // Always log the code in non-production environments for testing
    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`🔐 2FA code (test): ${code} for ${email}`);
    }

    // Retry logic with exponential backoff
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`📧 Tentative ${attempt}/${maxRetries} d'envoi d'email 2FA à: ${email}`);
        await Promise.race([
          this.sendWithAutoFallback(mailOptions, `l'envoi d'email 2FA à ${email}`),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Email send timeout')), 10000),
          ),
        ]);

        this.logger.log('✅ Email 2FA envoyé avec succès');
        return true;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(`⚠️ Tentative ${attempt}/${maxRetries} échouée: ${error.message}`);

        if (this.isTransportError(error)) {
          this.transporter = null;
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        } else {
          break;
        }
      }
    }

    // If all retries failed, log but don't throw (non-blocking)
    this.logger.error(`❌ Échec d'envoi d'email 2FA après ${maxRetries} tentatives:`, lastError?.message);
    this.logger.warn(`⚠️ Le code 2FA ${code} a été généré mais l'email n'a pas pu être envoyé.`);
    this.logger.warn(`⚠️ En développement, le code est disponible dans les logs ci-dessus.`);
    
    return false;
  }

  /**
   * Send a community invitation email to an external contact.
   */
  async sendCommunityInvitationEmail(data: {
    to: string;
    name: string;
    communityName: string;
    creatorName: string;
    personalMessage: string;
    acceptUrl: string;
  }): Promise<void> {
    const safeName = this.escapeHtml(data.name || 'there');
    const safeCommunityName = this.escapeHtml(data.communityName);
    const safeCreatorName = this.escapeHtml(data.creatorName);
    const safeAcceptUrl = data.acceptUrl;

    let personalMessageBlock = '';
    if (data.personalMessage && data.personalMessage.trim()) {
      const safeMessage = this.escapeHtml(data.personalMessage);
      personalMessageBlock = `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
          <tr>
            <td style="padding:16px 20px;background:#f8f7ff;border-left:4px solid #8e78fb;border-radius:0 8px 8px 0;font-size:14px;color:#444;line-height:1.6;font-style:italic;">
              &ldquo;${safeMessage}&rdquo;
            </td>
          </tr>
        </table>
      `;
    }

    const htmlBody = `
      <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px 0;">
        Hey <strong style="color:#8e78fb;font-weight:700;">${safeName}</strong> 👋
      </p>
      <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 12px 0;">
        <strong>${safeCreatorName}</strong> has invited you to join
        <strong style="color:#8e78fb;">${safeCommunityName}</strong> on Chabaqa &mdash;
        a platform where creators build thriving learning communities.
      </p>
      ${personalMessageBlock}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
        <tr>
          <td align="center">
            <a href="${safeAcceptUrl}"
               style="display:inline-block;background:linear-gradient(135deg,#8e78fb 0%,#6a9ef5 100%);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:12px;font-size:16px;font-weight:700;font-family:'Poppins',Arial,sans-serif;box-shadow:0 4px 16px rgba(142,120,251,0.3);">
              Accept Invitation
            </a>
          </td>
        </tr>
      </table>
      <p style="font-size:13px;color:#888;line-height:1.6;margin:0 0 8px 0;">
        If the button doesn&#39;t work, copy and paste this link into your browser:
      </p>
      <p style="font-size:12px;color:#8e78fb;word-break:break-all;margin:0 0 20px 0;">
        <a href="${safeAcceptUrl}" style="color:#8e78fb;text-decoration:underline;">${safeAcceptUrl}</a>
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
        <tr><td style="height:1px;background:#eee;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
      <p style="font-size:12px;color:#aaa;line-height:1.6;margin:0;">
        You received this email because <strong>${safeCreatorName}</strong> invited you.
        If you believe this was sent in error, you can safely ignore it.
      </p>
    `;

    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: data.to,
      subject: `${data.creatorName} invited you to join ${data.communityName} on Chabaqa`,
      text: `${data.creatorName} invited you to join ${data.communityName} on Chabaqa. Accept here: ${data.acceptUrl}`,
      html: this.buildBrandedGenericEmailHtml(
        `You're invited to join ${data.communityName}`,
        htmlBody,
      ),
    };

    try {
      this.logger.log(`📧 Sending community invitation email to: ${data.to}`);
      await this.sendWithAutoFallback(mailOptions, `sending invitation email to ${data.to}`);
      this.logger.log('✅ Community invitation email sent successfully');
    } catch (error: any) {
      this.logger.error('❌ Failed to send community invitation email:', error.message);
      throw new Error(`Failed to send community invitation email: ${error.message}`);
    }
  }

  /**
   * Envoie un email générique (pour les notifications)
   */
  async sendGenericEmail(data: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    const rawHtmlBody = data.html || `<p style="margin:0;">${this.escapeHtml(data.text || '').replace(/\n/g, '<br/>')}</p>`;
    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: this.buildBrandedGenericEmailHtml(data.subject, rawHtmlBody),
    };

    try {
      this.logger.log(`📧 Tentative d'envoi d'email générique à: ${data.to}`);
      await this.sendWithAutoFallback(mailOptions, `l'envoi d'email générique à ${data.to}`);
      this.logger.log('✅ Email générique envoyé avec succès');
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de l\'envoi d\'email générique:', error.message);
      throw new Error(`Erreur lors de l'envoi de l'email générique: ${error.message}`);
    }
  }

  /**
   * Envoie un email de suspension de compte par un administrateur
   */
  async sendAccountSuspensionEmail(email: string, userName: string, reason: string, suspensionEndDate?: Date): Promise<void> {
    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: email,
      subject: 'Suspension de votre compte - Chabaqa',
      html: this.generateAccountSuspensionEmailTemplate(userName, reason, suspensionEndDate),
    };

    try {
      this.logger.log(`📧 Tentative d'envoi d'email de suspension à: ${email}`);
      await this.sendWithAutoFallback(mailOptions, `l'envoi d'email de suspension à ${email}`);
      this.logger.log('✅ Email de suspension envoyé avec succès');
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de l\'envoi d\'email de suspension:', error.message);
      throw new Error(`Erreur lors de l'envoi de l'email de suspension: ${error.message}`);
    }
  }

  /**
   * Envoie un email d'activation de compte par un administrateur
   */
  async sendAccountActivationEmail(email: string, userName: string, reason?: string): Promise<void> {
    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: email,
      subject: 'Réactivation de votre compte - Chabaqa',
      html: this.generateAccountActivationEmailTemplate(userName, reason),
    };

    try {
      this.logger.log(`📧 Tentative d'envoi d'email d'activation à: ${email}`);
      await this.sendWithAutoFallback(mailOptions, `l'envoi d'email d'activation à ${email}`);
      this.logger.log('✅ Email d\'activation envoyé avec succès');
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de l\'envoi d\'email d\'activation:', error.message);
      throw new Error(`Erreur lors de l'envoi de l'email d'activation: ${error.message}`);
    }
  }

  /**
   * Envoie un email de réinitialisation de mot de passe par un administrateur
   */
  async sendPasswordResetByAdminEmail(email: string, userName: string, temporaryPassword: string): Promise<void> {
    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: email,
      subject: 'Réinitialisation de mot de passe par un administrateur - Chabaqa',
      html: this.generatePasswordResetByAdminEmailTemplate(userName, temporaryPassword),
    };

    try {
      this.logger.log(`📧 Tentative d'envoi d'email de réinitialisation admin à: ${email}`);
      await this.sendWithAutoFallback(mailOptions, `l'envoi d'email de réinitialisation admin à ${email}`);
      this.logger.log('✅ Email de réinitialisation admin envoyé avec succès');
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de l\'envoi d\'email de réinitialisation admin:', error.message);
      throw new Error(`Erreur lors de l'envoi de l'email de réinitialisation admin: ${error.message}`);
    }
  }

  /**
   * Sends a branded event ticket email with an inline QR code after successful registration/payment.
   * Follows the Chabaqa OTP template design system: animated logo, Poppins font, gradient rainbow bars,
   * mobile-responsive layout, app download CTA, and branded footer.
   */
  async sendEventTicketEmail(data: {
    to: string;
    userName: string;
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    eventLocation?: string;
    eventType: string;
    ticketType: string;
    ticketName: string;
    verifyUrl: string;
    qrDataUrl: string;
  }): Promise<void> {
    const html = this.generateEventTicketTemplate(data);

    const base64Match = data.qrDataUrl.match(/^data:image\/png;base64,(.+)$/);
    const attachments = base64Match ? [{
      filename: 'ticket-qr.png',
      content: Buffer.from(base64Match[1], 'base64'),
      cid: 'ticket-qr',
    }] : [];

    const mailOptions = {
      from: this.getFromHeader(),
      replyTo: this.getReplyToAddress(),
      to: data.to,
      subject: `🎟️ Your Ticket: ${data.eventTitle}`,
      text: [
        `Hi ${data.userName}, your ticket for "${data.eventTitle}" is confirmed!`,
        '',
        `Date: ${data.eventDate}`,
        `Time: ${data.eventTime}`,
        data.eventLocation ? `Location: ${data.eventLocation}` : '',
        `Ticket: ${data.ticketName} (${data.eventType})`,
        '',
        `View your ticket: ${data.verifyUrl}`,
        '',
        `© ${new Date().getFullYear()} Chabaqa. All rights reserved.`,
      ].filter(Boolean).join('\n'),
      html,
      attachments,
    };

    try {
      this.logger.log(`🎟️ Sending event ticket email to: ${data.to}`);
      await this.sendWithAutoFallback(mailOptions, `event ticket email to ${data.to}`);
      this.logger.log('✅ Event ticket email sent successfully');
    } catch (error: any) {
      this.logger.error('❌ Failed to send event ticket email:', error.message);
    }
  }

  /**
   * Generates the full Chabaqa-branded event ticket email template.
   * Mirrors the OTP template design system for visual consistency.
   */
  private generateEventTicketTemplate(data: {
    userName: string;
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    eventLocation?: string;
    eventType: string;
    ticketType: string;
    ticketName: string;
    verifyUrl: string;
  }): string {
    const safeName = this.escapeHtml(data.userName || 'there');
    const safeTitle = this.escapeHtml(data.eventTitle);
    const safeDate = this.escapeHtml(data.eventDate);
    const safeTime = this.escapeHtml(data.eventTime);
    const safeLocation = data.eventLocation ? this.escapeHtml(data.eventLocation) : '';
    const safeTicket = this.escapeHtml(data.ticketName);
    const safeType = this.escapeHtml(data.eventType);
    const safeVerifyUrl = data.verifyUrl;
    const year = new Date().getFullYear();

    // Build event detail rows programmatically
    const detailRows: { icon: string; label: string; value: string; color?: string }[] = [
      { icon: '📅', label: 'Date', value: safeDate },
      { icon: '🕐', label: 'Time', value: safeTime },
    ];
    if (safeLocation) {
      detailRows.push({ icon: '📍', label: 'Location', value: safeLocation });
    }
    detailRows.push({ icon: '🏷️', label: 'Type', value: safeType });
    detailRows.push({ icon: '🎫', label: 'Ticket', value: safeTicket, color: '#8e78fb' });

    const detailRowsHtml = detailRows.map(row => {
      const valueStyle = row.color
        ? `font-size:14px;font-weight:700;color:${row.color};font-family:'Poppins',Arial,sans-serif;`
        : `font-size:14px;font-weight:600;color:#2d2d2d;font-family:'Poppins',Arial,sans-serif;`;
      return `
        <tr>
          <td style="padding:8px 0;font-size:16px;width:32px;vertical-align:middle;">${row.icon}</td>
          <td style="padding:8px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#999999;width:80px;vertical-align:middle;font-family:'Poppins',Arial,sans-serif;">${this.escapeHtml(row.label)}</td>
          <td style="padding:8px 0;${valueStyle}vertical-align:middle;">${row.value}</td>
        </tr>`;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Event Ticket – Chabaqa</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
  body { margin:0; padding:0; background:#f0f0f5; font-family:'Poppins',Arial,sans-serif; }
  .logo .c1 { color:#8e78fb; animation:bounce 1.2s ease infinite 0.0s; display:inline-block; }
  .logo .c2 { color:#47c7ea; animation:bounce 1.2s ease infinite 0.1s; display:inline-block; }
  .logo .c3 { color:#f65887; animation:bounce 1.2s ease infinite 0.2s; display:inline-block; }
  .logo .c4 { color:#ff9b28; animation:bounce 1.2s ease infinite 0.3s; display:inline-block; }
  .logo .c5 { color:#8e78fb; animation:bounce 1.2s ease infinite 0.4s; display:inline-block; }
  .logo .c6 { color:#47c7ea; animation:bounce 1.2s ease infinite 0.5s; display:inline-block; }
  .logo .c7 { color:#f65887; animation:bounce 1.2s ease infinite 0.6s; display:inline-block; }
  .logo .dot { color:#ff9b28; animation:bounce 1.2s ease infinite 0.7s; display:inline-block; }
  @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-7px)} }
  @media only screen and (max-width: 640px) {
    body { padding:16px 8px !important; }
    .mobile-stack { width:100% !important; max-width:100% !important; }
    .mobile-pad { padding:22px 16px !important; }
    .mobile-hero h1 { font-size:22px !important; }
    .mobile-qr img { width:180px !important; height:180px !important; }
    .mobile-banner-pad { padding:22px 16px !important; }
    .mobile-stores .store-cell { display:block !important; width:100% !important; }
    .mobile-stores .store-gap { display:block !important; width:100% !important; height:10px !important; line-height:10px !important; font-size:0 !important; }
    .mobile-stores .store-btn { width:100% !important; }
    .mobile-stores .store-btn td { display:table-cell !important; width:auto !important; }
    .mobile-footer { padding:18px 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:40px 16px;background:#f0f0f5;font-family:'Poppins',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" class="mobile-stack" style="max-width:560px;width:100%;">

  <!-- ===== ANIMATED LOGO HEADER ===== -->
  <tr>
    <td style="background:#ffffff;border-radius:20px 20px 0 0;padding:28px 20px 20px;text-align:center;border-bottom:1px solid #f0f0f5;">
      <div class="logo" style="display:inline-block;font-size:26px;font-weight:900;letter-spacing:-1px;">
        <span class="c1">c</span><span class="c2">h</span><span class="c3">a</span><span class="c4">b</span><span class="c5">a</span><span class="c6">q</span><span class="c7">a</span><span class="dot">.</span>
      </div>
    </td>
  </tr>

  <!-- ===== HERO SECTION ===== -->
  <tr>
    <td class="mobile-pad mobile-hero" style="background:#ffffff;padding:40px 36px 16px;text-align:center;">
      <div style="display:inline-block;background:rgba(142,120,251,0.1);border:1px solid rgba(142,120,251,0.3);color:#8e78fb;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:6px 18px;border-radius:30px;margin-bottom:18px;">
        ✦ EVENT TICKET CONFIRMED
      </div>
      <h1 style="font-size:26px;font-weight:900;color:#8e78fb;line-height:1.2;letter-spacing:-0.5px;margin:0 0 12px 0;">
        ${safeTitle}
      </h1>
      <p style="font-size:14px;color:#666666;line-height:1.7;margin:0 auto;max-width:380px;">
        You're all set! Here's your digital ticket with QR code for check-in.
      </p>
    </td>
  </tr>

  <!-- ===== GREETING + EVENT DETAILS ===== -->
  <tr>
    <td class="mobile-pad" style="background:#ffffff;padding:28px 36px 12px;">
      <p style="font-size:15px;color:#444444;line-height:1.75;margin:0 0 24px 0;">
        Hey <strong style="color:#8e78fb;font-weight:700;">${safeName}</strong> 👋<br><br>
        Your registration is confirmed! Keep this email safe — you'll need the QR code below for check-in at the event.
      </p>

      <!-- Event details card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f5ff;border:2px solid #ede8ff;border-radius:16px;margin-bottom:24px;">
        <tr>
          <td style="padding:6px 0 0;background:linear-gradient(90deg,#8e78fb,#f65887,#ff9b28,#47c7ea);border-radius:14px 14px 0 0;height:4px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRowsHtml}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ===== QR CODE SECTION ===== -->
  <tr>
    <td class="mobile-pad" style="background:#ffffff;padding:8px 36px 28px;text-align:center;">
      <p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#8e78fb;margin:0 0 16px 0;">
        YOUR CHECK-IN QR CODE
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f5ff;border:2px solid #ede8ff;border-radius:16px;margin-bottom:14px;">
        <tr>
          <td style="padding:24px;text-align:center;" class="mobile-qr">
            <img src="cid:ticket-qr" alt="Ticket QR Code" style="width:220px;height:220px;display:inline-block;border-radius:12px;" />
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 16px;text-align:center;">
            <p style="font-size:12px;color:#aaaaaa;margin:0;">🔒 Scan at entrance &middot; Unique to you</p>
          </td>
        </tr>
      </table>

      <!-- View Ticket Online CTA -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr>
          <td align="center">
            <a href="${safeVerifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#8e78fb 0%,#6c52f0 100%);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:14px;font-weight:700;font-family:'Poppins',Arial,sans-serif;box-shadow:0 8px 24px rgba(142,120,251,0.35);">
              🎟️&nbsp;&nbsp;View Ticket Online
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ===== IMPORTANT NOTE ===== -->
  <tr>
    <td class="mobile-pad" style="background:#ffffff;padding:0 36px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8f0;border:1px solid #ffe0b2;border-radius:10px;">
        <tr>
          <td style="padding:14px 16px;font-size:13px;color:#e07000;font-family:'Poppins',Arial,sans-serif;line-height:1.6;">
            💡 <strong style="color:#ff9b28;">Tip:</strong> Screenshot or save this QR code to your phone for quick access at the event. You can also access it anytime from your Chabaqa dashboard.
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ===== VERIFICATION BADGE ===== -->
  <tr>
    <td class="mobile-pad" style="background:#ffffff;padding:0 36px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
        <tr>
          <td style="padding:12px 16px;font-size:22px;vertical-align:middle;width:36px;">✅</td>
          <td style="padding:12px 16px 12px 0;font-size:13px;color:#166534;line-height:1.6;font-family:'Poppins',Arial,sans-serif;">
            <strong style="color:#15803d;">Verified Ticket</strong> — This is a cryptographically signed digital ticket issued and verified by Chabaqa.
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ===== APP DOWNLOAD BANNER ===== -->
  <tr>
    <td style="padding:0 16px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(120deg,#7c5cf7 0%,#8e78fb 40%,#6a9ef5 100%);border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(142,120,251,0.35);">
        <tr>
          <td class="mobile-banner-pad" style="padding:32px 28px;">
            <h2 style="font-size:22px;font-weight:900;color:#ffffff;margin:0 0 8px 0;letter-spacing:-0.3px;font-family:'Poppins',Arial,sans-serif;">Get Chabaqa APP</h2>
            <p style="font-size:12px;color:rgba(255,255,255,0.85);line-height:1.6;margin:0 0 20px 0;font-family:'Poppins',Arial,sans-serif;">
              Access your tickets, join events &amp; manage everything on the go.
            </p>
            <table cellpadding="0" cellspacing="0" border="0" class="mobile-stores">
              <tr>
                <td class="store-cell" align="center">
                  <a href="https://expo.dev/accounts/mariembenali/projects/mobile/builds/f85b1b45-f20f-47c7-bb5b-78f3f36ce556" target="_blank" style="text-decoration:none;">
                    <table cellpadding="0" cellspacing="0" border="0" class="store-btn" style="background:#ffffff;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                      <tr>
                        <td style="padding:8px 6px 8px 12px;font-size:18px;">🍎</td>
                        <td style="padding:8px 14px 8px 6px;">
                          <div style="font-size:9px;color:#888888;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins',Arial,sans-serif;">Get it on</div>
                          <div style="font-size:13px;font-weight:700;color:#1a1a2e;font-family:'Poppins',Arial,sans-serif;">App Store</div>
                        </td>
                      </tr>
                    </table>
                  </a>
                </td>
                <td class="store-gap" width="10"></td>
                <td class="store-cell" align="center">
                  <a href="https://expo.dev/accounts/mariembenali/projects/mobile/builds/f85b1b45-f20f-47c7-bb5b-78f3f36ce556" target="_blank" style="text-decoration:none;">
                    <table cellpadding="0" cellspacing="0" border="0" class="store-btn" style="background:#ffffff;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                      <tr>
                        <td style="padding:8px 6px 8px 12px;font-size:18px;">▶</td>
                        <td style="padding:8px 14px 8px 6px;">
                          <div style="font-size:9px;color:#888888;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins',Arial,sans-serif;">Get it on</div>
                          <div style="font-size:13px;font-weight:700;color:#1a1a2e;font-family:'Poppins',Arial,sans-serif;">Google Play</div>
                        </td>
                      </tr>
                    </table>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ===== FOOTER ===== -->
  <tr>
    <td class="mobile-footer" style="background:#ffffff;border-radius:0 0 20px 20px;padding:24px 36px;text-align:center;border-top:1px solid #f0f0f5;">
      <p style="font-size:12px;color:#aaaaaa;line-height:1.7;margin:0 0 6px 0;font-family:'Poppins',Arial,sans-serif;">
        You received this email because you purchased a ticket on <a href="https://chabaqa.io" style="color:#8e78fb;text-decoration:none;font-weight:600;">Chabaqa</a>.
      </p>
      <p style="font-size:12px;color:#aaaaaa;line-height:1.7;margin:0 0 10px 0;font-family:'Poppins',Arial,sans-serif;">
        <a href="#" style="color:#8e78fb;text-decoration:none;font-weight:600;">Manage Preferences</a> | <a href="#" style="color:#8e78fb;text-decoration:none;font-weight:600;">Unsubscribe</a>
      </p>
      <p style="font-size:11px;color:#cccccc;margin:0 0 16px 0;font-family:'Poppins',Arial,sans-serif;">&copy; ${year} Chabaqa. All rights reserved.</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#8e78fb,#f65887,#ff9b28,#47c7ea);border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>
    `;
  }

  /**
   * Génère le template HTML pour l'email de réinitialisation
   */
  private generatePasswordResetEmailTemplate(code: string, userName: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="ie=edge">
      <title>Réinitialisation de mot de passe - Chabaqa</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #2d3748;
        margin: 0;
        padding: 0;
        background-image: url('https://i.ibb.co/8gKy70WB/gradient-background.png');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        min-height: 100vh;
        }
        .container {
        max-width: 600px;
        margin: 40px auto;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 4px 6px rgba(142, 120, 251, 0.1);
        border-radius: 16px;
        overflow: hidden;
        backdrop-filter: blur(10px);
        }
        .header {
        background: transparent;
        color: white;
        padding: 40px 20px;
        text-align: center;
        position: relative;
        }
        .header::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, #8e78fb, #86e4fd);
        }
        .logo {
        width: 280px;
        height: auto;
        margin-bottom: 30px;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
        }
        .content {
        background-color: rgba(255, 255, 255, 0.95);
        padding: 40px 30px;
        border-radius: 0 0 16px 16px;
        }
        .greeting {
        font-size: 24px;
        font-weight: 600;
        color: #2d3748;
        margin-bottom: 16px;
        }
        .code-container {
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #8e78fb;
        border-radius: 12px;
        padding: 30px;
        text-align: center;
        margin: 30px 0;
        box-shadow: 0 2px 4px rgba(142, 120, 251, 0.1);
        }
        .code {
        font-family: 'Courier New', monospace;
        font-size: 36px;
        font-weight: bold;
        color: #8e78fb;
        letter-spacing: 8px;
        margin: 0;
        text-shadow: 1px 1px 1px rgba(142, 120, 251, 0.2);
        }
        .warning {
        background: rgba(255, 249, 230, 0.95);
        border: 1px solid #ffeaa7;
        border-radius: 12px;
        padding: 20px;
        margin: 30px 0;
        }
        .warning-title {
        display: flex;
        align-items: center;
        font-weight: 600;
        color: #b7791f;
        margin-bottom: 10px;
        }
        .warning-icon {
        font-size: 20px;
        margin-right: 8px;
        }
        .warning ul {
        margin: 0;
        padding-left: 20px;
        color: #744210;
        }
        .warning li {
        margin: 8px 0;
        }
        .footer {
        text-align: center;
        margin-top: 30px;
        color: #718096;
        font-size: 14px;
        background: rgba(255, 255, 255, 0.95);
        padding: 20px;
        border-radius: 0 0 16px 16px;
        }
      </style>
      </head>
      <body>
      <div class="container">
        <div class="header">
          <img src="https://i.ibb.co/bjbBK9yS/logo-chabaqa.png" alt="Chabaqa Logo" class="logo">
          <h1 style="color:#8e78fb; font-size:32px; font-weight:800; margin-bottom:0;">Réinitialisation de mot de passe</h1>
        </div>
        <div class="content">
          <div class="greeting" style="color:#8e78fb; font-size:28px; font-weight:700;">Bonjour ${userName},</div>
          <p style="color:#2d3748; font-size:18px;">Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <span style="color:#8e78fb; font-weight:600;">Chabaqa</span>.</p>
          <p style="color:#2d3748; font-size:18px; font-weight:500;">Voici votre code de vérification :</p>
          <div class="code-container">
            <div class="code" style="color:#8e78fb; font-size:40px; font-weight:900; background:rgba(255,255,255,0.98); border:2px solid #8e78fb; border-radius:12px; padding:32px;">${code}</div>
          </div>
          <div class="warning" style="background:rgba(255,249,230,0.98); border:1px solid #ffeaa7; border-radius:12px; padding:24px; margin:32px 0;">
            <div class="warning-title" style="color:#b7791f; font-size:20px; font-weight:700; margin-bottom:12px;">
              <span class="warning-icon" style="font-size:22px; margin-right:10px;">⚠️</span>
              Important
            </div>
            <ul style="color:#744210; font-size:16px;">
              <li>Ce code <span style="color:#8e78fb; font-weight:600;">expire dans 10 minutes</span></li>
              <li>Ne partagez <span style="color:#e53e3e; font-weight:600;">jamais</span> ce code avec qui que ce soit</li>
              <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
            </ul>
          </div>
          <p style="color:#2d3748; font-size:16px;">Utilisez ce code pour réinitialiser votre mot de passe dans l'application.</p>
          <p style="color:#8e78fb; font-size:18px; font-weight:600;">Cordialement,<br>L'équipe Chabaqa</p>
        </div>
        <div class="footer" style="background:rgba(255,255,255,0.98); color:#8e78fb; font-size:15px; padding:22px; border-radius:0 0 16px 16px;">
          <p style="margin-bottom:8px;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          <p style="font-size:14px; color:#2d3748;">© ${new Date().getFullYear()} <span style="color:#8e78fb; font-weight:600;">Chabaqa</span>. Tous droits réservés.</p>
      </div>
    </div>
  </body>
</html>
    `;
  }

  /**
   * Génère le template HTML pour l'email 2FA
   */
  private generate2FAEmailTemplate(code: string, userName: string): string {

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="ie=edge">
      <title>Vérification de connexion - Chabaqa</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #2d3748;
        margin: 0;
        padding: 0;
        background-image: url('https://i.ibb.co/8gKy70WB/gradient-background.png');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        min-height: 100vh;
        }
        .container {
        max-width: 600px;
        margin: 40px auto;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 4px 6px rgba(142, 120, 251, 0.1);
        border-radius: 16px;
        overflow: hidden;
        backdrop-filter: blur(10px);
        }
        .header {
        background: transparent;
        color: white;
        padding: 40px 20px;
        text-align: center;
        position: relative;
        }
        .header::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, #8e78fb, #86e4fd);
        }
        .logo {
        width: 280px;
        height: auto;
        margin-bottom: 30px;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
        }
        .content {
        background-color: rgba(255, 255, 255, 0.95);
        padding: 40px 30px;
        border-radius: 0 0 16px 16px;
        }
        .greeting {
        font-size: 24px;
        font-weight: 600;
        color: #2d3748;
        margin-bottom: 16px;
        }
        .code-container {
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #8e78fb;
        border-radius: 12px;
        padding: 30px;
        text-align: center;
        margin: 30px 0;
        box-shadow: 0 2px 4px rgba(142, 120, 251, 0.1);
        }
        .code {
        font-family: 'Courier New', monospace;
        font-size: 36px;
        font-weight: bold;
        color: #8e78fb;
        letter-spacing: 8px;
        margin: 0;
        text-shadow: 1px 1px 1px rgba(142, 120, 251, 0.2);
        }
        .warning {
        background: rgba(255, 249, 230, 0.95);
        border: 1px solid #ffeaa7;
        border-radius: 12px;
        padding: 20px;
        margin: 30px 0;
        }
        .warning-title {
        display: flex;
        align-items: center;
        font-weight: 600;
        color: #b7791f;
        margin-bottom: 10px;
        }
        .warning-icon {
        font-size: 20px;
        margin-right: 8px;
        }
        .warning ul {
        margin: 0;
        padding-left: 20px;
        color: #744210;
        }
        .warning li {
        margin: 8px 0;
        }
        .footer {
        text-align: center;
        margin-top: 30px;
        color: #718096;
        font-size: 14px;
        background: rgba(255, 255, 255, 0.95);
        padding: 20px;
        border-radius: 0 0 16px 16px;
        }
      </style>
      </head>
      <body>
      <div class="container">
        <div class="header">
          <img src="https://i.ibb.co/bjbBK9yS/logo-chabaqa.png" alt="Chabaqa Logo" class="logo">
          <h1 style="color:#8e78fb; font-size:32px; font-weight:800; margin-bottom:0;">Vérification de Connexion</h1>
        </div>
        <div class="content">
          <div class="greeting" style="color:#8e78fb; font-size:28px; font-weight:700;">Bonjour ${userName},</div>
          <p style="color:#2d3748; font-size:18px;">Une nouvelle tentative de connexion a été détectée pour votre compte <span style="color:#8e78fb; font-weight:600;">Chabaqa</span>. Pour assurer la sécurité de votre compte, nous avons besoin de vérifier votre identité.</p>
          <p style="color:#2d3748; font-size:18px; font-weight:500;">Voici votre code de vérification :</p>
          <div class="code-container">
            <div class="code" style="color:#8e78fb; font-size:40px; font-weight:900; background:rgba(255,255,255,0.98); border:2px solid #8e78fb; border-radius:12px; padding:32px;">${code}</div>
          </div>
          <div class="warning" style="background:rgba(255,249,230,0.98); border:1px solid #ffeaa7; border-radius:12px; padding:24px; margin:32px 0;">
            <div class="warning-title" style="color:#b7791f; font-size:20px; font-weight:700; margin-bottom:12px;">
              <span class="warning-icon" style="font-size:22px; margin-right:10px;">⚠️</span>
              Important
            </div>
            <ul style="color:#744210; font-size:16px;">
              <li>Ce code <span style="color:#8e78fb; font-weight:600;">expire dans 10 minutes</span></li>
              <li>Ne partagez <span style="color:#e53e3e; font-weight:600;">jamais</span> ce code avec qui que ce soit</li>
              <li>Si vous n'avez pas tenté de vous connecter, ignorez cet email</li>
            </ul>
          </div>
          <p style="color:#2d3748; font-size:16px;">Si vous avez des questions ou besoin d'aide, n'hésitez pas à contacter notre support.</p>
          <p style="color:#8e78fb; font-size:18px; font-weight:600;">Cordialement,<br>L'équipe Chabaqa</p>
        </div>
        <div class="footer" style="background:rgba(255,255,255,0.98); color:#8e78fb; font-size:15px; padding:22px; border-radius:0 0 16px 16px;">
          <p style="margin-bottom:8px;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          <p style="font-size:14px; color:#2d3748;">© ${new Date().getFullYear()} <span style="color:#8e78fb; font-weight:600;">Chabaqa</span>. Tous droits réservés.</p>
      </div>
    </div>
  </body>
</html>
    `;
  }

  /**
   * Génère le template HTML pour l'email de suspension de compte
   */
  private generateAccountSuspensionEmailTemplate(userName: string, reason: string, suspensionEndDate?: Date): string {
    const endDateText = suspensionEndDate 
      ? `Cette suspension prendra fin le ${suspensionEndDate.toLocaleDateString('fr-FR', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}.`
      : 'Cette suspension est indéfinie.';

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Suspension de compte - Chabaqa</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8e78fb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Suspension de votre compte Chabaqa</h1>
          </div>
          <div class="content">
            <p>Bonjour ${userName},</p>
            <p>Nous vous informons que votre compte Chabaqa a été temporairement suspendu.</p>
            <div class="warning">
              <strong>Raison de la suspension :</strong><br>
              ${reason}
            </div>
            <p>${endDateText}</p>
            <p>Si vous pensez que cette suspension est une erreur ou si vous souhaitez faire appel de cette décision, veuillez contacter notre équipe de support.</p>
            <p>Cordialement,<br>L'équipe Chabaqa</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Génère le template HTML pour l'email d'activation de compte
   */
  private generateAccountActivationEmailTemplate(userName: string, reason?: string): string {
    const reasonText = reason ? `<p><strong>Raison :</strong> ${reason}</p>` : '';

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Réactivation de compte - Chabaqa</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Réactivation de votre compte Chabaqa</h1>
          </div>
          <div class="content">
            <p>Bonjour ${userName},</p>
            <div class="success">
              <strong>Bonne nouvelle !</strong> Votre compte Chabaqa a été réactivé avec succès.
            </div>
            ${reasonText}
            <p>Vous pouvez maintenant vous connecter normalement à votre compte et utiliser tous les services de la plateforme.</p>
            <p>Merci de votre patience et bienvenue de retour sur Chabaqa !</p>
            <p>Cordialement,<br>L'équipe Chabaqa</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Génère le template HTML pour l'email de réinitialisation de mot de passe par admin
   */
  private generatePasswordResetByAdminEmailTemplate(userName: string, temporaryPassword: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Réinitialisation de mot de passe - Chabaqa</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8e78fb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .password-box { background: white; border: 2px solid #8e78fb; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
          .password { font-family: monospace; font-size: 24px; font-weight: bold; color: #8e78fb; letter-spacing: 2px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Réinitialisation de mot de passe</h1>
          </div>
          <div class="content">
            <p>Bonjour ${userName},</p>
            <p>Un administrateur a réinitialisé votre mot de passe Chabaqa. Voici votre nouveau mot de passe temporaire :</p>
            <div class="password-box">
              <div class="password">${temporaryPassword}</div>
            </div>
            <div class="warning">
              <strong>Important :</strong>
              <ul>
                <li>Ce mot de passe est temporaire</li>
                <li>Nous vous recommandons fortement de le changer dès votre prochaine connexion</li>
                <li>Ne partagez jamais ce mot de passe avec qui que ce soit</li>
              </ul>
            </div>
            <p>Pour changer votre mot de passe, connectez-vous à votre compte et accédez aux paramètres de sécurité.</p>
            <p>Cordialement,<br>L'équipe Chabaqa</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
