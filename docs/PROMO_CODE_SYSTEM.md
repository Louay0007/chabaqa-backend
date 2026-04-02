# Promo Code System - Complete Documentation

## Overview

The promo code system allows creators and admins to offer discounts on their content (courses, challenges, events, products, sessions, and communities). The system supports percentage-based discounts, fixed amount discounts, and various targeting options.

---

## 1. Data Model (Schema)

**File**: `backend/src/schema/promo-code.schema.ts`

```typescript
class PromoCode {
  // Unique identifier
  code: string;                    // e.g., "SUMMER20", "WELCOME50"
  
  // Discount types (can use both)
  percentOff?: number;             // e.g., 20 = 20% off
  amountOffDT?: number;            // e.g., 10 = 10 DT off
  
  // Targeting - what content this applies to
  appliesToType?: TrackableContentType;  // course, challenge, event, product, session, community
  appliesToId?: string;            // Specific content ID (null = all of that type)
  creatorId?: Types.ObjectId;      // Creator who owns this promo code
  communityId?: string;            // Associated community
  
  // Validity period
  startsAt?: Date;                 // When promo code becomes active
  endsAt?: Date;                   // When promo code expires
  
  // Usage limits
  maxRedemptions?: number;         // Maximum number of uses (null = unlimited)
  redemptionsCount: number;        // Current usage count (auto-incremented)
  
  // Access control
  isActive: boolean;               // Enable/disable the code
  allowedEmails?: string[];        // Restrict to specific emails (null = everyone)
}
```

### Supported Content Types

```typescript
enum TrackableContentType {
  COURSE = 'course',
  CHAPTER = 'chapter',
  CHALLENGE = 'challenge',
  SESSION = 'session',
  POST = 'post',
  EVENT = 'event',
  PRODUCT = 'product',
  RESOURCE = 'resource',
  COMMUNITY = 'community',
  SUBSCRIPTION = 'subscription'
}
```

---

## 2. Promo Code Options & Configuration

### Option 1: Percentage Discount

```typescript
{
  code: "SUMMER25",
  percentOff: 25,        // 25% off
  // ... other fields
}
```

**Example**: 100 DT item → 75 DT after discount

### Option 2: Fixed Amount Discount

```typescript
{
  code: "SAVE10",
  amountOffDT: 10,       // 10 DT off
  // ... other fields
}
```

**Example**: 100 DT item → 90 DT after discount

### Option 3: Combined Discount

```typescript
{
  code: "BIGDEAL",
  percentOff: 20,        // 20% off
  amountOffDT: 5,        // + 5 DT off
  // ... other fields
}
```

**Example**: 100 DT item → 100 - 20 - 5 = 75 DT after discount

### Option 4: Global Discount (All Content Types)

```typescript
{
  code: "WELCOME",
  percentOff: 15,
  appliesToType: null,   // Applies to ALL content types
  appliesToId: null,     // Applies to ALL content
}
```

### Option 5: Specific Content Type

```typescript
{
  code: "COURSE20",
  percentOff: 20,
  appliesToType: 'course',  // Only for courses
  appliesToId: null,        // All courses
}
```

### Option 6: Specific Content Item

```typescript
{
  code: "SPECIALCOURSE",
  percentOff: 30,
  appliesToType: 'course',
  appliesToId: 'abc123xyz',  // Only for this specific course
}
```

### Option 7: Time-Limited Promo

```typescript
{
  code: "WEEKEND",
  percentOff: 50,
  startsAt: new Date('2024-06-01'),  // Active from June 1st
  endsAt: new Date('2024-06-30'),    // Expires June 30th
}
```

### Option 8: Limited Uses

```typescript
{
  code: "FIRST100",
  percentOff: 100,        // 100% = free!
  maxRedemptions: 100,    // Only 100 uses
}
```

### Option 9: Email-Restricted

```typescript
{
  code: "VIP50",
  percentOff: 50,
  allowedEmails: [
    'vip@example.com',
    'premium@example.com'
  ]
  // Only these emails can use it
}
```

### Option 10: Creator-Specific

```typescript
{
  code: "CREATOR25",
  percentOff: 25,
  creatorId: 'creator_user_id',  // Only for this creator's content
}
```

---

## 3. Validation Logic

**File**: `backend/src/common/services/promo.service.ts`

### Validation Flow

```typescript
async validateAndApply(
  code: string,           // The promo code entered by user
  amountDT: number,       // Original price
  contentType: string,    // Type of content being purchased
  contentId: string,      // Specific content ID
  buyerEmail?: string     // User's email (for email restrictions)
): Promise<PromoApplyResult>
```

