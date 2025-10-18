# Detailed Transaction Status Management Guide

## Table of Contents
1. [Idempotency Implementation](#idempotency-implementation)
2. [Order and Payment Management](#order-and-payment-management)
3. [Booking System](#booking-system)
4. [Status Tracking](#status-tracking)
5. [Security Measures](#security-measures)

## Idempotency Implementation

### 1. Frontend Idempotency
```typescript
interface IdempotencyService {
  // Generate unique key for each booking attempt
  generateBookingKey(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const userIdentifier = getUserIdentifier(); // e.g., user ID or session ID
    return `BK-${userIdentifier}-${timestamp}-${random}`;
  }

  // Store idempotency key in session
  storeIdempotencyKey(key: string, context: string): void {
    const storageKey = `idempotency_${context}`;
    const existingKeys = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    existingKeys[key] = {
      timestamp: Date.now(),
      context,
      used: false
    };
    sessionStorage.setItem(storageKey, JSON.stringify(existingKeys));
  }

  // Check if key was already used
  isKeyUsed(key: string, context: string): boolean {
    const storageKey = `idempotency_${context}`;
    const existingKeys = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    return existingKeys[key]?.used || false;
  }

  // Mark key as used
  markKeyAsUsed(key: string, context: string): void {
    const storageKey = `idempotency_${context}`;
    const existingKeys = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    if (existingKeys[key]) {
      existingKeys[key].used = true;
      existingKeys[key].usedAt = Date.now();
    }
    sessionStorage.setItem(storageKey, JSON.stringify(existingKeys));
  }
}
```

### 2. Backend Idempotency
```typescript
interface BackendIdempotencyService {
  // Store idempotency record
  async storeIdempotencyRecord(
    key: string,
    context: IdempotencyContext
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const existing = await this.idempotencyRepo.findByKey(key, trx);
      if (!existing) {
        await this.idempotencyRepo.create({
          key,
          context,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }, trx);
      }
    });
  }

  // Check and acquire idempotency lock
  async acquireIdempotencyLock(
    key: string,
    context: IdempotencyContext
  ): Promise<boolean> {
    return await this.db.transaction(async (trx) => {
      const record = await this.idempotencyRepo.findByKeyForUpdate(key, trx);
      if (!record || record.used) {
        return false;
      }
      
      await this.idempotencyRepo.markAsUsed(key, trx);
      return true;
    });
  }

  // Release idempotency lock if operation fails
  async releaseIdempotencyLock(
    key: string,
    context: IdempotencyContext
  ): Promise<void> {
    await this.idempotencyRepo.markAsUnused(key);
  }
}
```

## Order and Payment Management

### 1. Order Creation and Storage
```typescript
interface OrderManager {
  // Create Razorpay order
  async createOrder(
    bookingDetails: BookingDetails,
    idempotencyKey: string
  ): Promise<RazorpayOrder> {
    // Check idempotency
    const existingOrder = await this.orderRepo.findByIdempotencyKey(idempotencyKey);
    if (existingOrder) {
      return existingOrder;
    }

    // Create order in Razorpay
    const order = await razorpay.orders.create({
      amount: bookingDetails.amount * 100,
      currency: 'INR',
      receipt: bookingDetails.bookingId,
      notes: {
        bookingId: bookingDetails.bookingId,
        idempotencyKey,
        userEmail: bookingDetails.email,
        slots: JSON.stringify(bookingDetails.slots)
      }
    });

    // Store order details
    await this.db.transaction(async (trx) => {
      await this.orderRepo.create({
        razorpay_order_id: order.id,
        booking_id: bookingDetails.bookingId,
        amount: bookingDetails.amount,
        currency: 'INR',
        status: 'CREATED',
        metadata: {
          slots: bookingDetails.slots,
          userEmail: bookingDetails.email,
          idempotencyKey
        }
      }, trx);
    });

    return order;
  }

  // Track order status
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    metadata?: any
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const order = await this.orderRepo.findByIdForUpdate(orderId, trx);
      if (!order) {
        throw new Error('Order not found');
      }

      // Update status with audit
      await this.orderRepo.updateStatus(orderId, status, metadata, trx);
      await this.auditRepo.logOrderStatusChange(orderId, order.status, status, trx);
    });
  }
}
```

### 2. Payment Attempt Tracking
```typescript
interface PaymentTracker {
  // Track new payment attempt
  async trackPaymentAttempt(
    orderId: string,
    paymentDetails: PaymentInitiation
  ): Promise<PaymentAttempt> {
    return await this.db.transaction(async (trx) => {
      const order = await this.orderRepo.findById(orderId, trx);
      if (!order) {
        throw new Error('Order not found');
      }

      // Create payment attempt record
      const attempt = await this.paymentAttemptRepo.create({
        razorpay_order_id: orderId,
        amount: order.amount,
        status: 'INITIATED',
        attempt_number: await this.getNextAttemptNumber(orderId, trx),
        metadata: paymentDetails
      }, trx);

      // Update order status
      await this.orderRepo.updateStatus(orderId, 'PAYMENT_INITIATED', trx);

      return attempt;
    });
  }

  // Update payment attempt status
  async updatePaymentAttemptStatus(
    paymentId: string,
    status: PaymentStatus,
    metadata?: any
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const attempt = await this.paymentAttemptRepo.findByPaymentId(paymentId, trx);
      if (!attempt) {
        throw new Error('Payment attempt not found');
      }

      // Update status with audit
      await this.paymentAttemptRepo.updateStatus(paymentId, status, metadata, trx);
      await this.auditRepo.logPaymentStatusChange(
        paymentId, 
        attempt.status, 
        status, 
        trx
      );
    });
  }
}
```

## Booking System

### 1. Booking ID Generation
```typescript
interface BookingIdGenerator {
  // Generate unique booking ID
  async generateBookingId(): Promise<string> {
    const prefix = 'BK';
    const timestamp = Date.now().toString(36).toUpperCase();
    const sequence = await this.getNextBookingSequence();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();

    return `${prefix}${timestamp}${sequence}${random}`;
  }

  // Get next sequence number
  private async getNextBookingSequence(): Promise<string> {
    const result = await this.db.query(
      'SELECT nextval(\'booking_sequence\') as seq'
    );
    return result.rows[0].seq.toString().padStart(6, '0');
  }

  // Validate booking ID format
  validateBookingId(bookingId: string): boolean {
    const pattern = /^BK[0-9A-Z]{14}$/;
    return pattern.test(bookingId);
  }
}
```

### 2. Slot Locking Mechanism
```typescript
interface SlotLockManager {
  private readonly LOCK_TIMEOUT = 900; // 15 minutes

  // Lock slots for booking
  async lockSlots(
    matchId: string,
    slots: number[],
    bookingId: string
  ): Promise<boolean> {
    const lockKey = `booking:${bookingId}:slots`;
    const matchKey = `match:${matchId}:slots`;

    return await this.redis.multi()
      // Check slot availability
      .sismember(matchKey, ...slots)
      // Set lock with expiration
      .set(lockKey, JSON.stringify({
        matchId,
        slots,
        timestamp: Date.now()
      }), 'EX', this.LOCK_TIMEOUT)
      .exec();
  }

  // Extend lock if needed
  async extendLock(bookingId: string): Promise<boolean> {
    const lockKey = `booking:${bookingId}:slots`;
    const lock = await this.redis.get(lockKey);
    
    if (!lock) {
      return false;
    }

    return await this.redis.expire(lockKey, this.LOCK_TIMEOUT);
  }

  // Release lock
  async releaseLock(bookingId: string): Promise<void> {
    const lockKey = `booking:${bookingId}:slots`;
    await this.redis.del(lockKey);
  }

  // Check if slots are locked
  async areSlotsLocked(
    matchId: string,
    slots: number[]
  ): Promise<boolean> {
    const matchKey = `match:${matchId}:slots`;
    const lockedSlots = await this.redis.smembers(matchKey);
    return slots.some(slot => lockedSlots.includes(slot.toString()));
  }

  // Handle expired locks
  async handleExpiredLock(bookingId: string): Promise<void> {
    const lockKey = `booking:${bookingId}:slots`;
    const lock = await this.redis.get(lockKey);
    
    if (!lock) {
      return;
    }

    await this.db.transaction(async (trx) => {
      // Update booking status
      await this.bookingRepo.updateStatus(bookingId, 'EXPIRED', trx);
      
      // Release slots
      await this.releaseLock(bookingId);
      
      // Log expiration
      await this.auditRepo.logLockExpiration(bookingId, JSON.parse(lock), trx);
    });
  }
}
```

## Status Tracking

### 1. Comprehensive Status Management
```typescript
interface StatusManager {
  // Update booking status with all related entities
  async updateBookingStatus(
    bookingId: string,
    status: BookingStatus,
    metadata?: any
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const booking = await this.bookingRepo.findByIdForUpdate(bookingId, trx);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Update main booking status
      await this.bookingRepo.updateStatus(bookingId, status, trx);

      // Update related records
      if (status === 'CONFIRMED') {
        await this.handleBookingConfirmation(booking, trx);
      } else if (status === 'CANCELLED') {
        await this.handleBookingCancellation(booking, trx);
      } else if (status === 'PARTIALLY_CANCELLED') {
        await this.handlePartialCancellation(booking, metadata?.cancelledSlots, trx);
      }

      // Create audit log
      await this.auditRepo.logStatusChange({
        bookingId,
        oldStatus: booking.status,
        newStatus: status,
        metadata,
        timestamp: new Date()
      }, trx);

      // Send notifications
      await this.notificationService.notifyStatusChange(bookingId, status);
    });
  }

  // Handle booking confirmation
  private async handleBookingConfirmation(
    booking: Booking,
    trx: Transaction
  ): Promise<void> {
    // Update slot status
    await this.slotRepo.updateSlotStatus(
      booking.slots,
      'CONFIRMED',
      trx
    );

    // Release temporary locks
    await this.lockManager.releaseLock(booking.id);

    // Update match availability
    await this.matchRepo.decrementAvailableSlots(
      booking.matchId,
      booking.slots.length,
      trx
    );

    // Process waitlist if needed
    await this.waitlistService.processWaitlist(booking.matchId);
  }

  // Handle booking cancellation
  private async handleBookingCancellation(
    booking: Booking,
    trx: Transaction
  ): Promise<void> {
    // Update slot status
    await this.slotRepo.updateSlotStatus(
      booking.slots,
      'CANCELLED',
      trx
    );

    // Initiate refund if applicable
    if (this.isRefundEligible(booking)) {
      await this.refundService.initiateRefund(booking, trx);
    }

    // Update match availability
    await this.matchRepo.incrementAvailableSlots(
      booking.matchId,
      booking.slots.length,
      trx
    );

    // Process waitlist
    await this.waitlistService.processWaitlist(booking.matchId);
  }
}
```

### 2. Partial Cancellation Handling
```typescript
interface PartialCancellationManager {
  // Handle partial cancellation request
  async handlePartialCancellation(
    bookingId: string,
    slotIds: string[]
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const booking = await this.bookingRepo.findByIdForUpdate(bookingId, trx);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Validate cancellation eligibility
      await this.validatePartialCancellation(booking, slotIds);

      // Calculate refund amount
      const refundAmount = await this.calculateRefundAmount(booking, slotIds);

      // Update booking status
      await this.bookingRepo.updateStatus(
        bookingId,
        'PARTIALLY_CANCELLED',
        {
          cancelledSlots: slotIds,
          refundAmount
        },
        trx
      );

      // Update slot statuses
      await this.slotRepo.updateSlotStatus(
        slotIds,
        'CANCELLED_REFUND_PENDING',
        trx
      );

      // Initiate refund
      const refund = await this.refundService.initiatePartialRefund(
        booking,
        slotIds,
        refundAmount,
        trx
      );

      // Update refund status
      await this.bookingRepo.updateRefundStatus(
        bookingId,
        'REFUND_PENDING',
        {
          refundId: refund.id,
          amount: refundAmount
        },
        trx
      );

      // Release cancelled slots
      await this.matchRepo.incrementAvailableSlots(
        booking.matchId,
        slotIds.length,
        trx
      );

      // Process waitlist
      await this.waitlistService.processWaitlist(booking.matchId);
    });
  }

  // Calculate refund amount based on cancellation policy
  private async calculateRefundAmount(
    booking: Booking,
    slotIds: string[]
  ): Promise<number> {
    const perSlotAmount = booking.amount / booking.slots.length;
    const totalRefundAmount = perSlotAmount * slotIds.length;

    const hoursToMatch = await this.getHoursToMatch(booking.matchId);
    
    if (hoursToMatch > 6) {
      return totalRefundAmount; // 100% refund
    } else if (hoursToMatch > 3) {
      return totalRefundAmount * 0.5; // 50% refund
    }
    
    return 0; // No refund
  }
}
```

## Security Measures

### 1. Payment Signature Verification
```typescript
interface SignatureVerification {
  // Verify payment signature
  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(text)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }

  // Verify webhook signature
  verifyWebhookSignature(
    payload: string,
    signature: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }
}
```

### 2. Rate Limiting
```typescript
interface RateLimiter {
  // Check rate limit for payment attempts
  async checkPaymentRateLimit(userId: string): Promise<boolean> {
    const key = `ratelimit:payment:${userId}`;
    const limit = 5; // 5 attempts
    const window = 3600; // 1 hour

    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, window);
    }

    return current <= limit;
  }

  // Check rate limit for booking attempts
  async checkBookingRateLimit(userId: string): Promise<boolean> {
    const key = `ratelimit:booking:${userId}`;
    const limit = 10; // 10 attempts
    const window = 3600; // 1 hour

    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, window);
    }

    return current <= limit;
  }
}
```

Would you like me to elaborate further on any specific aspect or add more implementation details for any particular component?
