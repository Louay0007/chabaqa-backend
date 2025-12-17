import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { Post, PostSchema } from '../schema/post.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema }
    ]),
    AuthModule
  ],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService]
})
export class PostModule {}
