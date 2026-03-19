import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { CommunityPermission } from '../common/permissions';
import { CommunityAccessService } from './community-access.service';
import {
  COMMUNITY_PERMISSION_KEY,
  COMMUNITY_ID_SOURCE_KEY,
  COMMUNITY_PERMISSION_OPTIONAL_KEY,
  CommunityIdSource,
} from './community-permission.decorator';

/**
 * Guard that enforces community-level RBAC permissions.
 *
 * Prerequisites:
 *  - JwtAuthGuard (or equivalent) must run first to populate req.user.
 *  - Route must be decorated with @RequireCommunityPermission(...).
 *
 * Community ID extraction order (unless overridden with @CommunityIdFrom):
 *  1. params.communityId
 *  2. body.communityId
 *  3. query.communityId
 *  4. params.slug → resolved via DB lookup
 *
 * For entity-based resolution (e.g. @CommunityIdFrom({ type:'entity', modelName:'Post', paramName:'id' })):
 *  - Looks up the entity by its _id and reads its communityId field
 */
@Injectable()
export class CommunityPermissionGuard implements CanActivate {
  private readonly logger = new Logger(CommunityPermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly communityAccess: CommunityAccessService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from decorator metadata
    const requiredPermissions = this.reflector.getAllAndOverride<
      CommunityPermission[]
    >(COMMUNITY_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    // If no permission decorator, pass through
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user._id) {
      throw new ForbiddenException('Authentication required');
    }

    const userId = String(user._id || user.sub);

    // Resolve community ID
    const communityId = await this.extractCommunityId(context, request);
    if (!communityId) {
      // Check if this permission check is optional
      const isOptional = this.reflector.getAllAndOverride<boolean>(
        COMMUNITY_PERMISSION_OPTIONAL_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isOptional) {
        return true; // No community context → skip permission check
      }
      const paramsKeys = Object.keys(request.params || {});
      const bodyKeys = Object.keys(request.body || {});
      const queryKeys = Object.keys(request.query || {});
      this.logger.warn(
        `Could not extract communityId for route ${request.method} ${request.url} (paramsKeys=${JSON.stringify(paramsKeys)}, bodyKeys=${JSON.stringify(bodyKeys)}, queryKeys=${JSON.stringify(queryKeys)})`,
      );
      throw new ForbiddenException(
        'Could not determine which community this action belongs to',
      );
    }

    // Check all required permissions
    const { role, permissions } =
      await this.communityAccess.getCommunityPermissions(communityId, userId);

    for (const perm of requiredPermissions) {
      if (!permissions[perm]) {
        throw new ForbiddenException(
          `Missing permission: ${perm} (your role: ${role})`,
        );
      }
    }

    // Attach role info to request for downstream use
    request.communityRole = role;
    request.communityPermissions = permissions;
    request.resolvedCommunityId = communityId;

    return true;
  }

  private async extractCommunityId(
    context: ExecutionContext,
    request: any,
  ): Promise<string | null> {
    // 1. Check for explicit source override
    const source = this.reflector.getAllAndOverride<CommunityIdSource>(
      COMMUNITY_ID_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (source) {
      switch (source.type) {
        case 'param':
          return request.params?.[source.name] || null;
        case 'body':
          return request.body?.[source.name] || null;
        case 'query':
          return request.query?.[source.name] || null;
        case 'slug':
          return this.resolveSlug(request.params?.[source.paramName]);
        case 'entity':
          return this.resolveEntityCommunity(
            source.modelName,
            request.params?.[source.paramName],
          );
      }
    }

    // 2. Default extraction order
    if (request.params?.communityId) return request.params.communityId;
    if (request.body?.communityId) return request.body.communityId;
    if (request.query?.communityId) return request.query.communityId;

    // 3. Slug fallback
    if (request.params?.slug) {
      return this.resolveSlug(request.params.slug);
    }
    if (request.query?.communitySlug) {
      return this.resolveSlug(request.query.communitySlug);
    }
    if (request.body?.communitySlug) {
      return this.resolveSlug(request.body.communitySlug);
    }

    return null;
  }

  private async resolveSlug(slug: string | undefined): Promise<string | null> {
    if (!slug) return null;
    return this.communityAccess.resolveCommunityIdFromSlug(slug);
  }

  /**
   * Resolve communityId by looking up an entity in the database.
   * Uses the raw Mongoose connection to avoid circular dependency on every model.
   */
  private async resolveEntityCommunity(
    modelName: string,
    entityId: string | undefined,
  ): Promise<string | null> {
    if (!entityId) return null;
    try {
      const model = this.connection.model(modelName);
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(entityId);
      const doc =
        (isObjectId
          ? await model.findById(entityId).select('communityId').lean().exec()
          : null) ||
        (await model
          .findOne({ id: entityId })
          .select('communityId')
          .lean()
          .exec());
      if (doc && (doc as any).communityId) {
        return String((doc as any).communityId);
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `Could not resolve communityId from ${modelName}/${entityId}: ${err.message}`,
      );
      return null;
    }
  }
}
