# Transaction Status Management Guide

## Key Questions and Answers

### 1. Idempotency Key Generation
**Q: Should we generate an idempotency key from UI? Purpose?**

**A:** Yes, generate idempotency key from UI for these reasons:
- Prevents duplicate order creation if user refreshes page
- Helps track unique booking attempts
- Allows resuming interrupted bookings

```typescript
// Frontend Implementation
const generateIdempotencyKey = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${timestamp}-${random}`;
};

// Usage in booking flow
const initiateBooking = async (bookingDetails) => {
  const idempotencyKey = generateIdempotencyKey();
  // Store in session storage for recovery
  sessionStorage.setItem('booking_idempotency_key', idempotencyKey);
  
  return await api.createBooking({
    ...bookingDetails,
    idempotencyKey
  });
};
```

### 2. Razorpay Order Storage
**Q: Where to store the Order ID?**

**A:** Store in a dedicated orders table with relationships to bookings:

```sql
CREATE TABLE razorpay_orders (
    id UUID PRIMARY KEY,
    booking_id UUID REFERENCES bookings(id),
    razorpay_order_id VARCHAR(100) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    metadata JSONB,
    idempotency_key VARCHAR(100) UNIQUE,
    CONSTRAINT valid_status CHECK (status IN (
        'CREATED', 'PAID', 'FAILED', 'EXPIRED'
    ))
);
```

### 3. Payment Attempts Tracking
**Q: How are we tracking payment attempts in 1 single order ID? Should we do it?**

**A:** Yes, track all payment attempts for audit and debugging:

```sql
CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,
    razorpay_order_id VARCHAR(100) REFERENCES razorpay_orders(razorpay_order_id),
    razorpay_payment_id VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempt_number INTEGER NOT NULL,
    payment_method VARCHAR(50),
    error_code VARCHAR(100),
    error_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT valid_status CHECK (status IN (
        'INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED'
    ))
);
```

### 4. Booking ID Generation
**Q: How will we generate the booking id?**

**A:** Use a combination of UUID and readable prefix:

```typescript
class BookingService {
  async generateBookingId(): string {
    const prefix = 'BK';
    const timestamp = Date.now().toString(36);
    const uuid = crypto.randomUUID().split('-')[0];
    const sequence = await this.getNextSequence('booking');
    
    return `${prefix}${timestamp}${sequence}${uuid}`.toUpperCase();
  }

  private async getNextSequence(type: string): Promise<string> {
    // Use database sequence
    const result = await this.db.query(
      'SELECT nextval($1)', 
      [`${type}_sequence`]
    );
    return result.rows[0].nextval.toString().padStart(6, '0');
  }
}
```

### 5. Payment Initiation API
**Q: What API to initiate a payment?**

**A:** Use Razorpay's Orders API followed by checkout:

```typescript
// Backend
class PaymentService {
  async initiatePayment(bookingId: string, amount: number): Promise<PaymentInitiation> {
    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: bookingId,
      notes: {
        bookingId: bookingId
      }
    });

    // Store order details
    await this.storeOrder(order, bookingId);

    // Return details needed for checkout
    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingId
    };
  }
}

// Frontend
const initiatePayment = async (paymentDetails) => {
  const options = {
    key: RAZORPAY_KEY_ID,
    amount: paymentDetails.amount,
    currency: paymentDetails.currency,
    order_id: paymentDetails.orderId,
    name: 'Your App Name',
    handler: handlePaymentSuccess,
    prefill: {
      email: userEmail,
      contact: userPhone
    }
  };

  const rzp = new Razorpay(options);
  rzp.open();
};
```

### 6. Lock Timeout Tracking
**Q: How do we track the lock timeout?**

**A:** Use Redis for slot locking with expiration:

```typescript
class SlotLockManager {
  private readonly LOCK_TIMEOUT = 900; // 15 minutes in seconds

  async lockSlots(matchId: string, slots: number[], bookingId: string): Promise<boolean> {
    const key = `match:${matchId}:slots`;
    const lockKey = `booking:${bookingId}:lock`;

    // Use Redis transaction
    const result = await this.redis.multi()
      // Check if slots are available
      .sismember(key, ...slots)
      // Set lock with expiration
      .set(lockKey, JSON.stringify(slots), 'EX', this.LOCK_TIMEOUT)
      .exec();

    return result[1] === 'OK';
  }

  async releaseLock(bookingId: string): Promise<void> {
    const lockKey = `booking:${bookingId}:lock`;
    await this.redis.del(lockKey);
  }

