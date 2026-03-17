import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Community, CommunitySchema } from '../schema/community.schema';
import {
  CommunityStaff,
  CommunityStaffSchema,
} from '../schema/community-staff.schema';
import { CommunityAccessService } from './community-access.service';
import { CommunityStaffController } from './community-staff.controller';
import { CommunityMeAccessController } from './community-me-access.controller';
import { CommunityPermissionGuard } from './community-permission.guard';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: CommunityStaff.name, schema: CommunityStaffSchema },
    ]),
  ],
  controllers: [CommunityStaffController, CommunityMeAccessController],
  providers: [CommunityAccessService, CommunityPermissionGuard],
  exports: [CommunityAccessService, CommunityPermissionGuard],
})
export class CommunityAccessModule {}
