import { SetMetadata } from '@nestjs/common';
import { AdminRole, AdminPermission } from '../../schemas/admin-user.schema';

/**
 * Decorator to specify required admin roles for a controller method
 * @param roles - Array of AdminRole values required to access the endpoint
 */
export const RequireAdminRoles = (...roles: AdminRole[]) => SetMetadata('admin-roles', roles);

/**
 * Decorator to specify required admin permissions for a controller method
 * @param permissions - Array of AdminPermission values required to access the endpoint
 */
export const RequireAdminPermissions = (...permissions: AdminPermission[]) => 
  SetMetadata('admin-permissions', permissions);

/**
 * Decorator to specify both required roles and permissions
 * @param roles - Array of AdminRole values required
 * @param permissions - Array of AdminPermission values required
 */
export const RequireAdminAccess = (roles: AdminRole[] = [], permissions: AdminPermission[] = []) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    SetMetadata('admin-roles', roles)(target, propertyKey, descriptor);
    SetMetadata('admin-permissions', permissions)(target, propertyKey, descriptor);
  };
};

/**
 * Decorator for super admin only access
 */
export const SuperAdminOnly = () => RequireAdminRoles(AdminRole.SUPER_ADMIN);

/**
 * Common role combinations for convenience
 */
export const UserManagementAccess = () => RequireAdminRoles(
  AdminRole.SUPER_ADMIN, 
  AdminRole.USER_MANAGER
);

export const ContentModerationAccess = () => RequireAdminRoles(
  AdminRole.SUPER_ADMIN, 
  AdminRole.CONTENT_MODERATOR
);

export const FinancialManagementAccess = () => RequireAdminRoles(
  AdminRole.SUPER_ADMIN, 
  AdminRole.FINANCIAL_MANAGER
);

export const CommunityManagementAccess = () => RequireAdminRoles(
  AdminRole.SUPER_ADMIN, 
  AdminRole.COMMUNITY_MANAGER
);

export const ContentManagementAccess = () => RequireAdminRoles(
  AdminRole.SUPER_ADMIN, 
  AdminRole.CONTENT_MODERATOR,
  AdminRole.COMMUNITY_MANAGER
);

export const AnalyticsAccess = () => RequireAdminRoles(
  AdminRole.SUPER_ADMIN, 
  AdminRole.ANALYTICS_VIEWER,
  AdminRole.USER_MANAGER,
  AdminRole.COMMUNITY_MANAGER,
  AdminRole.FINANCIAL_MANAGER
);

export const SecurityAuditAccess = () => RequireAdminRoles(
  AdminRole.SUPER_ADMIN, 
  AdminRole.SECURITY_AUDITOR
);