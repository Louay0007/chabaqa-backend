import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailTemplate, EmailTemplateSchema } from '../schema/email-template.schema';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateController } from './email-template.controller';
import { PolicyModule } from '../common/modules/policy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
    ]),
    PolicyModule,
  ],
  controllers: [EmailTemplateController],
  providers: [EmailTemplateService],
  exports: [EmailTemplateService],
})
export class EmailTemplateModule {}
