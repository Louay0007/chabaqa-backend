# Fee Calculation System

## Overview

The platform uses a **fee deduction model** where fees are taken from the payment amount, NOT added on top. This ensures customers pay exactly the displayed price.

## How It Works

### Example: 50 DT Purchase with 7.9% Fee (Starter Plan)

```
Customer sees price: 50 DT
Customer pays: 50 DT (exactly)
Platform fee: 50 × 0.079 = 3.95 DT
Creator receives: 50 - 3.95 = 46.05 DT
```

### Formula

```typescript
platformFeeDT = (amountDT × platformPercent / 100) + platformFixedDT
creatorNetDT = amountDT - platformFeeDT
```

**Key Point:** The customer NEVER pays `amountDT + platformFeeDT`. They pay exactly `amountDT`.

## Fee Rates by Plan

| Plan | Transaction Fee | Fixed Fee | Example (50 DT) |
|------|----------------|-----------|-----------------|
| **No Plan** | 9.0% | 0.5 DT | Creator gets: 45.00 DT |
| **Starter** | 7.9% | 0 DT | Creator gets: 46.05 DT |
| **Growth** | 4.9% | 0 DT | Creator gets: 47.55 DT |
| **Pro** | 2.9% | 0 DT | Creator gets: 48.55 DT |

## Implementation

### Backend Service

Located in: `backend/src/common/services/fee.service.ts`

```typescript
async calculateForAmount(amountDT: number, creatorId: string): Promise<FeeBreakdown> {
  // Get creator's plan to determine fee rate
  const sub = await this.subModel.findOne({ creatorId });
  const plan = await this.planModel.findOne({ tier: sub.plan });
  
  const percent = plan.transactionFeePercent; // e.g., 7.9
  const fixed = plan.transactionFixedFeeDT;   // e.g., 0
  
  // Calculate fee
  const platformFeeDT = (amountDT * percent / 100) + fixed;
  
  // Creator receives amount MINUS fee
  const creatorNetDT = amountDT - platformFeeDT;
  
  return { amountDT, platformFeeDT, creatorNetDT };
}
```

### Usage in Payment Flow

1. **Customer initiates purchase** for content priced at X DT
2. **Promo code applied** (if any): `finalAmount = X - discount`
3. **Fee calculation**: `breakdown = calculateForAmount(finalAmount, creatorId)`
4. **Order created** with:
   - `amountDT`: What customer pays (finalAmount)
   - `platformFeeDT`: Platform's share
   - `creatorNetDT`: Creator's earnings
5. **Payment processed** for exactly `amountDT`

### Example Flow

```typescript
// Content price: 100 DT
// Promo code: 20% off
// Creator plan: Starter (7.9% fee)

const price = 100;
const discount = 20; // 20% off
const finalAmount = price - discount; // 80 DT

const breakdown = await feeService.calculateForAmount(80, creatorId);
// Result:
// {
//   amountDT: 80,           // Customer pays 80 DT
//   platformFeeDT: 6.32,    // Platform takes 6.32 DT
//   creatorNetDT: 73.68     // Creator receives 73.68 DT
// }

// Customer is charged: 80 DT (NOT 80 + 6.32 = 86.32)
```

## Order Schema

```typescript
class Order {
  amountDT: number;        // Total paid by customer
  platformPercent: number; // Fee percentage applied
  platformFixedDT: number; // Fixed fee applied
  platformFeeDT: number;   // Total platform fee
  creatorNetDT: number;    // Creator's earnings (amountDT - platformFeeDT)
  discountDT: number;      // Discount from promo code
}
```

## Payout Calculation

When creators request payouts, the system calculates available balance:

```typescript
// Sum all creator earnings from paid orders
const totalEarnings = sum(orders.where(status='paid').creatorNetDT);

// Subtract already paid/pending payouts
const totalPayouts = sum(payouts.where(status in ['completed', 'pending', 'scheduled']).amount);

// Available balance
const availableBalance = totalEarnings - totalPayouts;
```

## Important Notes

1. **Customer Perspective**: Always pays the displayed price, never more
2. **Creator Perspective**: Receives price minus platform fee
3. **Platform Revenue**: Comes from the fee deducted from each transaction
4. **Promo Codes**: Applied BEFORE fee calculation
5. **Fee Rates**: Determined by creator's subscription plan tier

## Verification

To verify the system is working correctly:

1. Check `FeeService.calculateForAmount()` - should subtract fees from amount
2. Check all payment controllers - should use `breakdown.amountDT` as charge amount
3. Check order creation - should store `creatorNetDT = amountDT - platformFeeDT`
4. Check payout calculations - should sum `creatorNetDT` values

## Related Files

- `backend/src/common/services/fee.service.ts` - Fee calculation logic
- `backend/src/common/controllers/payment.controller.ts` - Payment processing
- `backend/src/schema/order.schema.ts` - Order data model
- `backend/src/payout/payout.service.ts` - Payout calculations
- `backend/scripts/seed-plans.ts` - Plan fee configuration
