# Backend ID Consistency Audit & Fix Guide

## Problem Summary
Some Mongoose schemas define a **custom `id` field** (string) separate from MongoDB's default `_id` (ObjectId). 
When backend services return entities, they must use the **custom `id` field** for consistency with frontend routing and matching logic.

**Example Issue:** 
- Frontend uses `course.id` (e.g., `693d5f68ed03c76ab6da6549`)
- Backend returned `course._id.toString()` (e.g., `693d5f68ed03c76ab6da654b`)
- Result: Enrollment matching failed, "Continue" button didn't show

---

## Schemas with Custom `id` Fields

### ✅ FIXED
1. **Cours** (`src/schema/course.schema.ts`)
   - Has: `id: string` (custom field, indexed unique)
   - Services FIXED to return `cours.id` instead of `cours._id.toString()`
   - Files fixed: `cours.service.ts`, `course-enrollment.service.ts`

### ⚠️ NEEDS FIXING

2. **Product** (`src/schema/product.schema.ts`)
   - Has: `id: string` (custom field, unique)
   - Service: `product.service.ts` - CHECK IF IT RETURNS `product.id` or `product._id.toString()`

3. **Challenge** (`src/schema/challenge.schema.ts`)
   - Has: `id: string` (custom field)
   - Service: `challenge.service.ts` - CHECK IF IT RETURNS `challenge.id` or `challenge._id.toString()`

4. **Session** (`src/schema/session.schema.ts`)
   - Has: `id: string` (custom field)
   - Service: `session.service.ts` - CHECK IF IT RETURNS `session.id` or `session._id.toString()`

5. **Event** (`src/schema/event.schema.ts`)
   - Has: `id: string` (custom field, unique)
   - Service: `event.service.ts` - MIXED APPROACH (returns both `id` and `_id`)
   - **Action needed:** Ensure `event.id` is primary identifier in responses

6. **Achievement** (`src/schema/achievement.schema.ts`)
   - Has: `id: string` (custom field, unique)
   - Service: CHECK achievement service

7. **UserAchievement** (`src/schema/user-achievement.schema.ts`)
   - Has: `id: string` (custom field, unique)
   - Service: CHECK user-achievement service

---

## Reference Entities (MongoDB `_id` only)

These entities **do NOT** have custom `id` fields, so using `_id.toString()` is CORRECT:

- **Community** - Uses `_id`, no custom `id` field ✅
- **User** - Uses `_id`, no custom `id` field ✅
- **Post** - Uses `_id`, no custom `id` field ✅
- **Order** - Has `contentId` (reference to other entities), no custom `id` field ✅
- **CourseEnrollment** - Has custom `id`, but `courseId` field references `Cours._id` (ObjectId)

---

## Fix Pattern

### ❌ WRONG (Returns MongoDB _id):
```typescript
return {
  id: entity._id.toString(),  // ❌ Wrong if schema has custom id field
  title: entity.title,
  // ...
}
```

### ✅ CORRECT (Returns custom id field):
```typescript
return {
  id: entity.id,  // ✅ Use custom id field if it exists
  mongoId: entity._id.toString(),  // Optional: include both for debugging
  title: entity.title,
  // ...
}
```

### ✅ SAFE PATTERN (Fallback to _id if no custom id):
```typescript
return {
  id: entity.id || entity._id.toString(),  // ✅ Prefer custom id, fallback to _id
  title: entity.title,
  // ...
}
```

---

## Helper Utility (Recommended)

Create `src/utils/id-serializer.ts`:

```typescript
import { Document } from 'mongoose';

/**
 * Serialize entity ID - prefers custom id field over _id
 */
export function serializeId(entity: any): string {
  return entity.id || entity._id?.toString() || '';
}

/**
 * Serialize entity with both id and mongoId for debugging
 */
export function serializeEntityIds(entity: any): { id: string; mongoId: string } {
  return {
    id: entity.id || entity._id?.toString() || '',
    mongoId: entity._id?.toString() || '',
  };
}
```

---

## Testing Checklist

After fixing each service:

1. ✅ **Course Enrollment** - User enrolls once, "Continue" button persists on refresh
2. ⬜ **Product Purchase** - Product ID matches between cart and order
3. ⬜ **Event Registration** - Event ID matches between listing and booking
4. ⬜ **Challenge Participation** - Challenge ID matches in submissions
5. ⬜ **Session Booking** - Session ID matches in bookings
6. ⬜ **Achievement Unlocking** - Achievement ID matches in user achievements

---

## Priority Order

1. **HIGH**: Cours (✅ DONE)
2. **HIGH**: Product (shopping cart, orders depend on this)
3. **MEDIUM**: Event (bookings, tickets depend on this)
4. **MEDIUM**: Challenge (submissions depend on this)
5. **LOW**: Session (less critical, bookings depend on this)
6. **LOW**: Achievement (tracking/gamification feature)

---

## Commands to Find Issues

Search for services returning `_id.toString()`:
```bash
cd /home/louay/Public/chabaqa-backend
grep -r "_id\.toString()" src/**/*.service.ts
```

Search for schemas with custom `id` field:
```bash
grep -r "id: string;" src/schema/*.ts
```

---

## Next Steps

1. Audit each service in "NEEDS FIXING" list
2. Update services to return `entity.id` instead of `entity._id.toString()`
3. Test frontend/backend ID matching for each entity type
4. Document any breaking changes for frontend team
5. Consider adding helper utility for consistent serialization

---

**Date Created:** December 17, 2025
**Last Updated:** December 17, 2025
**Status:** Cours fixed, others pending audit