### Validation Checks (in order)

1. **Code Exists**: Is the code in the database?
2. **Is Active**: Is `isActive = true`?
3. **Start Date**: Has `startsAt` passed?
4. **End Date**: Has `endsAt` passed?
5. **Usage Limit**: Has `redemptionsCount` reached `maxRedemptions`?
6. **Email Restriction**: Is buyer's email in `allowedEmails`?
7. **Content Type**: Does `appliesToType` match the content type?
8. **Content ID**: Does `appliesToId` match the specific content?

### Validation Code

```typescript
// 1. Check if code exists
const promo = await this.promoModel.findOne({ code: code.trim().toUpperCase() });
if (!promo) {
  return { valid: false, reason: 'Code invalide' };
}

// 2. Check if active
if (!promo.isActive) {
  return { valid: false, reason: 'Code inactif' };
}

// 3. Check start date
if (promo.startsAt && now < promo.startsAt) {
  return { valid: false, reason: 'Code non encore actif' };
}

// 4. Check end date
if (promo.endsAt && now > promo.endsAt) {
  return { valid: false, reason: 'Code expiré' };
}

// 5. Check usage limit
if (promo.maxRedemptions && promo.redemptionsCount >= promo.maxRedemptions) {
  return { valid: false, reason: 'Limite d\'utilisations atteinte' };
}

// 6. Check email restriction
if (promo.allowedEmails?.length && buyerEmail) {
  if (!promo.allowedEmails.includes(buyerEmail.toLowerCase())) {
    return { valid: false, reason: 'Code non applicable à cet utilisateur' };
  }
}

// 7. Check content type
if (promo.appliesToType && promo.appliesToType !== contentType) {
  return { valid: false, reason: 'Code non applicable à ce type' };
}

// 8. Check specific content
if (promo.appliesToId && promo.appliesToId !== contentId) {
  return { valid: false, reason: 'Code non applicable à cet élément' };
}
```

---

## 4. Discount Calculation

### Calculation Logic

```typescript
let discountDT = 0;

// Apply percentage discount
if (promo.percentOff && promo.percentOff > 0) {
  discountDT += (amountDT * promo.percentOff) / 100;
}

// Apply fixed amount discount
if (promo.amountOffDT && promo.amountOffDT > 0) {
  discountDT += promo.amountOffDT;
}

// Calculate final amount (never negative)
const finalAmountDT = Math.max(0, amountDT - discountDT);
```

### Example Calculations

**Example 1: 20% off**
- Original: 100 DT
- Discount: 100 × 0.20 = 20 DT
- Final: 100 - 20 = 80 DT

**Example 2: 10 DT off**
- Original: 100 DT
- Discount: 10 DT
- Final: 100 - 10 = 90 DT

**Example 3: 20% + 5 DT off**
- Original: 100 DT
- Discount: (100 × 0.20) + 5 = 25 DT
- Final: 100 - 25 = 75 DT

**Example 4: 50% off (exceeds amount)**
- Original: 10 DT
- Discount: 10 × 0.50 = 5 DT
- Final: 10 - 5 = 5 DT

**Example 5: 100% off (free)**
- Original: 50 DT
- Discount: 50 × 1.00 = 50 DT
- Final: 50 - 50 = 0 DT (FREE!)

---

## 5. Usage in Payment Flow

### Backend Integration

**File**: `backend/src/common/controllers/payment.controller.ts`

```typescript
// 1. Get the original price
let amount = price;
let discountDT = 0;
let appliedCode: string | undefined;

// 2. Apply promo code if provided
if (promoCode) {
  const buyer = await this.userModel.findById(userId).select('email');
  const promo = await this.promoService.validateAndApply(
    promoCode,
    price,
    TrackableContentType.COURSE,  // or COMMUNITY, EVENT, etc.
    courseId,
    buyer?.email
  );
  
  if (promo.valid) {
    amount = promo.finalAmountDT;      // Discounted amount
    discountDT = promo.discountDT;      // Total discount
    appliedCode = promo.appliedCode;    // The code used
  }
}

// 3. Calculate fees on the DISCOUNTED amount
const breakdown = await this.feeService.calculateForAmount(amount, creatorId);

// 4. Create order with discount info
await this.orderModel.create({
  amountDT: breakdown.amountDT,      // Customer pays this (discounted)
  platformFeeDT: breakdown.platformFeeDT,
  creatorNetDT: breakdown.creatorNetDT,
  promoCode: appliedCode,            // Store the code used
  discountDT: discountDT,            // Store the discount amount
  status: 'pending',
});
```

