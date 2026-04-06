import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LandingPagesController } from './landing-pages.controller';
import { LandingPagesPublicController } from './landing-pages-public.controller';
import { CommunityHomeController } from './community-home.controller';
import { LandingPagesService } from './landing-pages.service';
import { LeadsService } from './leads.service';
import { PageAnalyticsService } from './page-analytics.service';
import { LandingPage, LandingPageSchema } from '../schema/landing-page.schema';
import { Lead, LeadSchema } from '../schema/lead.schema';
import { PageView, PageViewSchema } from '../schema/page-view.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import {
  CommunityPageContent,
  CommunityPageContentSchema,
} from '../schema/community-page-content.schema';
import { CommunityHomeMigrationService } from './community-home-migration.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LandingPage.name, schema: LandingPageSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: PageView.name, schema: PageViewSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: CommunityPageContent.name, schema: CommunityPageContentSchema },
    ]),
  ],
  controllers: [
    LandingPagesController,
    LandingPagesPublicController,
    CommunityHomeController,
  ],
  providers: [
    LandingPagesService,
    LeadsService,
    PageAnalyticsService,
    CommunityHomeMigrationService,
  ],
  exports: [LandingPagesService, LeadsService, CommunityHomeMigrationService],
})
export class LandingPagesModule {}
