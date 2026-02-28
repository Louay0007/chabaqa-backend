import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserLoginActivityService } from './user-login-activity.service';
import { UserLoginActivity } from '../schema/user-login-activity.schema';
import { User } from '../schema/user.schema';
import { Community } from '../schema/community.schema';

describe('UserLoginActivityService', () => {
  let service: UserLoginActivityService;
  let activityModel: any;
  let limitMock: jest.Mock;

  beforeEach(async () => {
    limitMock = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });
    const sortMock = jest.fn().mockReturnValue({
      limit: limitMock,
    });
    const populateMock = jest.fn().mockReturnValue({
      sort: sortMock,
    });

    activityModel = {
      find: jest.fn().mockReturnValue({
        populate: populateMock,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserLoginActivityService,
        { provide: getModelToken(UserLoginActivity.name), useValue: activityModel },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Community.name), useValue: {} },
      ],
    }).compile();

    service = module.get<UserLoginActivityService>(UserLoginActivityService);
  });

  it('uses days range for last_60_days instead of old status mapping', async () => {
    await service.getInactiveUsersByPeriod('507f1f77bcf86cd799439011', 'last_60_days', 123);

    expect(activityModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        daysSinceLastLogin: { $gte: 60, $lte: 60 },
      }),
    );
  });

  it('respects provided limit when querying inactive users', async () => {
    await service.getInactiveUsersByPeriod('507f1f77bcf86cd799439011', 'last_30_days', 50);
    expect(limitMock).toHaveBeenCalledWith(50);
  });
});
