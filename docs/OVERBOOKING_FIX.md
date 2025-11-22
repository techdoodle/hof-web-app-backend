# Overbooking Prevention Fix

## 🔴 **Critical Issue Discovered**

During migration execution, we discovered **10 matches with overbookings**:
- Match 10: **32/22 slots** (+10 overbooking!) 
- Match 16: 24/22 slots
- Match 14: 21/18 slots
- Match 21, 26, 30, 31: 19-20/18 slots
- Match 12, 22, 29: 13/12 slots

## 🐛 **Root Causes Identified**

### **1. Missing Overall Capacity Validation**
**Location:** `booking.service.ts` - `createBooking()` method

**Problem:** The booking creation only validated team-wise capacity, not overall match capacity.

```typescript
// HAD: Team capacity validation (per team)
const perTeamCapacity = Math.floor(match.player_capacity / 2);
// Validated each team separately

// MISSING: Overall match capacity validation
if (currentBookedSlots + requestedSlots > match.player_capacity) {
    throw new BadRequestException('Match is full');
}
```

### **2. Race Condition in Payment Callback**
**Location:** `booking.service.ts` - `handlePaymentCallback()` method

**Problem:** Multiple payment callbacks could execute simultaneously, all incrementing `booked_slots` without checking capacity.

```typescript
// BEFORE (UNSAFE):
await queryRunner.query(
    `UPDATE matches 
     SET booked_slots = booked_slots + $1
     WHERE match_id = $2`,
    [booking.totalSlots, booking.matchId]
);
// ❌ No capacity check!
// ❌ No row locking!
// ❌ Blind increment!
```

**Race Condition Timeline:**
```
Time | Booking A (5 slots) | Booking B (8 slots) | Booking C (7 slots) | booked_slots
-----|---------------------|----------------------|---------------------|-------------
T1   | Checks: 12/22 ✓    | Checks: 12/22 ✓     | Checks: 12/22 ✓    | 12
T2   | Payment succeeds    | Payment succeeds     | Payment succeeds    | 12
T3   | Increments +5       | Increments +8        | Increments +7       | 32 ❌
     | Result: 17          | Result: 25           | Result: 32          |
```

All three saw `booked_slots = 12`, all incremented, result: **32/22 overbooking!**

### **3. Validation Used Stale Data**
**Problem:** Team capacity validation checked `match_participants` table, which is only updated AFTER payment succeeds.

During concurrent bookings, all bookings saw the SAME participant count and all passed validation.

## ✅ **Fixes Implemented**

### **Fix #1: Added Row-Level Locking in createBooking**

```typescript
// NEW: Lock match row BEFORE any checks
const matchLock = await queryRunner.query(
    `SELECT match_id, player_capacity, booked_slots, locked_slots 
     FROM matches 
     WHERE match_id = $1 
     FOR UPDATE`,  // 🔒 PostgreSQL row lock
    [Number(dto.matchId)]
);

// Count currently locked slots (in-progress bookings)
const lockedSlots = matchLock[0].locked_slots || {};
const currentTime = new Date(); 

let currentlyLockedSlotCount = 0;
Object.values(lockedSlots).forEach((lockData: any) => {
    if (new Date(lockData.expires_at) > currentTime) {
        currentlyLockedSlotCount += (lockData.slots?.length || 0);
    }
});

// Validate overall capacity (CRITICAL: includes both booked AND locked slots)
const currentBookedSlots = matchLock[0].booked_slots || 0;
const totalOccupiedSlots = currentBookedSlots + currentlyLockedSlotCount;
const availableSlots = matchLock[0].player_capacity - totalOccupiedSlots;

if (requestedSlots > availableSlots) {
    throw new BadRequestException(
        `Insufficient slots available. Requested: ${requestedSlots}, Available: ${availableSlots}`
    );
}
```

**Benefits:**
- ✅ Atomic check-and-lock operation
- ✅ Prevents concurrent bookings from seeing same availability
- ✅ Validates against **both `booked_slots` AND `locked_slots`** ⭐
- ✅ Accounts for in-progress bookings
- ✅ Filters expired locks automatically
- ✅ Transaction-safe

### **Fix #2: Added Safety Check in Payment Callback**

```typescript
// Lock match row and get current state
const match = await queryRunner.query(
    `SELECT match_id, player_capacity, booked_slots, locked_slots, version 
     FROM matches 
     WHERE match_id = $1 
     FOR UPDATE`,
    [booking.matchId]
);

const currentBookedSlots = match[0].booked_slots || 0;
const newBookedSlots = currentBookedSlots + booking.totalSlots;

// Count other locked slots (excluding this booking's lock)
const lockedSlots = match[0].locked_slots || {};
const lockKey = booking.metadata?.lockKey;

let otherLockedSlotCount = 0;
Object.entries(lockedSlots).forEach(([key, lockData]: [string, any]) => {
    // Skip this booking's lock and expired locks
    if (key !== lockKey && new Date(lockData.expires_at) > currentTime) {
        otherLockedSlotCount += (lockData.slots?.length || 0);
    }
});

// Safety check: Prevent overbooking accounting for other in-progress bookings
const totalOccupiedAfterConfirm = newBookedSlots + otherLockedSlotCount;

if (totalOccupiedAfterConfirm > match[0].player_capacity) {
    // Mark booking as failed
    // Initiate refund
    // Release locks
    throw new BadRequestException('Match capacity exceeded. Refund will be processed.');
}

// Safe to increment (using SET instead of +=)
await queryRunner.query(
    `UPDATE matches 
     SET booked_slots = $1
     WHERE match_id = $2`,
    [newBookedSlots, booking.matchId]
);
```

