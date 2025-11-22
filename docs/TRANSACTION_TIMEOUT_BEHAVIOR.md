# Transaction Timeout and Lock Release Behavior

## 🎯 **What Happens When Timeout Kills a Transaction**

### **The Question:**
> "What happens if the row is locked but due to timeouts it is released, what happens to the transaction?"

### **The Answer:**
When PostgreSQL timeout kills a transaction holding locks:

1. ✅ **Transaction is ROLLED BACK** automatically
2. ✅ **All locks are RELEASED** immediately
3. ❌ **All work is UNDONE** (inserts, updates, deletes)
4. 💥 **Client receives ERROR**

---

## 📋 **Detailed Sequence of Events**

### **Normal Flow (No Timeout):**

```
Time | Action | Transaction State | Row Lock
-----|--------|-------------------|----------
T0   | BEGIN | ACTIVE | -
T1   | SELECT...FOR UPDATE | ACTIVE | 🔒 LOCKED
T2   | INSERT booking | ACTIVE | 🔒 LOCKED
T3   | UPDATE match | ACTIVE | 🔒 LOCKED
T4   | COMMIT | COMMITTED ✅ | 🔓 RELEASED
```

### **With Timeout (statement_timeout = 30s):**

```
Time | Action | Transaction State | Row Lock
-----|--------|-------------------|----------
T0   | BEGIN | ACTIVE | -
T1   | SELECT...FOR UPDATE | ACTIVE | 🔒 LOCKED
T2   | INSERT booking | ACTIVE | 🔒 LOCKED
T30  | 30 seconds pass... | ACTIVE | 🔒 LOCKED
T30  | PostgreSQL detects timeout | ABORTING | 🔒 LOCKED
T30  | PostgreSQL rolls back | ABORTED ❌ | 🔓 RELEASED
T30  | Client receives error | - | -
```

**Key Point:** Lock release and rollback happen **atomically** and **automatically**.

---

## 🔬 **PostgreSQL's Timeout Mechanisms**

### **1. `statement_timeout` (30 seconds in our config)**

**What it does:**
- Monitors **individual statement** execution time
- If a single SQL statement takes > 30 seconds → Kill it

**Example:**
```sql
BEGIN;
SELECT * FROM matches WHERE match_id = 1 FOR UPDATE;
-- This statement takes 35 seconds...
-- PostgreSQL: "canceling statement due to statement timeout"
-- Result: Transaction ROLLED BACK, locks RELEASED
```

**When it triggers:**
- Slow query (complex joins, large tables)
- Deadlock detection taking too long
- Database under heavy load

### **2. `idle_in_transaction_session_timeout` (60 seconds in our config)**

**What it does:**
- Monitors time transaction is **idle** (not executing anything)
- If idle > 60 seconds → Kill entire session

**Example:**
```sql
BEGIN;
SELECT * FROM matches WHERE match_id = 1 FOR UPDATE;  -- Locks row
-- Now idle for 65 seconds (no more SQL executed)...
-- PostgreSQL: "terminating connection due to idle-in-transaction timeout"
-- Result: Connection CLOSED, transaction ROLLED BACK, locks RELEASED
```

**When it triggers:**
- Application hang/freeze
- Network issue between queries
- Debugging with breakpoints
- Forgotten transaction

---

## 💻 **What Happens in Our Code**

### **Scenario 1: statement_timeout During Lock Acquisition**

```typescript
try {
    await queryRunner.startTransaction();
    
    // This takes 35 seconds (slow query)
    const lock = await queryRunner.query(
        `SELECT ... FROM matches WHERE id = 1 FOR UPDATE`
    );
    // ❌ Throws: "canceling statement due to statement timeout"
    // PostgreSQL already: ROLLED BACK, RELEASED LOCKS
    
} catch (error) {
    // We're here! error.message = "canceling statement due to statement timeout"
    
    // ❌ OLD CODE (WRONG):
    await queryRunner.rollbackTransaction();  
    // Throws: "no transaction in progress"
    
    // ✅ NEW CODE (CORRECT):
    try {
        await queryRunner.rollbackTransaction();
    } catch (rollbackError) {
        // Already rolled back - that's fine
        this.logger.warn('Transaction already aborted');
    }
}
```

