# Lock Release Failure Scenarios & Mitigations

## ⚠️ **Scenarios Where Row Locks Might NOT Be Released Properly**

### **Severity Legend**
- 🔴 **Critical** - PostgreSQL handles it, but delay possible
- 🟡 **Moderate** - Could cause temporary issues
- 🟢 **Safe** - Well handled by current code

---

## **1. Process Crash/Kill (SIGKILL)** 🔴

### **Scenario:**
```bash
kill -9 <node-process-id>
docker stop -t 0 container
```

### **What Happens:**
- ❌ `finally` block does NOT execute
- ❌ `queryRunner.release()` is NOT called
- ✅ PostgreSQL detects disconnected TCP connection
- ✅ Automatically rolls back transaction
- ✅ Releases all locks

### **Timeframe:**
- Usually: 30-60 seconds (TCP timeout)
- Could be up to: 2 hours (default `tcp_keepalives` settings)

### **Mitigation:**
```javascript
// PostgreSQL connection config (TypeORM)
{
  extra: {
    tcp_keepalives_idle: 30,        // 30 seconds
    tcp_keepalives_interval: 10,    // 10 seconds  
    tcp_keepalives_count: 3,        // 3 retries
    // Total timeout: 30 + (10 * 3) = 60 seconds
  }
}
```

### **Status:** ✅ PostgreSQL handles it automatically

---

## **2. Network Disconnect During Transaction** 🟡

### **Scenario:**
```
Application → [Network Failure] → Database
```

### **What Happens:**
- App thinks transaction is active
- Database connection is dead
- Lock held until TCP timeout
- **Risk:** Could be up to 2 hours with default settings!

### **Impact:**
- Other bookings for same match are blocked
- Users get "slots unavailable" errors
- Revenue loss during the wait

### **Mitigation:**
```javascript
// TypeORM DataSource config
{
  type: 'postgres',
  extra: {
    // Network failure detection
    tcp_keepalives_idle: 30,
    tcp_keepalives_interval: 10,
    tcp_keepalives_count: 3,
    
    // Statement timeout (server-side)
    statement_timeout: 30000,  // 30 seconds
  },
  
  // Connection pool settings
  connectionTimeoutMillis: 5000,  // 5 seconds to get connection
  idleTimeoutMillis: 30000,       // 30 seconds idle
}
```

### **Monitoring Query:**
```sql
-- Find transactions holding locks for > 1 minute
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    state,
    query,
    NOW() - query_start as duration,
    pg_blocking_pids(pid) as blocking
FROM pg_stat_activity
WHERE state != 'idle'
  AND NOW() - query_start > interval '1 minute'
ORDER BY query_start;

-- Kill if needed
SELECT pg_terminate_backend(<pid>);
```

### **Status:** ⚠️ Needs configuration tuning

---

## **3. Transaction Not Started But Rollback Called** 🟢

### **Current Code:**
```typescript
await queryRunner.connect();
await queryRunner.startTransaction();
try {
    // work...
} catch (error) {
    await queryRunner.rollbackTransaction(); // ⚠️ Throws if no transaction!
}
```

### **Problem:**
If `startTransaction()` fails, `rollbackTransaction()` throws another error.

### **Better Pattern:**
```typescript
const queryRunner = this.connection.createQueryRunner();
await queryRunner.connect();

let transactionStarted = false;
try {
    await queryRunner.startTransaction();
    transactionStarted = true;
    
    // ... work ...
    
    await queryRunner.commitTransaction();
} catch (error) {
    if (transactionStarted) {
        await queryRunner.rollbackTransaction();
    }
    throw error;
} finally {
    try {
        await queryRunner.release();
    } catch (releaseError) {
        this.logger.error('Failed to release connection', releaseError);
    }
}
```

### **Status:** 🟡 Current code could be improved

---

## **4. `finally` Block Throws Error** 🟢

### **Scenario:**
```typescript
finally {
    await queryRunner.release(); // What if this throws?
}
```

### **What Happens:**
- If `release()` throws, error propagates
- Connection might not return to pool
- Lock is already released (transaction ended)
- Connection pool cleanup happens eventually

### **Better Pattern:**
```typescript
finally {
    try {
        await queryRunner.release();
    } catch (releaseError) {
        // Log but don't throw - cleanup best effort
        this.logger.error('Failed to release query runner', releaseError);
        // Pool will reclaim after idleTimeoutMillis
    }
}
```

### **Status:** 🟡 Should add try-catch in finally

---

## **5. Application Restart/Deployment** 🟡

### **Graceful Shutdown (SIGTERM):**
```
T0: SIGTERM received
T1: App stops accepting new requests
T2: Waits for in-flight requests (including transactions)
T3: 30-second grace period
T4: If not done, SIGKILL
```

### **What Happens:**
- In-flight transactions have 30 seconds to complete
- `finally` blocks execute
- ✅ Locks released gracefully

### **Force Kill After Timeout:**
- PostgreSQL cleans up after TCP timeout (30-120 seconds)
- Lock held during this window
- Could impact 1-2 bookings

