# Promo Code API Documentation

## Overview

Complete API documentation for the promo code management system. This system allows creators and admins to create, manage, and track promotional discount codes.

---

## Authentication

All endpoints require JWT authentication via Bearer token:

```
Authorization: Bearer <your_jwt_token>
```

---

## Creator Endpoints

Base URL: `/api/promo-codes`

### 1. Create Promo Code

**POST** `/api/promo-codes`

Create a new promo code as a creator.

**Request Body:**
```json
{
  "code": "SUMMER25",
  "percentOff": 25,
  "amountOffDT": 0,
  "appliesToType": "course",
  "appliesToId": null,
  "startsAt": "2024-06-01T00:00:00.000Z",
  "endsAt": "2024-08-31T23:59:59.999Z",
  "maxRedemptions": 100,
  "isActive": true,
  "allowedEmails": []
}
```

**Response:** `201 Created`
```json
{
  "id": "507f1f77bcf86cd799439011",
  "code": "SUMMER25",
  "percentOff": 25,
  "appliesToType": "course",
  "startsAt": "2024-06-01T00:00:00.000Z",
  "endsAt": "2024-08-31T23:59:59.999Z",
  "maxRedemptions": 100,
  "redemptionsCount": 0,
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### 2. Get My Promo Codes

**GET** `/api/promo-codes/my-codes`

Get all promo codes created by the current user.

**Response:** `200 OK`
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "code": "SUMMER25",
    "percentOff": 25,
    "redemptionsCount": 45,
    "maxRedemptions": 100,
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]
```

---

### 3. Get Promo Code by Code

**GET** `/api/promo-codes/code/:code`

Get details of a specific promo code.

**Parameters:**
- `code` (path): Promo code (e.g., "SUMMER25")

**Response:** `200 OK`
```json
{
  "id": "507f1f77bcf86cd799439011",
  "code": "SUMMER25",
  "percentOff": 25,
  "appliesToType": "course",
  "redemptionsCount": 45,
  "maxRedemptions": 100,
  "isActive": true
}
```

---

### 4. Update Promo Code

**PUT** `/api/promo-codes/code/:code`

Update an existing promo code.

**Parameters:**
- `code` (path): Promo code to update

**Request Body:**
```json
{
  "percentOff": 30,
  "maxRedemptions": 150,
  "isActive": true
}
```

**Response:** `200 OK`
```json
{
  "id": "507f1f77bcf86cd799439011",
  "code": "SUMMER25",
  "percentOff": 30,
  "maxRedemptions": 150,
  "redemptionsCount": 45,
  "isActive": true
}
```

---

### 5. Delete Promo Code

**DELETE** `/api/promo-codes/code/:code`

Delete a promo code.

**Parameters:**
- `code` (path): Promo code to delete

**Response:** `200 OK`
```json
{
  "message": "Promo code \"SUMMER25\" deleted successfully"
}
```

---

### 6. Get Promo Code Statistics

**GET** `/api/promo-codes/code/:code/stats`

Get usage statistics for a promo code.

**Parameters:**
- `code` (path): Promo code

**Response:** `200 OK`
```json
{
  "code": "SUMMER25",
  "totalUses": 45,
  "totalRevenue": 3600,
  "totalDiscounts": 900,
  "averageDiscount": 20,
  "maxRedemptions": 100,
  "remainingUses": 55,
  "isActive": true,
  "startsAt": "2024-06-01T00:00:00.000Z",
  "endsAt": "2024-08-31T23:59:59.999Z"
}
```

---

### 7. Get Promo Code Usage

**GET** `/api/promo-codes/code/:code/usage`

Get all users who used a specific promo code.

**Parameters:**
- `code` (path): Promo code
- `page` (query, optional): Page number (default: 1)
- `limit` (query, optional): Items per page (default: 20)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "orderId": "507f1f77bcf86cd799439012",
      "buyerId": "507f1f77bcf86cd799439013",
      "buyerEmail": "user@example.com",
      "buyerName": "John Doe",
      "originalAmount": 100,
      "discountAmount": 25,
      "finalAmount": 75,
      "contentType": "course",
      "contentId": "507f1f77bcf86cd799439014",
      "usedAt": "2024-06-15T14:30:00.000Z",
      "orderStatus": "paid"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

## Admin Endpoints

Base URL: `/api/admin/promo-codes`

**Required Role:** `admin` or `superadmin`

### 1. Get All Promo Codes (Admin)

**GET** `/api/admin/promo-codes`

Get all promo codes with filtering.

**Query Parameters:**
- `creatorId` (optional): Filter by creator ID
- `communityId` (optional): Filter by community ID
- `isActive` (optional): Filter by active status (true/false)
- `appliesToType` (optional): Filter by content type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "code": "SUMMER25",
      "percentOff": 25,
      "creatorId": "507f1f77bcf86cd799439015",
      "redemptionsCount": 45,
      "maxRedemptions": 100,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

---

### 2. Create Promo Code (Admin)

**POST** `/api/admin/promo-codes`

Create a new promo code as admin (can set any creator).

**Request Body:**
```json
{
  "code": "ADMIN50",
  "percentOff": 50,
  "creatorId": "507f1f77bcf86cd799439015",
  "appliesToType": null,
  "maxRedemptions": 50,
  "isActive": true
}
```

