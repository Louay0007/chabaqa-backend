import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from '../../admin.service';

/**
 * AdminAuthGuard extends JWT authentication for admin-specific requirements
 * Verifies that the authenticated user has admin privileges
 */
@Injectable()
export class AdminAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly adminService: AdminService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, verify JWT authentication
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      throw new UnauthorizedException('Authentication required');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Fix: Handle both 'id' and '_id' based on what JwtStrategy returns
    const userId = String(user?.id || user?._id || user?.userId || user?.sub || '');

    if (!user || !userId) {
      throw new UnauthorizedException('Invalid user token');
    }

    try {
      request.user = {
        ...user,
        id: userId,
        _id: user?._id || userId,
        userId: user?.userId || userId,
        sub: user?.sub || userId,
      };

      const adminUser = await this.adminService.getAdminContextForRequestUser(request.user);
      request.adminUser = adminUser;
      request.adminSession = this.adminService.buildAdminSessionPayload(adminUser);

      if (adminUser.authSource === 'admin_user') {
        await this.adminService.updateLastActivity(adminUser._id.toString());
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Admin authentication failed');
    }
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid authentication token');
    }
    return user;
  }
}
