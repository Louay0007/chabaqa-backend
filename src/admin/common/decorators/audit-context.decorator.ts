import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminAction } from '../../schemas/audit-log.schema';

/**
 * Metadata key for audit context
 */
export const AUDIT_CONTEXT_KEY = 'audit_context';

/**
 * Interface for audit context metadata
 */
export interface AuditContext {
  action?: AdminAction;
  entityType?: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Decorator to set audit context for admin actions
 * This helps the audit middleware understand what action is being performed
 * 
 * @param context - Audit context information
 * 
 * @example
 * @AuditContext({
 *   action: AdminAction.USER_SUSPEND,
 *   entityType: 'User',
 *   description: 'Suspend user account for policy violation'
 * })
 * async suspendUser(@Param('id') userId: string) {
 *   // Implementation
 * }
 */
export const AuditContext = (context: AuditContext) => SetMetadata(AUDIT_CONTEXT_KEY, context);

/**
 * Parameter decorator to inject audit metadata into request
 * This allows controllers to add dynamic audit information
 * 
 * @example
 * async updateUser(
 *   @Param('id') userId: string,
 *   @Body() updateData: UpdateUserDto,
 *   @AuditMetadata() setAuditMetadata: (metadata: Record<string, any>) => void
 * ) {
 *   setAuditMetadata({ 
 *     updatedFields: Object.keys(updateData),
 *     previousData: await this.getUserData(userId)
 *   });
 *   // Implementation
 * }
 */
export const AuditMetadata = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    
    return (metadata: Record<string, any>) => {
      if (!request.auditMetadata) {
        request.auditMetadata = {};
      }
      Object.assign(request.auditMetadata, metadata);
    };
  },
);

/**
 * Parameter decorator to set entity information for audit logging
 * 
 * @example
 * async getUser(
 *   @Param('id') userId: string,
 *   @SetAuditEntity() setEntity: (type: string, id: string) => void
 * ) {
 *   setEntity('User', userId);
 *   // Implementation
 * }
 */
export const SetAuditEntity = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    
    return (entityType: string, entityId: string) => {
      request.entityType = entityType;
      request.entityId = entityId;
    };
  },
);

/**
 * Parameter decorator to set admin action for audit logging
 * 
 * @example
 * async performAction(
 *   @SetAuditAction() setAction: (action: AdminAction) => void
 * ) {
 *   setAction(AdminAction.BULK_OPERATION);
 *   // Implementation
 * }
 */
export const SetAuditAction = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    
    return (action: AdminAction) => {
      request.adminAction = action;
    };
  },
);