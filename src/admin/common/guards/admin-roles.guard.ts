import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, AdminPermission } from '../../schemas/admin-user.schema';
import { AdminService } from '../../admin.service';

/**
 * AdminRolesGuard implements role-based access control for admin functions
 * Checks if the authenticated admin user has required roles or permissions
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required roles and permissions from decorator metadata
    const requiredRoles = this.reflector.get<AdminRole[]>('admin-roles', context.getHandler()) || [];
    const requiredPermissions = this.reflector.get<AdminPermission[]>('admin-permissions', context.getHandler()) || [];

    // If no roles or permissions are required, allow access
    if (requiredRoles.length === 0 && requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const adminUser = request.adminUser;

    if (!user || !adminUser) {
      throw new ForbiddenException('Admin authentication required');
    }

    try {
      // Check if admin user has required roles
      const hasRequiredRole = requiredRoles.length === 0 || 
        requiredRoles.some(role => adminUser.roles.includes(role));

      // Check if admin user has required permissions
      const hasRequiredPermission = requiredPermissions.length === 0 || 
        requiredPermissions.some(permission => adminUser.permissions.includes(permission));

      // Super admin has access to everything
      // Also check for 'admin' role which we mapped in the AdminAuthGuard for backward compatibility
      const isSuperAdmin = adminUser.roles.includes(AdminRole.SUPER_ADMIN) || 
                           adminUser.roles.includes('admin') || 
                           adminUser.roles.includes('super_admin');

      // Check if user has ALL permissions (wildcard)
      const hasWildcardPermission = adminUser.permissions.includes('*');

      if (isSuperAdmin || hasWildcardPermission || (hasRequiredRole && hasRequiredPermission)) {
        return true;
      }

      // Log the access attempt for audit purposes
      await this.logAccessAttempt(adminUser._id.toString(), context, false, {
        requiredRoles,
        requiredPermissions,
        userRoles: adminUser.roles,
        userPermissions: adminUser.permissions,
      });

      throw new ForbiddenException(
        `Insufficient privileges. Required roles: [${requiredRoles.join(', ')}], ` +
        `Required permissions: [${requiredPermissions.join(', ')}]`
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('Role verification failed');
    }
  }

  private async logAccessAttempt(
    adminUserId: string,
    context: ExecutionContext,
    success: boolean,
    metadata: any,
  ): Promise<void> {
    try {
      const request = context.switchToHttp().getRequest();
      const handler = context.getHandler();
      const className = context.getClass().name;
      const methodName = handler.name;

      // This would typically use the AuditLogService
      // For now, we'll just log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`Admin access attempt: ${success ? 'SUCCESS' : 'FAILED'}`, {
          adminUserId,
          endpoint: `${className}.${methodName}`,
          url: request.url,
          method: request.method,
          metadata,
        });
      }
    } catch (error) {
      // Don't throw errors from logging
      console.error('Failed to log access attempt:', error);
    }
  }
}