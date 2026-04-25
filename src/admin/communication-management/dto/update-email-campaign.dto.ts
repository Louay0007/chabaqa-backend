import { PartialType } from '@nestjs/mapped-types';
import { AdminCreateEmailCampaignDto } from './create-email-campaign.dto';

/**
 * DTO for updating an existing email campaign.
 * Keeps the same contract as creation while allowing partial updates.
 */
export class AdminUpdateEmailCampaignDto extends PartialType(AdminCreateEmailCampaignDto) {}
