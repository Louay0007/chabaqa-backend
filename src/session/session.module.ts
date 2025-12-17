import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { Session, SessionSchema } from '../schema/session.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import { AuthModule } from '../auth/auth.module';
import { TrackingModule } from '../common/modules/tracking.module';
import { FeeModule } from '../common/modules/fee.module';
import { OrderSchema } from '../schema/order.schema';
import { PolicyModule } from '../common/modules/policy.module';
import { PromoModule } from '../common/modules/promo.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: 'Order', schema: OrderSchema },
    ]),
    AuthModule,
    TrackingModule,
    FeeModule,
    PolicyModule,
    PromoModule,
    GoogleCalendarModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
