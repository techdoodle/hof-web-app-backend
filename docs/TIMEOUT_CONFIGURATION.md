# Timeout Configuration Summary

## ✅ **Configured Files**

### **1. `src/modules/app/app.module.ts`** (Primary Application Database)
**Purpose:** Main database connection for the NestJS application

**Key Settings Added:**
```typescript
poolSize: 20,  // Maximum concurrent connections
connectTimeoutMS: 5000,  // 5 seconds to connect

extra: {
  // Query & Transaction Timeouts
  statement_timeout: 30000,  // 30 seconds - kills slow queries
  idle_in_transaction_session_timeout: 60000,  // 1 minute - kills stuck transactions
  
  // TCP Keepalive (Dead Connection Detection)
  tcp_keepalives_idle: 30,        // 30s before first probe
  tcp_keepalives_interval: 10,    // 10s between probes
  tcp_keepalives_count: 3,        // 3 failed probes = dead
  // Total: 30 + (10 × 3) = 60 seconds to detect dead connection
  
  // Connection Pool Management
  connectionTimeoutMillis: 5000,  // 5s waiting for pool connection
  idleTimeoutMillis: 30000,       // 30s before releasing idle connection
}
```

---

### **2. `src/database/data-source.ts`** (Migration CLI)
**Purpose:** Database connection for running migrations via TypeORM CLI

**Key Settings Added:**
```typescript
poolSize: 10,  // Smaller pool for CLI usage

extra: {
  statement_timeout: 120000,  // 2 minutes (migrations can be slower)
  idle_in_transaction_session_timeout: 300000,  // 5 minutes
  
  // TCP Keepalive
  tcp_keepalives_idle: 30,
  tcp_keepalives_interval: 10,
  tcp_keepalives_count: 3,
  
  connectionTimeoutMillis: 10000,  // 10 seconds for migrations
}
```

---

### **3. `src/main.ts`** (Application Bootstrap)
**Purpose:** Graceful shutdown handling

**Added:**
```typescript
// Graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handlers
process.on('uncaughtException', ...);
process.on('unhandledRejection', ...);

const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Starting graceful shutdown...`);
  await app.close();  // Closes database connections properly
  process.exit(0);
};
```

---

## 📊 **What Each Timeout Does**

### **Connection-Level Timeouts**

| Setting | Value | Purpose |
|---------|-------|---------|
| `connectTimeoutMS` | 5s | Max time to establish database connection |
| `connectionTimeoutMillis` | 5s | Max time waiting for connection from pool |
| `idleTimeoutMillis` | 30s | Release idle connections back to pool |
| `poolSize` | 20 | Maximum concurrent connections allowed |

### **Query/Transaction Timeouts**

| Setting | Value | Purpose |
|---------|-------|---------|
| `statement_timeout` | 30s | Kills queries running longer than 30 seconds |
| `idle_in_transaction_session_timeout` | 60s | Kills transactions idle for 60 seconds |

**Effect on Locks:**
- If a transaction holds a lock for > 60 seconds without activity → Killed
- Lock automatically released
- Other waiting bookings can proceed

### **TCP Keepalive Settings**

| Setting | Value | Purpose |
|---------|-------|---------|
| `tcp_keepalives_idle` | 30s | Wait 30s before checking if connection is alive |
| `tcp_keepalives_interval` | 10s | Check every 10s after that |
| `tcp_keepalives_count` | 3 | 3 failed checks = connection dead |

**Total Dead Connection Detection:** 30 + (10 × 3) = **60 seconds**

**Effect on Locks:**
- If network fails or app crashes
- Connection detected as dead within 60 seconds
- PostgreSQL rolls back transaction
- Lock released automatically

---

## 🎯 **Before vs After**

### **Before (Default Settings):**
```
Network failure → Lock held for: 2 HOURS ❌
Stuck transaction → Lock held: FOREVER ❌
App crash → Lock held for: 2 HOURS ❌
```

### **After (Our Settings):**
```
Network failure → Lock released in: 60 seconds ✅
Stuck transaction → Killed after: 60 seconds ✅
App crash → Lock released in: 60 seconds ✅
Graceful restart → Locks released: Immediately ✅
```

---

## 🚀 **Deployment Instructions**

### **1. Test Locally First:**
```bash
# Stop backend
npm run start:dev

