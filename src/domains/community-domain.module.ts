import { Module } from '@nestjs/common';
import { CommunityAffCreaJoinModule } from '../community-aff-crea-join/community-aff-crea-join.module';
import { CommunitiesModule } from '../communities/communities.module';
import { PostModule } from '../post/post.module';
import { NotificationModule } from '../notification/notification.module';
import { DmModule } from '../dm/dm.module';
import { LiveSupportModule } from '../live-support/live-support.module';
import { CommunityPageContentModule } from '../community-page-content/community-page-content.module';

@Module({
  imports: [
    CommunityAffCreaJoinModule,
    CommunitiesModule,
    PostModule,
    NotificationModule,
    DmModule,
    LiveSupportModule,
    CommunityPageContentModule,
  ],
  exports: [
    CommunityAffCreaJoinModule,
    CommunitiesModule,
    PostModule,
    NotificationModule,
    DmModule,
    LiveSupportModule,
    CommunityPageContentModule,
  ],
})
export class CommunityDomainModule {}
