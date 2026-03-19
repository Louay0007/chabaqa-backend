import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PostController } from './post.controller';

describe('PostController delete flow', () => {
  const makeController = () => {
    const postService = {
      remove: jest.fn().mockResolvedValue({ message: 'Post supprimé avec succès' }),
    };

    const controller = new PostController(postService as any);
    return { controller, postService };
  };

  it('keeps delete route guarded only by JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PostController.prototype.remove) || [];
    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(JwtAuthGuard);
  });

  it('deletes a post when request user is the author', async () => {
    const { controller, postService } = makeController();
    const response = await controller.remove('post-1', { user: { _id: 'user-1' } } as any);

    expect(postService.remove).toHaveBeenCalledWith('post-1', 'user-1');
    expect(response).toEqual({ success: true, message: 'Post supprimé avec succès' });
  });

  it('throws UnauthorizedException when user id is missing', async () => {
    const { controller, postService } = makeController();

    await expect(controller.remove('post-1', { user: {} } as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(postService.remove).not.toHaveBeenCalled();
  });
});
