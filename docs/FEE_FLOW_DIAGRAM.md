# Fee Calculation Flow Diagram

## Visual Representation

### ✅ CORRECT Implementation (Current System)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER PERSPECTIVE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Sees Price: 50 DT                                              │
│  Pays: 50 DT ✅                                                  │
│                                                                  │
│  No surprises, no hidden fees!                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                            ↓ Payment: 50 DT

┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM PROCESSING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Received: 50 DT                                                │
│                                                                  │
│  Fee Calculation (7.9% for Starter plan):                       │
│    platformFeeDT = 50 × 0.079 = 3.95 DT                         │
│    creatorNetDT = 50 - 3.95 = 46.05 DT                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                    ↓                           ↓
              3.95 DT                      46.05 DT

┌──────────────────────────┐    ┌──────────────────────────┐
│   PLATFORM REVENUE       │    │   CREATOR EARNINGS       │
├──────────────────────────┤    ├──────────────────────────┤
│                          │    │                          │
│  Receives: 3.95 DT       │    │  Receives: 46.05 DT      │
│  (7.9% of 50 DT)         │    │  (92.1% of 50 DT)        │
│                          │    │                          │
└──────────────────────────┘    └──────────────────────────┘
```

### ❌ WRONG Implementation (NOT Used)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER PERSPECTIVE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Sees Price: 50 DT                                              │
│  Pays: 53.95 DT ❌ (50 + 3.95 fee)                              │
│                                                                  │
│  Surprise fees! Customer confused!                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                         ↓ Payment: 53.95 DT

┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM PROCESSING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Received: 53.95 DT                                             │
│  Platform takes: 3.95 DT                                        │
│  Creator gets: 50 DT                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                    ↓                           ↓
              3.95 DT                       50 DT

┌──────────────────────────┐    ┌──────────────────────────┐
│   PLATFORM REVENUE       │    │   CREATOR EARNINGS       │
├──────────────────────────┤    ├──────────────────────────┤
│                          │    │                          │
│  Receives: 3.95 DT       │    │  Receives: 50 DT         │
│                          │    │  (Full price)            │
│                          │    │                          │
└──────────────────────────┘    └──────────────────────────┘

⚠️ This model is NOT implemented in the system
```

## Complete Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Content Pricing                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Creator sets price: 100 DT                                     │
│  Customer sees: 100 DT                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Promo Code (Optional)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Promo: 20% off                                                 │
│  Discount: 20 DT                                                │
│  New price: 80 DT                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Fee Calculation                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FeeService.calculateForAmount(80 DT, creatorId)                │
│                                                                  │
│  Creator Plan: Growth (4.9% fee)                                │
│  platformFeeDT = 80 × 0.049 = 3.92 DT                           │
│  creatorNetDT = 80 - 3.92 = 76.08 DT                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Order Creation                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Order {                                                        │
│    amountDT: 80,           // Customer pays                     │
│    platformFeeDT: 3.92,    // Platform takes                    │
│    creatorNetDT: 76.08,    // Creator receives                  │
│    discountDT: 20,         // Promo discount                    │
│    status: 'pending'                                            │
│  }                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Payment Processing                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Charge customer: 80 DT ✅                                       │
│  (NOT 80 + 3.92 = 83.92 DT)                                     │
│                                                                  │
│  Payment Provider: Stripe/Flouci/Konnect                        │
│  Amount charged: breakdown.amountDT                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: Payment Success                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Order status: 'paid'                                           │
│  Customer charged: 80 DT                                        │
│  Platform earned: 3.92 DT                                       │
│  Creator earned: 76.08 DT                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: Payout (Later)                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Creator requests payout                                        │
│  Available balance = sum(orders.creatorNetDT) - sum(payouts)   │
│  Available balance = 76.08 DT (from this order)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Fee Comparison by Plan

```
Purchase Amount: 100 DT
═══════════════════════════════════════════════════════════════

┌─────────────┬──────────┬──────────────┬─────────────────┐
│    Plan     │ Fee Rate │ Platform Fee │ Creator Receives│
├─────────────┼──────────┼──────────────┼─────────────────┤
│ No Plan     │ 9.0%+0.5 │   9.50 DT    │    90.50 DT     │
│ Starter     │ 7.9%     │   7.90 DT    │    92.10 DT     │
│ Growth      │ 4.9%     │   4.90 DT    │    95.10 DT     │
│ Pro         │ 2.9%     │   2.90 DT    │    97.10 DT     │
└─────────────┴──────────┴──────────────┴─────────────────┘

Customer always pays: 100 DT (regardless of plan)
```

## Key Principles

### ✅ DO (Current Implementation)

1. **Display the final price to customer**
   - Show exactly what they will pay
   - Include any discounts in the displayed price

2. **Charge exactly the displayed price**
   - No hidden fees
   - No surprises at checkout

3. **Deduct platform fee from payment**
   - Fee comes out of the payment
   - Creator receives payment minus fee

4. **Be transparent with creators**
   - Show them the fee rate for their plan
   - Display net earnings clearly

### ❌ DON'T (Not Implemented)

1. **Don't add fees to customer payment**
   - Never charge more than displayed price
   - No "processing fees" added at checkout

2. **Don't hide fee calculations**
   - Always show creators their net earnings
   - Make fee structure clear

3. **Don't charge creators separately**
   - Fees are deducted from transactions
   - No separate billing for platform fees

## Code Reference

### Fee Calculation

```typescript
// backend/src/common/services/fee.service.ts

async calculateForAmount(amountDT: number, creatorId: string) {
  const percent = plan.transactionFeePercent; // 7.9 for Starter
  const fixed = plan.transactionFixedFeeDT;   // 0 for most plans
  
  // Fee is calculated FROM the amount
  const platformFeeDT = (amountDT * percent / 100) + fixed;
  
  // Creator receives amount MINUS fee
  const creatorNetDT = amountDT - platformFeeDT;
  
  return {
    amountDT,        // What customer pays
    platformFeeDT,   // What platform takes
    creatorNetDT     // What creator receives
  };
}
```

### Payment Processing

```typescript
// backend/src/common/controllers/payment.controller.ts

// Calculate fees
const breakdown = await feeService.calculateForAmount(price, creatorId);

// Create order
await orderModel.create({
  amountDT: breakdown.amountDT,           // Customer pays this
  platformFeeDT: breakdown.platformFeeDT, // Platform takes this
  creatorNetDT: breakdown.creatorNetDT    // Creator receives this
});

// Charge customer EXACTLY amountDT (not amountDT + fee)
await paymentProvider.charge(breakdown.amountDT);
```

## Summary

✅ **Customer pays exactly the displayed price**
✅ **Platform fee is deducted from the payment**
✅ **Creator receives payment minus platform fee**
✅ **No hidden fees or surprises**
✅ **Transparent and fair for all parties**

---

**System Status**: ✅ Correctly Implemented
**Customer Experience**: ✅ Transparent Pricing
**Creator Experience**: ✅ Clear Fee Structure
