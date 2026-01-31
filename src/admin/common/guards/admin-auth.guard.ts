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

    if (!user || !user.id) {
      throw new UnauthorizedException('Invalid user token');
    }

    try {
      // Verify user has admin privileges
      const isAdminUser = await this.adminService.isAdminUser(user.id);
      if (!isAdminUser) {
        throw new ForbiddenException('Admin privileges required');
      }

      // Get admin user details and attach to request
      const adminUser = await this.adminService.getAdminUser(user.id);
      if (!adminUser || !adminUser.isActive) {
        throw new ForbiddenException('Admin account is inactive');
      }

      // Attach admin user data to request for use in controllers
      request.adminUser = adminUser;

      // Update last activity timestamp
      await this.adminService.updateLastActivity(adminUser._id.toString());

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