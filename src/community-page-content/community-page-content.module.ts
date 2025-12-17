import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityPageContentController } from './community-page-content.controller';
import { CommunityPageContentService } from './community-page-content.service';
import { 
  CommunityPageContent, 
  CommunityPageContentSchema 
} from '../schema/community-page-content.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommunityPageContent.name, schema: CommunityPageContentSchema },
      { name: Community.name, schema: CommunitySchema },
    ]),
    UploadModule
  ],
  controllers: [CommunityPageContentController],
  providers: [CommunityPageContentService],
  exports: [CommunityPageContentService],
})
export class CommunityPageContentModule {}
