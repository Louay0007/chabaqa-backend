import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  AutomationWorkflow,
  AutomationWorkflowSchema,
} from '../schema/automation-workflow.schema';
import {
  WorkflowEnrollment,
  WorkflowEnrollmentSchema,
} from '../schema/workflow-enrollment.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import {
  UserLoginActivitySchema,
} from '../schema/user-login-activity.schema';
import { OrderSchema } from '../schema/order.schema';
import { CourseEnrollmentSchema } from '../schema/course.schema';

import { PolicyModule } from '../common/modules/policy.module';
import { EmailService } from '../common/services/email.service';

import { AutomationWorkflowService } from './automation-workflow.service';
import { AutomationWorkflowController } from './automation-workflow.controller';
import { AutomationWorkflowProcessor } from './automation-workflow.processor';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: AutomationWorkflow.name,
        schema: AutomationWorkflowSchema,
      },
      {
        name: WorkflowEnrollment.name,
        schema: WorkflowEnrollmentSchema,
      },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: 'UserLoginActivity', schema: UserLoginActivitySchema },
      { name: 'Order', schema: OrderSchema },
      { name: 'CourseEnrollment', schema: CourseEnrollmentSchema },
    ]),
    PolicyModule,
  ],
  controllers: [AutomationWorkflowController],
  providers: [
    AutomationWorkflowService,
    AutomationWorkflowProcessor,
    EmailService,
  ],
  exports: [AutomationWorkflowService],
})
export class AutomationWorkflowModule {}
