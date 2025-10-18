# Booking System Scenarios Documentation

## Table of Contents
1. [Booking Success Scenarios](#booking-success-scenarios)
2. [Booking Failure Scenarios](#booking-failure-scenarios)
3. [Cancellation Scenarios](#cancellation-scenarios)
4. [Edge Cases and Special Scenarios](#edge-cases-and-special-scenarios)
5. [System Responses](#system-responses)
6. [Database States](#database-states)
7. [Critical Implementation Requirements](#critical-implementation-requirements)
8. [Sequence Diagrams](#sequence-diagrams)

## Sequence Diagrams

### 1. Successful Booking Flow
```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant R as Razorpay
    participant DB as Database
    participant N as Notification

    U->>C: Select slots
    C->>S: Request booking
    S->>DB: Lock slots (transaction)
    DB-->>S: Slots locked
    S->>R: Create payment order
    R-->>S: Order created
    S-->>C: Payment details
    C->>R: Process payment
    R->>S: Payment webhook
    S->>DB: Verify slot availability
    alt Slots still available
        S->>DB: Confirm booking
        S->>N: Send confirmation
        N-->>U: Email & Push notification
        S-->>C: Success response
    else Slots taken
        S->>R: Initiate refund
        S->>DB: Release slots
        S->>N: Send failure notice
        N-->>U: Booking failed notification
        S-->>C: Failure response
    end
```

### 2. Payment Failure and Retry Flow
```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant R as Razorpay
    participant DB as Database

    U->>C: Initiate payment
    C->>R: Process payment
    R-->>C: Payment failed
    C->>U: Show retry option
    U->>C: Retry payment
    C->>R: Process payment again
    R-->>S: Payment success webhook
    S->>DB: Update booking status
    S-->>C: Success confirmation
    C-->>U: Show confirmation
```

### 3. Partial Cancellation Flow
```mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    participant DB as Database
    participant R as Razorpay
    participant W as Waitlist
    participant N as Notification

    U->>S: Cancel specific slots
    S->>DB: Lock booking record
    S->>DB: Check cancellation window
    alt >6 hours to match
        S->>R: Process full refund
    else 3-6 hours to match
        S->>R: Process 50% refund
    else <3 hours to match
        S-->>U: No refund possible
    end
    S->>DB: Update slot status
    S->>DB: Release cancelled slots
    S->>W: Check waitlist
    W->>N: Notify waitlisted users
    S->>N: Send cancellation confirmation
    N-->>U: Confirmation email/push
```

### 4. Concurrent Booking Resolution Flow
```mermaid
sequenceDiagram
    participant U1 as User 1
    participant U2 as User 2
    participant S as Server
    participant DB as Database
    participant R as Razorpay

    U1->>S: Book last slots
    U2->>S: Book same slots
    S->>DB: Lock slots (U1)
    S->>R: Create payment (U1)
    S-->>U2: Slots unavailable
    S->>DB: Check waitlist policy
    alt Waitlist available
        S-->>U2: Offer waitlist
    else No waitlist
        S-->>U2: Suggest alternatives
    end
```

### 5. Waitlist Promotion Flow
```mermaid
sequenceDiagram
    participant S as System
    participant W as Waitlist
    participant U as User
    participant DB as Database
    participant N as Notification
    participant R as Razorpay

    S->>DB: Slots become available
    S->>W: Check waitlist queue
    W->>N: Notify next in line
    N-->>U: Slot available notification
    
    alt User responds within 15 min
        U->>S: Confirm booking
        S->>DB: Lock slots
        S->>R: Create payment
        R-->>U: Payment page
    else Timeout
        S->>W: Move to end of waitlist
        S->>W: Promote next user
    end
```

[Previous content remains the same...]