  // Cleanup job for expired locks
  async cleanupExpiredLocks(): Promise<void> {
    const pattern = 'booking:*:lock';
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl <= 0) {
        const bookingId = key.split(':')[1];
        await this.handleExpiredLock(bookingId);
      }
    }
  }
}
```

### 7. Payment Attempt Storage
**Q: Where are storing the payment attempt in DB?**

**A:** Store in payment_attempts table with comprehensive tracking:

```sql
CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,
    booking_id UUID REFERENCES bookings(id),
    razorpay_order_id VARCHAR(100) NOT NULL,
    razorpay_payment_id VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL,
    payment_method VARCHAR(50),
    error_details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSONB,
    retry_count INTEGER DEFAULT 0,
    parent_attempt_id UUID REFERENCES payment_attempts(id),
    CONSTRAINT valid_status CHECK (status IN (
        'INITIATED', 'PROCESSING', 'COMPLETED',
        'FAILED', 'EXPIRED', 'CANCELLED'
    ))
);
```

### 8. Payment Signature Verification
**Q: How do we verify Payment Signatures on UI, backend and through webhook?**

**A:** Implement verification at all three levels:

```typescript
// 1. Frontend Verification
const verifyPaymentFrontend = (response: RazorpayResponse) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = response;
  
  // Send to backend for verification
  return api.verifyPayment({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature
  });
};

// 2. Backend Verification
class PaymentVerification {
  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    const text = `${orderId}|${paymentId}`;
    const generated_signature = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(text)
      .digest('hex');
    
    return generated_signature === signature;
  }

  // 3. Webhook Verification
  verifyWebhookSignature(
    body: string,
    signature: string,
    secret: string
  ): boolean {
    const expected_signature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    
    return expected_signature === signature;
  }
}
```

### 9. Idempotency Verification
**Q: How do we verify payment hasn't been processed before (idempotency)?**

**A:** Use multiple checks:

```typescript
class IdempotencyManager {
  async checkIdempotency(
    paymentId: string,
    orderId: string
  ): Promise<boolean> {
    // 1. Check payment_attempts table
    const existingPayment = await this.paymentRepo.findByPaymentId(paymentId);
    if (existingPayment) {
      return true;
    }

    // 2. Check order status
    const order = await this.orderRepo.findByOrderId(orderId);
    if (order.status === 'PAID') {
      return true;
    }

    // 3. Check idempotency key
    const idempotencyKey = await this.getIdempotencyKey(orderId);
    return await this.checkIdempotencyKeyUsed(idempotencyKey);
  }
}
```

### 10. Partial Cancellation Status
**Q: What if in a success booking, user partially cancels the slots, and till the time user refund is not completed, what would be the status?**

**A:** Use dual status tracking:

```sql
-- Booking status will track overall booking state
ALTER TABLE bookings
    ADD COLUMN refund_status VARCHAR(20),
    ADD CONSTRAINT valid_refund_status CHECK (
        refund_status IN (
            'REFUND_PENDING',
            'REFUND_PROCESSING',
            'REFUND_COMPLETED',
            'REFUND_FAILED'
        )
    );

-- Track individual slot status
CREATE TABLE booking_slots (
    id UUID PRIMARY KEY,
    booking_id UUID REFERENCES bookings(id),
    slot_number INTEGER,
    status VARCHAR(20) NOT NULL,
    refund_status VARCHAR(20),
    refund_amount DECIMAL(10,2),
    cancelled_at TIMESTAMP,
    refunded_at TIMESTAMP,
    CONSTRAINT valid_slot_status CHECK (
        status IN (
            'ACTIVE',
            'CANCELLED_REFUND_PENDING',
            'CANCELLED_REFUNDED'
        )
    )
);
```

## Status Flow for Partial Cancellation:

1. **Initial Successful Booking:**
   - Booking status: `CONFIRMED`
   - All slots status: `ACTIVE`
   - Refund status: `NULL`

2. **After Partial Cancellation Request:**
   - Booking status: `PARTIALLY_CANCELLED`
   - Cancelled slots status: `CANCELLED_REFUND_PENDING`
   - Active slots status: `ACTIVE`
   - Refund status: `REFUND_PENDING`

3. **During Refund Processing:**
   - Booking status: `PARTIALLY_CANCELLED`
   - Cancelled slots status: `CANCELLED_REFUND_PENDING`
   - Active slots status: `ACTIVE`
   - Refund status: `REFUND_PROCESSING`

4. **After Refund Complete:**
   - Booking status: `PARTIALLY_CANCELLED`
   - Cancelled slots status: `CANCELLED_REFUNDED`
   - Active slots status: `ACTIVE`
   - Refund status: `REFUND_COMPLETED`

```typescript
interface BookingManager {
  async handlePartialCancellation(
    bookingId: string,
    slotIds: string[]
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      // Update booking status
      await this.bookingRepo.updateStatus(
        bookingId,
        'PARTIALLY_CANCELLED',
        trx
      );

      // Update slot statuses
      await this.slotRepo.updateSlotStatus(
        slotIds,
        'CANCELLED_REFUND_PENDING',
        trx
      );

      // Initiate refund
      await this.refundService.initiateRefund(
        bookingId,
        slotIds,
        trx
      );
    });
  }
}
```

## Implementation Guidelines

1. **Always use transactions** for status updates
2. **Maintain audit logs** for all status changes
3. **Implement status change notifications**
4. **Regular reconciliation** of all statuses
5. **Monitor refund processing** times
6. **Alert on stuck statuses**

Would you like me to elaborate on any of these aspects or add more implementation details?
