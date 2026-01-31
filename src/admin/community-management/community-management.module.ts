import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityManagementController } from './community-management.controller';
import { CommunityManagementService } from './community-management.service';
import { Community, CommunitySchema } from '../../schema/community.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog, AuditLogSchema } from '../schemas/audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
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