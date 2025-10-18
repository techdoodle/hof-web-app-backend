# Razorpay Integration Guide

## Transaction Status Management

### 1. Order Creation and Payment Flow
```typescript
interface RazorpayOrderManager {
  // Create order before initiating payment
  async createOrder(bookingId: string, amount: number): Promise<RazorpayOrder> {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: bookingId,
      notes: {
        bookingId: bookingId
      }
    });
    
    // Store order details in your database
    await this.storeOrderDetails(order, bookingId);
    return order;
  }

  // Verify payment signature
  async verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): Promise<boolean> {
    const text = orderId + '|' + paymentId;
    const generated_signature = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(text)
      .digest('hex');
    
    return generated_signature === signature;
  }
}
```

### 2. Webhook Implementation
```typescript
interface WebhookHandler {
  // Handle incoming webhooks
  async handleWebhook(
    event: string,
    payload: any,
    signature: string
  ): Promise<void> {
    // Verify webhook signature
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    // Process based on event type
    switch (event) {
      case 'payment.captured':
        await this.handlePaymentSuccess(payload);
        break;
      case 'payment.failed':
        await this.handlePaymentFailure(payload);
        break;
      case 'order.paid':
        await this.handleOrderPaid(payload);
        break;
    }
  }

  // Handle successful payment
  private async handlePaymentSuccess(payload: any): Promise<void> {
    const bookingId = payload.notes.bookingId;
    
    // Use database transaction
    await this.db.transaction(async (trx) => {
      // Update payment status
      await this.paymentRepo.updateStatus(
        payload.payment_id,
        'COMPLETED',
        trx
      );

      // Update booking status
      await this.bookingRepo.updateStatus(
        bookingId,
        'CONFIRMED',
        trx
      );

      // Send notifications
      await this.notificationService.sendPaymentConfirmation(bookingId);
    });
  }

  // Handle failed payment
  private async handlePaymentFailure(payload: any): Promise<void> {
    const bookingId = payload.notes.bookingId;
    
    await this.db.transaction(async (trx) => {
      // Update payment status
      await this.paymentRepo.updateStatus(
        payload.payment_id,
        'FAILED',
        trx
      );

      // Update booking status
      await this.bookingRepo.updateStatus(
        bookingId,
        'PAYMENT_FAILED',
        trx
      );

      // Release locked slots
      await this.matchService.releaseSlots(bookingId, trx);

      // Send notifications
      await this.notificationService.sendPaymentFailure(bookingId);
    });
  }
}
```

### 3. Payment Status Reconciliation
```typescript
interface PaymentReconciliation {
  // Periodic reconciliation job
  async reconcilePayments(): Promise<void> {
    const pendingPayments = await this.paymentRepo.getPendingPayments();
    
    for (const payment of pendingPayments) {
      try {
        // Fetch payment status from Razorpay
        const razorpayPayment = await razorpay.payments.fetch(
          payment.razorpay_payment_id
        );
        
        // Update local status if different
        if (payment.status !== razorpayPayment.status) {
          await this.updatePaymentStatus(
            payment.id,
            razorpayPayment.status
          );
        }
      } catch (error) {
        // Log error for manual review
        await this.logger.error(
          'Payment reconciliation failed',
          { paymentId: payment.id, error }
        );
      }
    }
  }
}
```

### 4. Error Handling and Retry Mechanism
```typescript
interface RetryManager {
  // Retry webhook processing
  async retryWebhook(
    webhookId: string,
    maxRetries: number = 3
  ): Promise<void> {
    const webhook = await this.webhookRepo.find(webhookId);
    
    if (webhook.retryCount >= maxRetries) {
      await this.handleMaxRetriesExceeded(webhook);
      return;
    }

    try {
      await this.processWebhook(webhook);
      await this.webhookRepo.markAsProcessed(webhookId);
    } catch (error) {
      await this.webhookRepo.incrementRetryCount(webhookId);
      // Schedule next retry with exponential backoff
      await this.scheduleRetry(webhook, error);
    }
  }
}
```

## Best Practices for Foolproof Implementation

1. **Database Schema**
```sql
-- Payment tracking table
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY,
    booking_id UUID REFERENCES bookings(id),
    razorpay_order_id VARCHAR(100) NOT NULL,
    razorpay_payment_id VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL,
    payment_method VARCHAR(50),
    error_code VARCHAR(100),
    error_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    metadata JSONB,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    CONSTRAINT valid_status CHECK (status IN (
        'INITIATED', 'PROCESSING', 'COMPLETED',
        'FAILED', 'REFUNDED', 'EXPIRED'
    ))
);

-- Webhook tracking table
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    processed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    error_log TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

2. **Monitoring and Alerts**
```typescript
interface PaymentMonitoring {
  // Monitor payment success rate
  async monitorPaymentSuccess(): Promise<void> {
    const threshold = 0.95; // 95% success rate threshold
    const window = '1h'; // 1 hour window
    
    const stats = await this.getPaymentStats(window);
    const successRate = stats.successful / stats.total;
    
    if (successRate < threshold) {
      await this.alertService.sendAlert(
        'PaymentSuccessRateLow',
        { rate: successRate, window }
      );
    }
  }

  // Monitor webhook delivery
  async monitorWebhookDelivery(): Promise<void> {
    const failedWebhooks = await this.webhookRepo.getFailedWebhooks();
    
    if (failedWebhooks.length > 0) {
      await this.alertService.sendAlert(
        'WebhookDeliveryFailed',
        { count: failedWebhooks.length }
      );
    }
  }
}
```

3. **Idempotency Implementation**
```typescript
interface IdempotencyManager {
  async processWithIdempotency(
    key: string,
    operation: () => Promise<any>
  ): Promise<any> {
    const lock = await this.lockManager.acquireLock(key);
    
    try {
      // Check if already processed
      const existing = await this.idempotencyRepo.find(key);
      if (existing) {
        return existing.result;
      }
      
      // Execute operation
      const result = await operation();
      
      // Store result
      await this.idempotencyRepo.store(key, result);
      
      return result;
    } finally {
      await this.lockManager.releaseLock(lock);
    }
  }
}
```

## Critical Checks

1. **Before Payment Initiation**
   - Validate booking exists
   - Verify slot availability
   - Check amount accuracy
   - Validate user details

2. **After Payment Success**
   - Verify payment signature
   - Double-check slot availability
   - Verify amount matches
   - Check for duplicate payments

3. **During Webhook Processing**
   - Verify webhook signature
   - Check idempotency
   - Validate event sequence
   - Ensure data consistency

4. **For Refunds**
   - Verify refund eligibility
   - Check refund amount
   - Validate booking status
   - Ensure no duplicate refunds
