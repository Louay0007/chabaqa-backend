import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schema/user.schema';
import { Session, SessionDocument } from '../schema/session.schema';
import * as nodemailer from 'nodemailer';

export interface SessionBookingEmailData {
  sessionTitle: string;
  sessionDescription?: string;
  creatorName: string;
  creatorEmail: string;
  participantName: string;
  participantEmail: string;
  scheduledAt: Date;
  duration: number;
  meetingUrl?: string;
  bookingId: string;
  sessionId: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
  ) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Configure based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production: Use SendGrid, AWS SES, or other service
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
    } else {
      // Development: Use Ethereal Email for testing
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: process.env.ETHEREAL_EMAIL || 'ethereal.user@ethereal.email',
          pass: process.env.ETHEREAL_PASSWORD || 'ethereal.pass',
        },
      });
    }
  }

  /**
   * Send session booking confirmation to participant
   */
  async sendBookingConfirmation(data: SessionBookingEmailData): Promise<void> {
    try {
      const emailHtml = this.generateBookingConfirmationHtml(data);
      const emailText = this.generateBookingConfirmationText(data);

      await this.transporter.sendMail({
        from: `"Chabaqa Sessions" <${process.env.FROM_EMAIL || 'noreply@chabaqa.com'}>`,
        to: data.participantEmail,
        subject: `Session Booking Confirmation - ${data.sessionTitle}`,
        text: emailText,
        html: emailHtml,
      });

      this.logger.log(`Booking confirmation sent to ${data.participantEmail} for session ${data.sessionId}`);
    } catch (error) {
      this.logger.error('Failed to send booking confirmation:', error);
      throw error;
    }
  }

  /**
   * Send session booking notification to creator
   */
  async sendBookingNotificationToCreator(data: SessionBookingEmailData): Promise<void> {
    try {
      const emailHtml = this.generateCreatorNotificationHtml(data);
      const emailText = this.generateCreatorNotificationText(data);

      await this.transporter.sendMail({
        from: `"Chabaqa Sessions" <${process.env.FROM_EMAIL || 'noreply@chabaqa.com'}>`,
        to: data.creatorEmail,
        subject: `New Session Booking - ${data.sessionTitle}`,
        text: emailText,
        html: emailHtml,
      });

      this.logger.log(`Booking notification sent to creator ${data.creatorEmail} for session ${data.sessionId}`);
    } catch (error) {
      this.logger.error('Failed to send creator notification:', error);
      throw error;
    }
  }

  /**
   * Send session reminder (24 hours before)
   */
  async sendSessionReminder(data: SessionBookingEmailData): Promise<void> {
    try {
      const emailHtml = this.generateReminderHtml(data);
      const emailText = this.generateReminderText(data);

      // Send to both participant and creator
      const recipients = [data.participantEmail, data.creatorEmail];

      for (const recipient of recipients) {
        await this.transporter.sendMail({
          from: `"Chabaqa Sessions" <${process.env.FROM_EMAIL || 'noreply@chabaqa.com'}>`,
          to: recipient,
          subject: `Session Reminder - ${data.sessionTitle} (Tomorrow)`,
          text: emailText,
          html: emailHtml,
        });
      }

      this.logger.log(`Session reminder sent for session ${data.sessionId}`);
    } catch (error) {
      this.logger.error('Failed to send session reminder:', error);
      throw error;
    }
  }

  /**
   * Send session cancellation notification
   */
  async sendCancellationNotification(data: SessionBookingEmailData, cancelledBy: 'creator' | 'participant', reason?: string): Promise<void> {
    try {
      const emailHtml = this.generateCancellationHtml(data, cancelledBy, reason);
      const emailText = this.generateCancellationText(data, cancelledBy, reason);

      // Send to the other party
      const recipient = cancelledBy === 'creator' ? data.participantEmail : data.creatorEmail;

      await this.transporter.sendMail({
        from: `"Chabaqa Sessions" <${process.env.FROM_EMAIL || 'noreply@chabaqa.com'}>`,
        to: recipient,
        subject: `Session Cancelled - ${data.sessionTitle}`,
        text: emailText,
        html: emailHtml,
      });

      this.logger.log(`Cancellation notification sent for session ${data.sessionId}`);
    } catch (error) {
      this.logger.error('Failed to send cancellation notification:', error);
      throw error;
    }
  }

  /**
   * Generate booking confirmation HTML for participant
   */
  private generateBookingConfirmationHtml(data: SessionBookingEmailData): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const scheduledTime = data.scheduledAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Session Booking Confirmation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .session-details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Session Booking Confirmed!</h1>
            </div>
            <div class="content">
              <p>Hi ${data.participantName},</p>
              <p>Great news! Your session booking has been confirmed. Here are the details:</p>
              
              <div class="session-details">
                <h3>📅 Session Details</h3>
                <p><strong>Session:</strong> ${data.sessionTitle}</p>
                <p><strong>Mentor:</strong> ${data.creatorName}</p>
                <p><strong>Date:</strong> ${scheduledDate}</p>
                <p><strong>Time:</strong> ${scheduledTime}</p>
                <p><strong>Duration:</strong> ${data.duration} minutes</p>
                ${data.sessionDescription ? `<p><strong>Description:</strong> ${data.sessionDescription}</p>` : ''}
              </div>

              ${data.meetingUrl ? `
                <div class="session-details">
                  <h3>🎥 Join Your Session</h3>
                  <p>When it's time for your session, click the link below to join:</p>
                  <a href="${data.meetingUrl}" class="button">Join Google Meet</a>
                  <p><small>Meeting Link: ${data.meetingUrl}</small></p>
                </div>
              ` : `
                <div class="session-details">
                  <h3>📞 Meeting Details</h3>
                  <p>Your mentor will provide the meeting link closer to the session time. You'll receive another email with the meeting details.</p>
                </div>
              `}

              <div class="session-details">
                <h3>📝 What's Next?</h3>
                <ul>
                  <li>Add this session to your calendar</li>
                  <li>Prepare any questions you'd like to discuss</li>
                  <li>You'll receive a reminder 24 hours before the session</li>
                  <li>Join the meeting 5 minutes early to test your connection</li>
                </ul>
              </div>

              <p>If you need to reschedule or cancel, please contact your mentor as soon as possible.</p>
              <p>We're excited for your upcoming session!</p>
            </div>
            <div class="footer">
              <p>Best regards,<br>The Chabaqa Team</p>
              <p><small>This is an automated message. Please do not reply to this email.</small></p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate booking confirmation text for participant
   */
  private generateBookingConfirmationText(data: SessionBookingEmailData): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString();
    const scheduledTime = data.scheduledAt.toLocaleTimeString();

    return `
Session Booking Confirmed!

Hi ${data.participantName},

Great news! Your session booking has been confirmed.

Session Details:
- Session: ${data.sessionTitle}
- Mentor: ${data.creatorName}
- Date: ${scheduledDate}
- Time: ${scheduledTime}
- Duration: ${data.duration} minutes
${data.sessionDescription ? `- Description: ${data.sessionDescription}` : ''}

${data.meetingUrl ? `
Meeting Link: ${data.meetingUrl}