**Response:** `201 Created`

---

### 3. Get Promo Codes by Creator (Admin)

**GET** `/api/admin/promo-codes/creator/:creatorId`

Get all promo codes for a specific creator.

**Parameters:**
- `creatorId` (path): Creator user ID

**Response:** `200 OK`
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "code": "SUMMER25",
    "percentOff": 25,
    "redemptionsCount": 45,
    "isActive": true
  }
]
```

---

### 4. Other Admin Endpoints

All creator endpoints are also available under `/api/admin/promo-codes` with admin privileges:

- **GET** `/api/admin/promo-codes/code/:code` - Get by code
- **GET** `/api/admin/promo-codes/:id` - Get by ID
- **PUT** `/api/admin/promo-codes/code/:code` - Update
- **DELETE** `/api/admin/promo-codes/code/:code` - Delete
- **GET** `/api/admin/promo-codes/code/:code/stats` - Get stats
- **GET** `/api/admin/promo-codes/code/:code/usage` - Get usage

---

## Request/Response Models

### CreatePromoCodeDto

```typescript
{
  code: string;                    // Required, 3-50 chars
  percentOff?: number;             // Optional, 0-100
  amountOffDT?: number;            // Optional, >= 0
  appliesToType?: string;          // Optional, content type
  appliesToId?: string;            // Optional, content ID
  creatorId?: string;              // Optional, creator ID
  communityId?: string;            // Optional, community ID
  startsAt?: string;               // Optional, ISO 8601 date
  endsAt?: string;                 // Optional, ISO 8601 date
  maxRedemptions?: number;         // Optional, >= 1
  isActive?: boolean;              // Optional, default: true
  allowedEmails?: string[];        // Optional, email whitelist
}
```

### UpdatePromoCodeDto

```typescript
{
  percentOff?: number;
  amountOffDT?: number;
  appliesToType?: string;
  appliesToId?: string;
  startsAt?: string;
  endsAt?: string;
  maxRedemptions?: number;
  isActive?: boolean;
  allowedEmails?: string[];
}
```

### PromoCodeResponseDto

```typescript
{
  id: string;
  code: string;
  percentOff?: number;
  amountOffDT?: number;
  appliesToType?: string;
  appliesToId?: string;
  creatorId?: string;
  communityId?: string;
  startsAt?: Date;
  endsAt?: Date;
  maxRedemptions?: number;
  redemptionsCount: number;
  isActive: boolean;
  allowedEmails?: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "At least one discount type (percentOff or amountOffDT) must be provided",
  "error": "Bad Request"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Promo code \"SUMMER25\" not found",
  "error": "Not Found"
}
```

### 409 Conflict
```json
{
  "statusCode": 409,
  "message": "Promo code \"SUMMER25\" already exists",
  "error": "Conflict"
}
```

---

## Usage Examples

### Example 1: Create a 25% Off Code for All Courses

```bash
curl -X POST https://api.example.com/api/promo-codes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "COURSE25",
    "percentOff": 25,
    "appliesToType": "course"
  }'
```

### Example 2: Create a Limited-Time 50% Off Code

```bash
curl -X POST https://api.example.com/api/promo-codes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "FLASH50",
    "percentOff": 50,
    "startsAt": "2024-06-01T00:00:00.000Z",
    "endsAt": "2024-06-07T23:59:59.999Z",
    "maxRedemptions": 100
  }'
```

### Example 3: Create a VIP Email-Only Code

```bash
curl -X POST https://api.example.com/api/promo-codes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "VIP30",
    "percentOff": 30,
    "allowedEmails": ["vip@example.com", "premium@example.com"]
  }'
```

### Example 4: Get Usage Statistics

```bash
curl -X GET https://api.example.com/api/promo-codes/code/SUMMER25/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Example 5: Deactivate a Promo Code

```bash
curl -X PUT https://api.example.com/api/promo-codes/code/SUMMER25 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'
```

---

## Integration with Payment Flow

When a customer uses a promo code during checkout:

1. **Frontend** sends promo code as query parameter:
   ```
   POST /api/payment/init/course?promoCode=SUMMER25
   ```

2. **Backend** validates and applies the promo code:
   - Checks if code exists and is active
   - Validates date range, usage limits, email restrictions
   - Calculates discount
   - Creates order with discounted amount

3. **After successful payment**, the system:
   - Increments `redemptionsCount` for the promo code
   - Stores promo code and discount in the order record

---

## Best Practices

1. **Code Naming**: Use clear, memorable codes (e.g., "SUMMER25", "WELCOME10")
2. **Expiration**: Always set end dates for promotional codes
3. **Usage Limits**: Set `maxRedemptions` to prevent abuse
4. **Testing**: Test codes before sharing with customers
5. **Monitoring**: Regularly check usage statistics
6. **Deactivation**: Deactivate expired or problematic codes instead of deleting

---

## Related Documentation

- [Promo Code System Overview](./PROMO_CODE_SYSTEM.md)
- [Fee Calculation Guide](./FEE_CALCULATION.md)
- [Payment API Documentation](./PAYMENT_API.md)