### **Scenario 2: statement_timeout During Work**

```typescript
try {
    await queryRunner.startTransaction();
    
    const lock = await queryRunner.query(`... FOR UPDATE`);  // 🔒 LOCKED
    
    // Validate... (fast)
    // Create booking... (fast)
    
    // This takes 35 seconds (unexpected)
    await someSlowOperation();
    // ❌ Throws: "canceling statement due to statement timeout"
    // PostgreSQL: ROLLED BACK, RELEASED LOCKS
    
} catch (error) {
    // Booking NOT created (rolled back)
    // Lock RELEASED
    // User gets error: "Booking failed, please try again"
}
```

### **Scenario 3: idle_in_transaction_session_timeout**

```typescript
try {
    await queryRunner.startTransaction();
    
    const lock = await queryRunner.query(`... FOR UPDATE`);  // 🔒 LOCKED
    
    // Application freezes/hangs here for 65 seconds
    // (network issue, infinite loop, deadlock, etc.)
    
    // PostgreSQL after 60 seconds:
    // - Kills the SESSION
    // - Rolls back transaction
    // - Releases locks
    // - Closes connection
    
} catch (error) {
    // error.message = "connection terminated"
    // or "Connection lost"
}
```

---

## 🚨 **What Gets Rolled Back**

When timeout kills transaction, **ALL work is undone**:

```typescript
await queryRunner.startTransaction();

// These all get ROLLED BACK on timeout:
await queryRunner.query(`INSERT INTO bookings ...`);        // ❌ UNDONE
await queryRunner.query(`INSERT INTO booking_slots ...`);   // ❌ UNDONE
await queryRunner.query(`UPDATE matches SET ...`);          // ❌ UNDONE
await queryRunner.query(`UPDATE users SET ...`);            // ❌ UNDONE

// Timeout occurs here
// Result: Database looks like transaction never happened
```

**It's as if the transaction never started!** ✨

---

## 🔄 **Impact on Concurrent Transactions**

### **User A's Transaction (Times Out):**
```typescript
// T0: User A locks match
SELECT * FROM matches WHERE id = 1 FOR UPDATE;  // 🔒

// T30: Timeout!
// PostgreSQL: ROLLBACK, RELEASE LOCK
```

### **User B's Transaction (Was Waiting):**
```typescript
// T5: User B tries to lock same match
SELECT * FROM matches WHERE id = 1 FOR UPDATE;  // ⏳ Waiting...

// T30: User A's lock released!
// User B immediately acquires lock: 🔒
// User B proceeds with booking ✅
```

**Benefit:** User B doesn't have to wait forever!

---

## ⚠️ **Edge Cases & Gotchas**

### **1. Timeout During COMMIT**

```typescript
try {
    await queryRunner.startTransaction();
    // ... do work ...
    
    // COMMIT takes > 30 seconds (rare but possible)
    await queryRunner.commitTransaction();
    // ❌ Throws timeout error
    
} catch (error) {
    // Uh oh - was commit successful or not?
    // Answer: Transaction was ROLLED BACK
    // Booking was NOT created
}
```

**This is why commits should be fast!**

### **2. Multiple Statements, One Timeout**

```typescript
await queryRunner.startTransaction();

await queryRunner.query(`INSERT ...`);  // ✅ Succeeds, takes 5s
await queryRunner.query(`INSERT ...`);  // ✅ Succeeds, takes 5s
await queryRunner.query(`UPDATE ...`);  // ❌ Times out at 31s total

// Result: ALL THREE statements rolled back
```

### **3. Nested Savepoints (Not Used in Our Code)**

```typescript
await queryRunner.startTransaction();
await queryRunner.query(`SAVEPOINT sp1`);
// ... work ...
// Timeout occurs
// Result: Entire transaction rolled back (not just to savepoint)
```

---

## ✅ **Updated Error Handling Pattern**

