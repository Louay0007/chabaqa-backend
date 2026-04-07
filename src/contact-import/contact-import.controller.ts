import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { parse } from 'csv-parse/sync';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { EmailSuppressionService } from '../email-suppression/email-suppression.service';
import { ContactActivityService } from '../contact-activity/contact-activity.service';
import { ContactActivityType } from '../schema/contact-activity.schema';
import { Lead, LeadDocument } from '../schema/lead.schema';

const IMPORT_LANDING_PAGE_PLACEHOLDER = new Types.ObjectId('000000000000000000000000');

@ApiTags('Contact Import/Export')
@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactImportController {
  constructor(
    private readonly suppressionService: EmailSuppressionService,
    private readonly activityService: ContactActivityService,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel('UserLoginActivity')
    private readonly loginActivityModel: Model<any>,
    @InjectModel('User')
    private readonly userModel: Model<any>,
  ) {}

  @Post(':communityId/import')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import contacts from CSV' })
  async importContacts(
    @Param('communityId') communityId: string,
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) return { imported: 0, skipped: 0, errors: ['No file uploaded'] };

    let rows: Record<string, string>[];
    try {
      rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch (err: any) {
      return { imported: 0, skipped: 0, errors: [`CSV parse error: ${err.message}`] };
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const email = (row.email || '').toLowerCase().trim();
      if (!email) {
        errors.push(`Row missing email: ${JSON.stringify(row)}`);
        continue;
      }

      const suppressed = await this.suppressionService.isSuppressed(communityId, email);
      if (suppressed) {
        skipped++;
        continue;
      }

      try {
        const tags = row.tags ? row.tags.split(';').map((t) => t.trim()).filter(Boolean) : [];
        await this.leadModel.findOneAndUpdate(
          { communityId: new Types.ObjectId(communityId), email },
          {
            $setOnInsert: {
              landingPage: IMPORT_LANDING_PAGE_PLACEHOLDER,
              creator: new Types.ObjectId(req.user._id),
              pageType: 'standalone',
              status: 'new',
            },
            $set: {
              communityId: new Types.ObjectId(communityId),
              name: row.name || email,
              phone: row.phone || undefined,
              data: { tags, importedAt: new Date() },
            },
          },
          { upsert: true },
        );

        // Try to find a userId by email
        const user = await this.userModel.findOne({ email }).select('_id').lean();
        if (user) {
          await this.activityService.record({
            communityId,
            userId: user._id.toString(),
            type: ContactActivityType.IMPORTED,
            metadata: { email, name: row.name, tags },
          });
        }

        imported++;
      } catch (err: any) {
        errors.push(`Error for ${email}: ${err.message}`);
      }
    }

    return { imported, skipped, errors };
  }

  @Get(':communityId/export')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Export community contacts as CSV' })
  async exportContacts(
    @Param('communityId') communityId: string,
    @Query('segment') _segment?: string,
    @Query('tags') _tags?: string,
    @Res() res?: Response,
  ) {
    const activities = await this.loginActivityModel
      .find({ communityId: new Types.ObjectId(communityId) })
      .select('userId joinedAt lastLoginAt inactivityStatus')
      .lean();

    const userIds = activities.map((a) => a.userId);
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('email name').lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const leads = await this.leadModel
      .find({ communityId: new Types.ObjectId(communityId) })
      .select('email data score')
      .lean();
    const leadMap = new Map(leads.map((l) => [l.email, l]));

    const header = 'email,name,joinedAt,lastLoginAt,inactivityStatus,tags,leadScore\n';
    const rows = activities.map((a) => {
      const user = userMap.get(a.userId.toString());
      const lead = user ? leadMap.get(user.email) : undefined;
      const tags = lead?.data?.tags?.join(';') || '';
      const cols = [
        user?.email || '',
        user?.name || '',
        a.joinedAt ? new Date(a.joinedAt).toISOString() : '',
        a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : '',
        a.inactivityStatus || '',
        tags,
        lead?.score ?? 0,
      ];
      return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
    });

    const csv = header + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contacts-${communityId}.csv"`);
    res.status(200).send(csv);
  }
}
