import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactProfile, ContactProfileSchema } from '../schema/contact-profile.schema';
import { ContactActivity, ContactActivitySchema } from '../schema/contact-activity.schema';
import { UserLoginActivity, UserLoginActivitySchema } from '../schema/user-login-activity.schema';
import { OrderSchema } from '../schema/order.schema';
import { ContactProfileService } from './contact-profile.service';
import { ContactProfileController } from './contact-profile.controller';
import { PolicyModule } from '../common/modules/policy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactProfile.name, schema: ContactProfileSchema },
      { name: ContactActivity.name, schema: ContactActivitySchema },
      { name: UserLoginActivity.name, schema: UserLoginActivitySchema },
      { name: 'Order', schema: OrderSchema },
    ]),
    PolicyModule,
  ],
  controllers: [ContactProfileController],
  providers: [ContactProfileService],
  exports: [ContactProfileService],
})
export class ContactProfileModule {}