### **Mitigation:**
```javascript
// In your app startup
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing database connections...');
    
    // Close TypeORM connection pool gracefully
    await app.close(); // NestJS
    // or
    await dataSource.destroy(); // TypeORM
    
    process.exit(0);
});
```

### **Status:** ✅ Mostly handled, but add graceful shutdown

---

## **6. Connection Pool Exhaustion** 🟡

### **Scenario:**
```typescript
// All 20 connections are in use
const queryRunner = this.connection.createQueryRunner();
await queryRunner.connect(); // Waits... and waits...
```

### **What Happens:**
- New booking request waits for available connection
- If all connections hold locks, deadlock-like situation
- Requests timeout and fail

### **Current Settings Check:**
```typescript
// TypeORM DataSource
{
  type: 'postgres',
  poolSize: 20,  // Maximum connections
  connectionTimeoutMillis: 5000,  // Timeout waiting for connection
}
```

### **Monitoring:**
```sql
-- Check current connection usage
SELECT 
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE state = 'active') as active,
    COUNT(*) FILTER (WHERE state = 'idle') as idle,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname = 'your_database';
```

### **Mitigation:**
- Increase pool size if needed: `poolSize: 50`
- Set aggressive timeouts: `connectionTimeoutMillis: 3000`
- Monitor pool usage metrics

### **Status:** 🟢 Already configured, monitor in production

---

## **7. Database Server Crash/Restart** 🔴

### **Scenario:**
```bash
systemctl restart postgresql
```

### **What Happens:**
- ✅ All connections forcefully closed
- ✅ All transactions rolled back
- ✅ All locks released immediately
- ❌ Client apps get connection errors
- ✅ Connection pool automatically reconnects

### **Status:** ✅ Fully handled by PostgreSQL

---

## 🛡️ **PostgreSQL's Built-in Safety**

PostgreSQL ALWAYS releases locks when:

1. ✅ `COMMIT` or `ROLLBACK` executed
2. ✅ Connection closed (graceful)
3. ✅ Connection lost (TCP timeout detected)
4. ✅ Client process dies (TCP reset)
5. ✅ Server restarts
6. ✅ `pg_terminate_backend()` called

**Bottom Line:** Locks are ALWAYS eventually released, but timing matters!

---

## 📊 **Recommended Monitoring**

### **Alert on Long-Held Locks:**
```sql
-- Query to run every 30 seconds
SELECT 
    pid,
    NOW() - query_start as duration,
    query
FROM pg_stat_activity
WHERE state != 'idle'
  AND NOW() - query_start > interval '30 seconds';
```

### **Alert on Lock Waits:**
```sql
-- Find processes waiting for locks
SELECT 
    blocked.pid as blocked_pid,
    blocked.query as blocked_query,
    blocking.pid as blocking_pid,
    blocking.query as blocking_query,
    NOW() - blocked.query_start as blocked_duration
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking 
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.wait_event_type = 'Lock';
```

### **Prometheus Metrics (Recommended):**
```javascript
// Track transaction duration
transactionDuration.observe(duration);

// Alert if > 5 seconds
if (duration > 5000) {
    this.logger.warn(`Slow transaction: ${duration}ms`);
}
```

---

## ✅ **Recommended Code Improvements**

### **1. Add Transaction State Tracking:**
```typescript
let transactionStarted = false;
try {
    await queryRunner.startTransaction();
    transactionStarted = true;
    // ...
} catch (error) {
    if (transactionStarted) {
        await queryRunner.rollbackTransaction();
    }
    throw error;
}
```

### **2. Wrap `finally` in try-catch:**
```typescript
finally {
    try {
        await queryRunner.release();
    } catch (releaseError) {
        this.logger.error('Connection release failed', releaseError);
    }
}
```

### **3. Add Graceful Shutdown:**
```typescript
// In main.ts or app module
process.on('SIGTERM', async () => {
    this.logger.log('SIGTERM received, draining connections...');
    await app.close();
    process.exit(0);
});
```

### **4. Set Aggressive Timeouts:**
```typescript
// TypeORM config
{
  extra: {
    statement_timeout: 30000,        // 30 seconds
    idle_in_transaction_session_timeout: 60000,  // 1 minute
    tcp_keepalives_idle: 30,
    tcp_keepalives_interval: 10,
    tcp_keepalives_count: 3,
  }
}
```

---

## 🎯 **Summary**

| Scenario | Lock Release | Max Delay | Severity | Handled By |
|----------|--------------|-----------|----------|------------|
| Process crash | Yes | 30-120s | 🔴 | PostgreSQL |
| Network disconnect | Yes | 30-120s | 🟡 | TCP timeout |
| Normal error | Yes | Immediate | 🟢 | Our code |
| Transaction fail | Yes | Immediate | 🟡 | Needs improvement |
| Deployment | Yes | 30-60s | 🟡 | Graceful shutdown |
| DB restart | Yes | Immediate | 🔴 | PostgreSQL |
| Pool exhaustion | N/A | Timeout | 🟡 | Connection timeout |

**Overall Assessment:** ✅ Locks are always eventually released, but we can improve timeouts and error handling to minimize delay.

---

**Last Updated:** November 22, 2025  
**Priority:** 🟡 Moderate - Add improvements for production robustness

