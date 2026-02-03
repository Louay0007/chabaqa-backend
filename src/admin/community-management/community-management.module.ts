import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityManagementController } from './community-management.controller';
import { CommunityManagementService } from './community-management.service';
import { Community, CommunitySchema } from '../../schema/community.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { Post, PostSchema } from '../../schema/post.schema';
import { Cours, CoursSchema } from '../../schema/course.schema';
import { Event, EventSchema } from '../../schema/event.schema';
import { Product, ProductSchema } from '../../schema/product.schema';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog, AuditLogSchema } from '../schemas/audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: Post.name, schema: PostSchema },
      { name: Cours.name, schema: CoursSchema },
      { name: Event.name, schema: EventSchema },
      { name: Product.name, schema: ProductSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [CommunityManagementController],
  providers: [
    CommunityManagementService,
    AuditLogService,
  ],
  exports: [CommunityManagementService],
})
export class CommunityManagementModule {}