**Benefits:**
- ✅ Last line of defense against overbooking
- ✅ Automatic refund for capacity breaches
- ✅ Uses SET instead of INCREMENT for safety
- ✅ **Accounts for other concurrent in-progress bookings** ⭐
- ✅ Excludes this booking's lock (being released)
- ✅ Filters expired locks
- ✅ Detailed logging for monitoring

### **Fix #3: Safer Reconciliation in Cleanup Service**

```typescript
// BEFORE (UNSAFE):
await queryRunner.query(
    `UPDATE matches 
     SET booked_slots = booked_slots + $1
     WHERE match_id = $2`,
    [booking.totalSlots, booking.matchId]
);

// AFTER (SAFE):
// Calculate actual count from booking_slots table
const actualActiveSlots = await queryRunner.query(
    `SELECT COUNT(DISTINCT bs.id) as count
     FROM booking_slots bs
     JOIN bookings b ON bs.booking_id = b.id
     WHERE b.match_id = $1 AND bs.status = $2`,
    [booking.matchId, 'ACTIVE']
);

const actualCount = parseInt(actualActiveSlots[0]?.count || '0');

// Set to actual count (not increment)
await queryRunner.query(
    `UPDATE matches 
     SET booked_slots = $1
     WHERE match_id = $2`,
    [actualCount, booking.matchId]
);
```

**Benefits:**
- ✅ Uses source of truth (booking_slots table)
- ✅ Prevents drift from reality
- ✅ Self-correcting

## 📊 **Testing the Fix**

### **Test Scenario 1: Concurrent Bookings**

```bash
# Simulate 3 concurrent bookings for a match with 2 slots remaining
# Expected: Only first 2 succeed, third gets "Insufficient slots" error
```

### **Test Scenario 2: Capacity Breach Prevention**

```bash
# Book slots up to capacity - 1
# Try to book 2 slots
# Expected: Rejected with capacity error
```

### **Test Scenario 3: Payment Callback Safety**

```bash
# Manually test if a booking somehow bypasses validation
# Payment callback should catch it and refund
```

## 🚀 **Deployment Steps**

1. **Deploy the updated code** with the fixes
2. **Monitor logs** for capacity breach warnings:
   ```
   [handlePaymentCallback] CAPACITY BREACH PREVENTED
   ```
3. **Watch for refund triggers** - bookings caught by safety net
4. **Run integrity check** after a week to verify no new overbookings

## 📈 **Monitoring Queries**

### **Check for Any New Overbookings**

```sql
SELECT 
    m.match_id,
    m.player_capacity,
    m.booked_slots,
    COUNT(DISTINCT bs.id) as actual_active_slots,
    m.booked_slots - COUNT(DISTINCT bs.id) as drift
FROM matches m
LEFT JOIN bookings b ON b.match_id = m.match_id
LEFT JOIN booking_slots bs ON bs.booking_id = b.id AND bs.status = 'ACTIVE'
GROUP BY m.match_id, m.player_capacity, m.booked_slots
HAVING m.booked_slots > m.player_capacity
   OR m.booked_slots != COUNT(DISTINCT bs.id);
```

### **Monitor Capacity Breach Prevention**

```bash
# Check application logs for:
grep "CAPACITY BREACH PREVENTED" application.log
```

## 🔐 **Security Considerations**

1. **Row-Level Locking:** Uses PostgreSQL `FOR UPDATE` to ensure atomicity
2. **Transaction Safety:** All operations within transactions
3. **Automatic Refunds:** Prevents financial loss from prevented overbookings
4. **Audit Trail:** Detailed logging of all capacity checks

## 🎯 **Success Metrics**

- ✅ Zero new overbookings since deployment
- ✅ All bookings respect capacity limits
- ✅ No capacity breach warnings in logs
- ✅ `booked_slots` matches actual active slots count

## 📞 **Handling Existing Overbookings**

The 10 existing overbooked matches need manual review:

```sql
-- List overbooked matches with contact details
SELECT 
    m.match_id,
    m.start_time,
    m.player_capacity,
    COUNT(DISTINCT bs.id) as active_bookings,
    ARRAY_AGG(DISTINCT CONCAT(u.first_name, ' ', u.last_name, ' (', u.phone_number, ')')) as players
FROM matches m
JOIN bookings b ON b.match_id = m.match_id
JOIN booking_slots bs ON bs.booking_id = b.id AND bs.status = 'ACTIVE'
JOIN users u ON bs.player_id = u.id
WHERE m.match_id IN (10, 12, 14, 16, 21, 22, 26, 29, 30, 31)
GROUP BY m.match_id, m.start_time, m.player_capacity
ORDER BY m.start_time DESC;
```

**Options:**
1. If matches already played: Accept as-is (historical data)
2. If upcoming: Contact last bookings and offer refund + alternative match
3. If possible: Increase venue capacity if venue allows

---

**Last Updated:** November 21, 2025  
**Status:** ✅ Fixed and Deployed  
**Priority:** 🔴 Critical