### Frontend Integration

**File**: `frontend/app/(landing)/community/[slug]/checkout/components/checkout-form.tsx`

```typescript
const [promoCode, setPromoCode] = useState("");

// Apply promo code when initiating payment
initStripe: () => communitiesApi.initStripePayment(
  community?.id,
  promoCode || undefined,  // Pass promo code
  normalizedInviteCode || undefined,
),
```

### API Endpoints Supporting Promo Codes

| Method | Endpoint | Content Type |
|--------|----------|--------------|
| POST | `/payment/init/community` | Community membership |
| POST | `/payment/init/course` | Course enrollment |
| POST | `/payment/init/challenge` | Challenge join |
| POST | `/payment/init/event` | Event ticket |
| POST | `/payment/init/product` | Product purchase |
| POST | `/payment/init/session` | Session booking |
| POST | `/payment/stripe-link/init/*` | Stripe payments |
| POST | `/payment/manual/init/*` | Manual payments |
| POST | `/payment/konnect/init/*` | Konnect payments |

---

## 6. Order Storage

When a purchase is made with a promo code, the order stores:

```typescript
class Order {
  // ... other fields
  
  /** The promo code used (e.g., "SUMMER20") */
  promoCode?: string;
  
  /** Total discount applied (e.g., 20 DT) */
  discountDT?: number;
  
  /** What customer paid after discount (e.g., 80 DT) */
  amountDT: number;
}
```

---

## 7. Creating Promo Codes

### Current Status

⚠️ **Note**: The current system does NOT have a dedicated admin UI for creating promo codes. Promo codes must be created directly in the database.

### Manual Database Creation

```javascript
// Example: Insert directly in MongoDB
db.promoCodes.insertOne({
  code: "SUMMER25",
  percentOff: 25,
  amountOffDT: null,
  appliesToType: null,  // All content types
  appliesToId: null,    // All content
  creatorId: null,
  communityId: null,
  startsAt: null,       // Active immediately
  endsAt: null,         // No expiration
  maxRedemptions: null, // Unlimited uses
  redemptionsCount: 0,
  isActive: true,
  allowedEmails: [],    // Available to everyone
  createdAt: new Date(),
  updatedAt: new Date()
});
```

### Recommended Admin Features (Future)

To make promo code management easier, consider adding:

1. **Create Promo Code Endpoint**
   ```typescript
   POST /admin/promo-codes
   {
     code: "SUMMER25",
     percentOff: 25,
     appliesToType: "course",
     startsAt: "2024-06-01",
     endsAt: "2024-08-31",
     maxRedemptions: 100
   }
   ```

2. **List Promo Codes Endpoint**
   ```typescript
   GET /admin/promo-codes
   ```

3. **Update Promo Code Endpoint**
   ```typescript
   PUT /admin/promo-codes/:code
   ```

4. **Delete/Deactivate Endpoint**
   ```typescript
   DELETE /admin/promo-codes/:code
   ```

---

## 8. Complete Examples

### Example 1: Creator's Welcome Discount

```javascript
{
  code: "WELCOME10",
  percentOff: 10,
  amountOffDT: 0,
  appliesToType: null,      // All content types
  appliesToId: null,        // All content
  creatorId: "creator123",  // Only this creator's content
  communityId: null,
  startsAt: null,           // Active now
  endsAt: null,             // No expiration
  maxRedemptions: null,     // Unlimited
  redemptionsCount: 0,
  isActive: true,
  allowedEmails: []         // Everyone can use
}
```

**Use Case**: A creator offers 10% off all their content to attract new customers.

---

### Example 2: Specific Course Launch Discount

```javascript
{
  code: "LAUNCH50",
  percentOff: 50,
  amountOffDT: 0,
  appliesToType: "course",
  appliesToId: "course_abc123",  // Specific course
  creatorId: "creator123",
  communityId: null,
  startsAt: new Date("2024-06-01"),
  endsAt: new Date("2024-06-07"),
  maxRedemptions: 50,
  redemptionsCount: 0,
  isActive: true,
  allowedEmails: []
}
```

**Use Case**: 50% discount for the first week of a new course launch, limited to first 50 customers.

---

### Example 3: VIP Email-Only Discount

