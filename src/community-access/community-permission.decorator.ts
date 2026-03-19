import { SetMetadata } from '@nestjs/common';
import { CommunityPermission } from '../common/permissions';

/**
 * Key used to store the required permission in route metadata.
 */
export const COMMUNITY_PERMISSION_KEY = 'community_permission';

/**
 * Decorator to declare the required community permission for a route.
 *
 * Usage:
 *   @RequireCommunityPermission(CommunityPermission.POSTS_MODERATE)
 *   @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
 *   async deletePost(...) { }
 *
 * The guard extracts communityId from:
 *   1) req.params.communityId
 *   2) req.body.communityId
 *   3) req.query.communityId
 *   4) req.params.slug / req.query.communitySlug / req.body.communitySlug
 *      → resolved to communityId via slug lookup
 */
export const RequireCommunityPermission = (
  ...permissions: CommunityPermission[]
) => SetMetadata(COMMUNITY_PERMISSION_KEY, permissions);

/**
 * Key to mark that community permission check is optional
 * (skip silently when communityId cannot be resolved).
 */
export const COMMUNITY_PERMISSION_OPTIONAL_KEY = 'community_permission_optional';

/**
 * Mark the community permission check as optional.
 * When communityId cannot be extracted, the guard passes through
 * instead of throwing 403. Useful for endpoints where communityId
 * is an optional query filter (e.g. analytics).
 */
export const OptionalCommunityPermission = () =>
  SetMetadata(COMMUNITY_PERMISSION_OPTIONAL_KEY, true);

/**
 * Key for specifying the community-id extraction source explicitly.
 */
export const COMMUNITY_ID_SOURCE_KEY = 'community_id_source';

export type CommunityIdSource =
  | { type: 'param'; name: string }
  | { type: 'body'; name: string }
  | { type: 'query'; name: string }
  | { type: 'slug'; paramName: string }
  | { type: 'entity'; modelName: string; paramName: string };

/**
 * Optionally specify how to extract the community ID for the guard.
 * Use when the default extraction order doesn't match the route layout.
 *
 * Usage:
 *   @CommunityIdFrom({ type: 'slug', paramName: 'slug' })
 *   @CommunityIdFrom({ type: 'entity', modelName: 'Post', paramName: 'id' })
 */
export const CommunityIdFrom = (source: CommunityIdSource) =>
  SetMetadata(COMMUNITY_ID_SOURCE_KEY, source);
