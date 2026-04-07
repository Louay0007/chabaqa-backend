import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactActivity, ContactActivitySchema } from '../schema/contact-activity.schema';
import { ContactActivityService } from './contact-activity.service';
import { ContactActivityController } from './contact-activity.controller';
import { PolicyModule } from '../common/modules/policy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactActivity.name, schema: ContactActivitySchema },
    ]),
    PolicyModule,
  ],
  controllers: [ContactActivityController],
  providers: [ContactActivityService],
  exports: [ContactActivityService],
})
export class ContactActivityModule {}