```javascript
{
  code: "VIP30",
  percentOff: 30,
  amountOffDT: 0,
  appliesToType: null,
  appliesToId: null,
  creatorId: "creator123",
  communityId: null,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  redemptionsCount: 0,
  isActive: true,
  allowedEmails: [
    "vip@example.com",
    "premium@example.com",
    "founder@example.com"
  ]
}
```

**Use Case**: Exclusive 30% discount for VIP customers, only accessible via special invitation.

---

### Example 4: Community Member Discount

```javascript
{
  code: "COMMUNITY15",
  percentOff: 15,
  amountOffDT: 0,
  appliesToType: null,
  appliesToId: null,
  creatorId: null,
  communityId: "community_xyz789",  // Specific community
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  redemptionsCount: 0,
  isActive: true,
  allowedEmails: []
}
```

**Use Case**: Discount for members of a specific community.

---

### Example 5: Fixed Amount Discount

```javascript
{
  code: "SAVE5",
  percentOff: 0,
  amountOffDT: 5,
  appliesToType: "product",
  appliesToId: null,
  creatorId: "creator123",
  communityId: null,
  startsAt: null,
  endsAt: null,
  maxRedemptions: 200,
  redemptionsCount: 0,
  isActive: true,
  allowedEmails: []
}
```

**Use Case**: 5 DT off any product, limited to 200 uses.

---

## 9. Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROMO CODE FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CUSTOMER ENTERS CODE                                        │
│     ┌─────────────────┐                                         │
│     │ Promo: SUMMER20 │                                         │
│     └────────┬────────┘                                         │
│              ↓                                                  │
│  2. BACKEND VALIDATES                                           │
│     ┌─────────────────────────────────────────┐                 │
│     │ • Code exists?                          │                 │
│     │ • Is active?                            │                 │
│     │ • Within date range?                   │                 │
│     │ • Under usage limit?                   │                 │
│     │ • Valid for this content?              │                 │
│     │ • Email allowed?                       │                 │
│     └────────┬────────────────────────────────┘                 │
│              ↓                                                  │
│  3. CALCULATE DISCOUNT                                          │
│     ┌─────────────────────────────────────────┐                 │
│     │ Original: 100 DT                        │                 │
│     │ Discount: 100 × 20% = 20 DT             │                 │
│     │ Final: 100 - 20 = 80 DT                 │                 │
│     └────────┬────────────────────────────────┘                 │
│              ↓                                                  │
│  4. CREATE ORDER                                                │
│     ┌─────────────────────────────────────────┐                 │
│     │ amountDT: 80 DT (customer pays)         │                 │
│     │ discountDT: 20 DT (discount given)      │                 │
│     │ promoCode: "SUMMER20"                   │                 │
│     │ platformFeeDT: 80 × 7.9% = 6.32 DT      │                 │
│     │ creatorNetDT: 80 - 6.32 = 73.68 DT      │                 │
│     └────────┬────────────────────────────────┘                 │
│              ↓                                                  │
│  5. CHARGE CUSTOMER                                             │
│     ┌─────────────────────────────────────────┐                 │
│     │ Customer pays: 80 DT (NOT 100 DT)       │                 │
│     │ ✅ No hidden fees                       │                 │
│     └─────────────────────────────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Summary Table

| Feature | Description |
|---------|-------------|
| **Discount Types** | Percentage (%) or Fixed Amount (DT) |
| **Targeting** | All content, specific type, or specific item |
| **Time Limits** | Start date and end date |
| **Usage Limits** | Max redemptions (or unlimited) |
| **Email Restriction** | Whitelist specific emails |
| **Creator-Specific** | Link to specific creator |
| **Community-Specific** | Link to specific community |
| **Stacking** | Both % and fixed can be combined |

---

## 11. Related Files

| File | Purpose |
|------|---------|
| `backend/src/schema/promo-code.schema.ts` | Data model |
| `backend/src/common/services/promo.service.ts` | Validation & calculation |
| `backend/src/common/controllers/payment.controller.ts` | Payment integration |
| `frontend/app/(landing)/community/[slug]/checkout/components/checkout-form.tsx` | Frontend input |

---

## 12. Future Enhancements

Potential improvements for the promo code system:

1. **Admin UI** - Create/Edit/Delete promo codes from dashboard
2. **Usage Analytics** - Track which codes are most popular
3. **Auto-Generation** - Generate random codes automatically
4. **Referral Codes** - Reward users who refer others
5. **First-Purchase Only** - Restrict to first-time buyers
6. **Bundle Discounts** - Discount for buying multiple items
7. **Tiered Discounts** - Different discounts at different price points