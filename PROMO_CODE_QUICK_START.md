# Promo Code System - Quick Start Guide

## 🚀 Quick Start

### For Creators

#### Create a Promo Code
```bash
POST /api/promo-codes
Authorization: Bearer YOUR_TOKEN

{
  "code": "SUMMER25",
  "percentOff": 25
}
```

#### View My Codes
```bash
GET /api/promo-codes/my-codes
Authorization: Bearer YOUR_TOKEN
```

#### Get Statistics
```bash
GET /api/promo-codes/code/SUMMER25/stats
Authorization: Bearer YOUR_TOKEN
```

---

### For Admins

#### View All Promo Codes
```bash
GET /api/admin/promo-codes?page=1&limit=20
Authorization: Bearer YOUR_ADMIN_TOKEN
```

#### Filter by Creator
```bash
GET /api/admin/promo-codes?creatorId=507f1f77bcf86cd799439011
Authorization: Bearer YOUR_ADMIN_TOKEN
```

#### See Who Used a Code
```bash
GET /api/admin/promo-codes/code/SUMMER25/usage
Authorization: Bearer YOUR_ADMIN_TOKEN
```

---

## 📋 Common Scenarios

### 1. 25% Off Everything
```json
{
  "code": "SAVE25",
  "percentOff": 25
}
```

### 2. 10 DT Off Courses
```json
{
  "code": "COURSE10",
  "amountOffDT": 10,
  "appliesToType": "course"
}
```

### 3. Limited Time Offer
```json
{
  "code": "FLASH50",
  "percentOff": 50,
  "startsAt": "2024-06-01T00:00:00.000Z",
  "endsAt": "2024-06-07T23:59:59.999Z",
  "maxRedemptions": 100
}
```

### 4. VIP Only
```json
{
  "code": "VIP30",
  "percentOff": 30,
  "allowedEmails": ["vip@example.com"]
}
```

---

## 🔍 Check Code Performance

```bash
# Get statistics
GET /api/promo-codes/code/SUMMER25/stats

# Response:
{
  "totalUses": 45,
  "totalRevenue": 3600,
  "totalDiscounts": 900,
  "remainingUses": 55
}
```

---

## 📊 View Usage Details

```bash
# See who used the code
GET /api/promo-codes/code/SUMMER25/usage?page=1&limit=20

# Response:
{
  "data": [
    {
      "buyerEmail": "user@example.com",
      "originalAmount": 100,
      "discountAmount": 25,
      "finalAmount": 75,
      "usedAt": "2024-06-15T14:30:00.000Z"
    }
  ]
}
```

---

## ⚙️ Update a Code

```bash
PUT /api/promo-codes/code/SUMMER25

{
  "percentOff": 30,
  "maxRedemptions": 150
}
```

---

## 🗑️ Delete a Code

```bash
DELETE /api/promo-codes/code/SUMMER25
```

---

## 📚 Full Documentation

- **System Overview**: `backend/docs/PROMO_CODE_SYSTEM.md`
- **API Reference**: `backend/docs/PROMO_CODE_API.md`
- **Implementation**: `backend/docs/PROMO_CODE_IMPLEMENTATION_SUMMARY.md`