# Watch logs for:
# - "Server is running on port 3000"
# - No connection errors
```

### **2. Test Graceful Shutdown:**
```bash
# Start app
npm run start:dev

# In another terminal, send SIGTERM
kill -15 <process-id>

# Should see:
# "SIGTERM received. Starting graceful shutdown..."
# "✅ Database connections closed successfully"
# "✅ Graceful shutdown complete"
```

### **3. Deploy to Production:**
```bash
# Commit changes
git add .
git commit -m "feat: Add database timeout configurations and graceful shutdown"
git push

# Deploy (Railway/Vercel/etc will auto-deploy)
```

### **4. Monitor After Deployment:**
```bash
# Check for timeout-related errors in logs
grep "statement timeout" production.log
grep "connection timeout" production.log

# Should see fewer (or zero) lock-related issues
```

---

## 📈 **Monitoring Queries**

### **Check Active Connections:**
```sql
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE state = 'active') as active,
    COUNT(*) FILTER (WHERE state = 'idle') as idle,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
FROM pg_stat_activity
WHERE datname = current_database();
```

### **Check Long-Running Queries:**
```sql
SELECT 
    pid,
    NOW() - query_start as duration,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
  AND NOW() - query_start > interval '10 seconds'
ORDER BY duration DESC;
```

### **Check Locks:**
```sql
SELECT 
    l.pid,
    l.mode,
    l.granted,
    a.query,
    NOW() - a.query_start as duration
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE NOT l.granted
ORDER BY a.query_start;
```

---

## ⚠️ **Tuning Guidelines**

### **If You See Timeouts on Legitimate Queries:**

**Symptom:** `statement_timeout` errors on actual bookings

**Solution:** Increase statement timeout
```typescript
statement_timeout: 60000,  // Increase to 60 seconds
```

### **If Connection Pool is Exhausted:**

**Symptom:** `connection timeout` errors, "pool exhausted"

**Solution:** Increase pool size
```typescript
poolSize: 50,  // Increase from 20
```

### **If Migrations Timeout:**

**Symptom:** Migrations fail with timeouts

**Solution:** Already configured with longer timeouts in `data-source.ts` (2 minutes)

### **If Lots of Idle Connections:**

**Symptom:** Database shows many idle connections

**Solution:** Decrease idle timeout
```typescript
idleTimeoutMillis: 10000,  // Decrease to 10 seconds
```

---

## 🎛️ **Environment-Specific Settings**

### **Development:**
```typescript
// More lenient for debugging
statement_timeout: 120000,  // 2 minutes
poolSize: 10,  // Smaller pool
```

### **Production:**
```typescript
// Aggressive timeouts for performance
statement_timeout: 30000,  // 30 seconds
poolSize: 20,  // Larger pool for concurrent users
```

### **Staging:**
```typescript
// Balance between dev and prod
statement_timeout: 60000,  // 1 minute
poolSize: 15,
```

---

## ✅ **Expected Results**

After deploying these changes, you should see:

1. ✅ **Faster Lock Release** - Max 60 seconds vs 2 hours
2. ✅ **No Stuck Transactions** - Auto-killed after 60 seconds
3. ✅ **Graceful Restarts** - Locks released immediately on deployment
4. ✅ **Better Error Messages** - Clear timeout errors instead of hangs
5. ✅ **Reduced "Slots Unavailable"** - Locks don't block forever

---

## 🔍 **Troubleshooting**

### **Error: "statement timeout"**
```
ERROR: canceling statement due to statement timeout
```
**Meaning:** Query took longer than 30 seconds  
**Action:** Investigate slow query, consider increasing timeout

### **Error: "connection timeout"**
```
ERROR: connection timeout
```
**Meaning:** Couldn't get connection from pool in 5 seconds  
**Action:** Increase pool size or decrease idle timeout

### **Error: "idle in transaction"**
```
FATAL: terminating connection due to idle-in-transaction timeout
```
**Meaning:** Transaction was idle for 60 seconds  
**Action:** This is intentional - caught a stuck transaction!

---

## 📞 **Support**

If you encounter issues:

1. Check logs: `grep -i timeout application.log`
2. Run monitoring queries above
3. Review configuration in this document
4. Adjust values based on your traffic patterns

---

**Last Updated:** November 22, 2025  
**Status:** ✅ Configured and Ready for Deployment  
**Files Modified:** 3 (app.module.ts, data-source.ts, main.ts)