When it's time for your session, use the link above to join the Google Meet.
` : `
Your mentor will provide the meeting link closer to the session time.
`}

What's Next:
- Add this session to your calendar
- Prepare any questions you'd like to discuss
- You'll receive a reminder 24 hours before the session
- Join the meeting 5 minutes early to test your connection

If you need to reschedule or cancel, please contact your mentor as soon as possible.

Best regards,
The Chabaqa Team
    `;
  }

  /**
   * Generate creator notification HTML
   */
  private generateCreatorNotificationHtml(data: SessionBookingEmailData): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const scheduledTime = data.scheduledAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>New Session Booking</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #059669; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .session-details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .button { display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💼 New Session Booking!</h1>
            </div>
            <div class="content">
              <p>Hi ${data.creatorName},</p>
              <p>You have a new session booking! Here are the details:</p>
              
              <div class="session-details">
                <h3>📅 Session Details</h3>
                <p><strong>Session:</strong> ${data.sessionTitle}</p>
                <p><strong>Participant:</strong> ${data.participantName}</p>
                <p><strong>Email:</strong> ${data.participantEmail}</p>
                <p><strong>Date:</strong> ${scheduledDate}</p>
                <p><strong>Time:</strong> ${scheduledTime}</p>
                <p><strong>Duration:</strong> ${data.duration} minutes</p>
              </div>

              ${data.meetingUrl ? `
                <div class="session-details">
                  <h3>🎥 Meeting Link</h3>
                  <p>A Google Meet link has been automatically created:</p>
                  <a href="${data.meetingUrl}" class="button">Join Google Meet</a>
                  <p><small>Meeting Link: ${data.meetingUrl}</small></p>
                </div>
              ` : ''}

              <div class="session-details">
                <h3>📝 Next Steps</h3>
                <ul>
                  <li>Review your calendar and prepare for the session</li>
                  <li>The participant will receive a confirmation email</li>
                  <li>Both of you will get a reminder 24 hours before</li>
                  <li>You can manage this booking in your creator dashboard</li>
                </ul>
              </div>

              <p>Thank you for providing valuable mentoring sessions!</p>
            </div>
            <div class="footer">
              <p>Best regards,<br>The Chabaqa Team</p>
              <p><small>This is an automated message. Please do not reply to this email.</small></p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate creator notification text
   */
  private generateCreatorNotificationText(data: SessionBookingEmailData): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString();
    const scheduledTime = data.scheduledAt.toLocaleTimeString();

    return `
New Session Booking!

Hi ${data.creatorName},

You have a new session booking!

Session Details:
- Session: ${data.sessionTitle}
- Participant: ${data.participantName}
- Email: ${data.participantEmail}
- Date: ${scheduledDate}
- Time: ${scheduledTime}
- Duration: ${data.duration} minutes

${data.meetingUrl ? `
Meeting Link: ${data.meetingUrl}
` : ''}

Next Steps:
- Review your calendar and prepare for the session
- The participant will receive a confirmation email
- Both of you will get a reminder 24 hours before
- You can manage this booking in your creator dashboard

Thank you for providing valuable mentoring sessions!

Best regards,
The Chabaqa Team
    `;
  }

  /**
   * Generate reminder HTML
   */
  private generateReminderHtml(data: SessionBookingEmailData): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const scheduledTime = data.scheduledAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Session Reminder</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #F59E0B; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .session-details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .button { display: inline-block; background: #F59E0B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Session Reminder</h1>
            </div>
            <div class="content">
              <p>Hi there,</p>
              <p>This is a friendly reminder about your upcoming session tomorrow:</p>
              
              <div class="session-details">
                <h3>📅 Session Details</h3>
                <p><strong>Session:</strong> ${data.sessionTitle}</p>
                <p><strong>Date:</strong> ${scheduledDate}</p>
                <p><strong>Time:</strong> ${scheduledTime}</p>
                <p><strong>Duration:</strong> ${data.duration} minutes</p>
              </div>

              ${data.meetingUrl ? `
                <div class="session-details">
                  <h3>🎥 Join Your Session</h3>
                  <p>Click the link below to join when it's time:</p>
                  <a href="${data.meetingUrl}" class="button">Join Google Meet</a>
                </div>
              ` : ''}

              <div class="session-details">
                <h3>📝 Preparation Tips</h3>
                <ul>
                  <li>Test your camera and microphone beforehand</li>
                  <li>Prepare any questions or topics you'd like to discuss</li>
                  <li>Join the meeting 5 minutes early</li>
                  <li>Ensure you have a stable internet connection</li>
                </ul>
              </div>

              <p>Looking forward to a great session!</p>
            </div>
            <div class="footer">
              <p>Best regards,<br>The Chabaqa Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate reminder text
   */
  private generateReminderText(data: SessionBookingEmailData): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString();
    const scheduledTime = data.scheduledAt.toLocaleTimeString();

    return `
Session Reminder

Hi there,

This is a friendly reminder about your upcoming session tomorrow:

Session Details:
- Session: ${data.sessionTitle}
- Date: ${scheduledDate}
- Time: ${scheduledTime}
- Duration: ${data.duration} minutes

${data.meetingUrl ? `
Meeting Link: ${data.meetingUrl}
` : ''}

Preparation Tips:
- Test your camera and microphone beforehand
- Prepare any questions or topics you'd like to discuss
- Join the meeting 5 minutes early
- Ensure you have a stable internet connection

Looking forward to a great session!

Best regards,
The Chabaqa Team
    `;
  }

  /**
   * Generate cancellation HTML
   */
  private generateCancellationHtml(data: SessionBookingEmailData, cancelledBy: 'creator' | 'participant', reason?: string): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const scheduledTime = data.scheduledAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Session Cancelled</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #DC2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .session-details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>❌ Session Cancelled</h1>
            </div>
            <div class="content">
              <p>Hi there,</p>
              <p>We're writing to inform you that the following session has been cancelled:</p>
              
              <div class="session-details">
                <h3>📅 Cancelled Session</h3>
                <p><strong>Session:</strong> ${data.sessionTitle}</p>
                <p><strong>Date:</strong> ${scheduledDate}</p>
                <p><strong>Time:</strong> ${scheduledTime}</p>
                <p><strong>Cancelled by:</strong> ${cancelledBy === 'creator' ? data.creatorName : data.participantName}</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              </div>

              <p>We apologize for any inconvenience this may cause. If you'd like to reschedule, please reach out to coordinate a new time.</p>
            </div>
            <div class="footer">
              <p>Best regards,<br>The Chabaqa Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate cancellation text
   */
  private generateCancellationText(data: SessionBookingEmailData, cancelledBy: 'creator' | 'participant', reason?: string): string {
    const scheduledDate = data.scheduledAt.toLocaleDateString();
    const scheduledTime = data.scheduledAt.toLocaleTimeString();

    return `
Session Cancelled

Hi there,

We're writing to inform you that the following session has been cancelled:

Cancelled Session:
- Session: ${data.sessionTitle}
- Date: ${scheduledDate}
- Time: ${scheduledTime}
- Cancelled by: ${cancelledBy === 'creator' ? data.creatorName : data.participantName}
${reason ? `- Reason: ${reason}` : ''}

We apologize for any inconvenience this may cause. If you'd like to reschedule, please reach out to coordinate a new time.

Best regards,
The Chabaqa Team
    `;
  }
}