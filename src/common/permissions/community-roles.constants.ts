/**
 * Community Staff Roles & Permissions (RBAC)
 * -------------------------------------------
 * Single source of truth for community role definitions,
 * permission keys, and role → permission mappings.
 *
 * Roles are per-community: a user can be Admin in one community
 * and Member in another.
 *
 * Owner is derived from Community.createur – never stored as a
 * staff record.
 */

// ---------------------------------------------------------------------------
// Staff roles (stored in community_staff collection)
// ---------------------------------------------------------------------------
export enum CommunityStaffRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  SUPPORT = 'support',
}

// ---------------------------------------------------------------------------
// Resolved role (includes owner + member + none which are computed, not stored)
// ---------------------------------------------------------------------------
export enum CommunityRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  SUPPORT = 'support',
  MEMBER = 'member',
  NONE = 'none',
}

// ---------------------------------------------------------------------------
// Permission keys – each maps to a module / capability
// ---------------------------------------------------------------------------
export enum CommunityPermission {
  COMMUNITY_MANAGE_SETTINGS = 'community.manage_settings',
  ROLES_MANAGE = 'roles.manage',
  MEMBERS_VIEW = 'members.view',
  MEMBERS_MANAGE = 'members.manage',
  POSTS_MODERATE = 'posts.moderate',
  CONTENT_MANAGE = 'content.manage',
  MARKETING_MANAGE = 'marketing.manage',
  ANALYTICS_VIEW = 'analytics.view',
  FINANCE_VIEW = 'finance.view',
  AFFILIATES_MANAGE = 'affiliates.manage',
  SUPPORT_MANAGE = 'support.manage',
}

// ---------------------------------------------------------------------------
// Role → Permissions mapping
// ---------------------------------------------------------------------------
export const ROLE_PERMISSIONS: Record<CommunityRole, CommunityPermission[]> = {
  [CommunityRole.OWNER]: Object.values(CommunityPermission), // all permissions

  [CommunityRole.ADMIN]: [
    CommunityPermission.COMMUNITY_MANAGE_SETTINGS,
    CommunityPermission.ROLES_MANAGE,
    CommunityPermission.MEMBERS_VIEW,
    CommunityPermission.MEMBERS_MANAGE,
    CommunityPermission.POSTS_MODERATE,
    CommunityPermission.CONTENT_MANAGE,
    CommunityPermission.MARKETING_MANAGE,
    CommunityPermission.ANALYTICS_VIEW,
    CommunityPermission.FINANCE_VIEW,
    CommunityPermission.AFFILIATES_MANAGE,
    CommunityPermission.SUPPORT_MANAGE,
  ],

  [CommunityRole.MODERATOR]: [
    CommunityPermission.MEMBERS_VIEW,
    CommunityPermission.POSTS_MODERATE,
  ],

  [CommunityRole.SUPPORT]: [
    CommunityPermission.MEMBERS_VIEW,
    CommunityPermission.SUPPORT_MANAGE,
  ],

  [CommunityRole.MEMBER]: [],

  [CommunityRole.NONE]: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a boolean permission map for a given role */
export function getPermissionsForRole(
  role: CommunityRole,
): Record<CommunityPermission, boolean> {
  const granted = new Set(ROLE_PERMISSIONS[role] ?? []);
  const result = {} as Record<CommunityPermission, boolean>;
  for (const perm of Object.values(CommunityPermission)) {
    result[perm] = granted.has(perm);
  }
  return result;
}

/** Check whether a role has a specific permission */
export function roleHasPermission(
  role: CommunityRole,
  permission: CommunityPermission,
): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

/** Role hierarchy value (higher = more privilege) */
export const ROLE_HIERARCHY: Record<CommunityRole, number> = {
  [CommunityRole.OWNER]: 100,
  [CommunityRole.ADMIN]: 80,
  [CommunityRole.MODERATOR]: 40,
  [CommunityRole.SUPPORT]: 20,
  [CommunityRole.MEMBER]: 10,
  [CommunityRole.NONE]: 0,
};

/** Human-readable labels */
export const ROLE_LABELS: Record<CommunityRole, string> = {
  [CommunityRole.OWNER]: 'Owner',
  [CommunityRole.ADMIN]: 'Admin',
  [CommunityRole.MODERATOR]: 'Moderator',
  [CommunityRole.SUPPORT]: 'Support',
  [CommunityRole.MEMBER]: 'Member',
  [CommunityRole.NONE]: 'Non-member',
};
