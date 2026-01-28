import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import { User, UserSchema } from '../schema/user.schema';
import { Session, SessionSchema } from '../schema/session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
    ])
  ],
  providers: [EmailService],
  exports: [EmailService]
})
export class EmailModule {}