### **Before (Brittle):**
```typescript
catch (error) {
    await queryRunner.rollbackTransaction();  // ❌ Throws if already rolled back
    throw error;
}
```

### **After (Robust):**
```typescript
catch (error) {
    this.logger.error('Transaction failed:', error);
    
    // Try to rollback, but don't fail if already rolled back
    try {
        await queryRunner.rollbackTransaction();
    } catch (rollbackError) {
        // Transaction already aborted by PostgreSQL (timeout, deadlock, etc)
        // This is expected and fine
        this.logger.warn('Rollback unnecessary (already aborted):', rollbackError.message);
    }
    
    throw error;  // Re-throw original error
}
```

---

## 📊 **What User Sees**

### **Frontend Error Handling:**

```typescript
try {
    await bookingService.createBooking(data);
} catch (error) {
    if (error.message.includes('statement timeout')) {
        // Show user-friendly message
        toast.error('Booking is taking longer than expected. Please try again.');
    } else if (error.message.includes('idle in transaction')) {
        toast.error('Connection was lost. Please try again.');
    } else {
        toast.error('Booking failed. Please try again.');
    }
}
```

---

## 🔍 **Debugging Timeouts**

### **Check PostgreSQL Logs:**
```sql
-- Find queries that timed out
SELECT 
    query,
    state,
    NOW() - query_start as duration
FROM pg_stat_activity
WHERE query LIKE '%canceling statement%'
   OR state = 'idle in transaction';
```

### **Check Application Logs:**
```bash
# Look for timeout errors
grep -i "statement timeout\|idle in transaction" application.log

# Look for rollback warnings
grep "Rollback unnecessary" application.log
```

---

## 🎯 **Best Practices**

### **✅ DO:**

1. **Keep transactions SHORT**
   - Only include necessary operations
   - Commit as soon as possible

2. **Handle timeout errors gracefully**
   ```typescript
   try {
       await queryRunner.rollbackTransaction();
   } catch (e) {
       // Already rolled back - that's fine
   }
   ```

3. **Set appropriate timeouts**
   - `statement_timeout`: 30 seconds (our setting)
   - `idle_in_transaction_session_timeout`: 60 seconds

4. **Monitor for timeouts**
   - Log all timeout errors
   - Alert if frequency increases

### **❌ DON'T:**

1. **Don't do slow operations in transactions**
   ```typescript
   // ❌ BAD
   await queryRunner.startTransaction();
   await externalAPI.call();  // Could take minutes!
   await queryRunner.commitTransaction();
   
   // ✅ GOOD
   await externalAPI.call();  // Do this OUTSIDE transaction
   await queryRunner.startTransaction();
   // ... fast database operations only ...
   await queryRunner.commitTransaction();
   ```

2. **Don't assume rollback succeeds**
   - Always wrap in try-catch
   - PostgreSQL might have already rolled back

3. **Don't increase timeouts without investigation**
   - If seeing timeouts, optimize the query first
   - Only increase as last resort

---

## 📈 **Monitoring Query**

```sql
-- Find transactions running longer than expected
SELECT 
    pid,
    usename,
    application_name,
    NOW() - xact_start as transaction_duration,
    NOW() - query_start as query_duration,
    state,
    query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND state != 'idle'
  AND NOW() - xact_start > interval '10 seconds'
ORDER BY xact_start;
```

---

## 🎯 **Summary**

**Question:** What happens to transaction when timeout releases lock?

**Answer:**
1. ✅ PostgreSQL **automatically rolls back** the entire transaction
2. ✅ **All locks released** immediately
3. ✅ **All changes undone** (as if transaction never happened)
4. ❌ Client receives **error message**
5. ✅ Waiting transactions can now **proceed**

**Key Insight:** You don't need to manually release locks or rollback - PostgreSQL handles it automatically. You just need to handle the error gracefully!

---

**Last Updated:** November 22, 2025  
**Status:** ✅ Error handling updated in booking.service.ts  
**Priority:** 🟢 Low - Already handled safely by PostgreSQL

