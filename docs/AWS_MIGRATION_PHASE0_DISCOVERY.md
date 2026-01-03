# AWS Migration - Phase 0: Deep Discovery & Code Review

**Status**: ✅ Completed  
**Date**: 2025-01-27  
**Purpose**: Comprehensive codebase analysis to inform AWS migration architecture decisions

---

## Table of Contents

1. [Backend Architecture Analysis](#1-backend-architecture-analysis)
2. [Frontend Architecture Analysis](#2-frontend-architecture-analysis)
3. [Admin Panel Architecture Analysis](#3-admin-panel-architecture-analysis)
4. [External Services & Dependencies](#4-external-services--dependencies)
5. [Architecture Decisions](#5-architecture-decisions-based-on-discovery)
6. [Critical Migration Considerations](#6-critical-migration-considerations)
7. [Environment Variables Inventory](#7-environment-variables-inventory)

---

## 1. Backend Architecture Analysis

### Framework & Stack

- **Framework**: NestJS v11 with TypeScript
- **ORM**: TypeORM v0.3.25 (NOT Prisma as initially assumed)
- **Database**: PostgreSQL via `DB_URL` environment variable
- **Node.js**: >= 22.0.0
- **Package Manager**: npm

### Key Findings

#### 1.1 Entry Point (`src/main.ts`)

- Express app listens on `process.env.PORT || 3000`
- Timezone set to `Asia/Kolkata` globally
- Body parser limits: **50MB** (for image/video uploads)
- Request timeout: **120 seconds** (2 minutes for video uploads)
- Graceful shutdown handlers implemented (SIGTERM, SIGINT, uncaught exceptions)
- CORS configured with multiple allowed origins:
  - Localhost variants
  - Netlify domains (production, staging)
  - Railway domains
  - Custom domains (`app.humansoffootball.in`, `api.humansoffootball.in`)
  - Currently allows all origins (temporary for debugging)

#### 1.2 Database Configuration (`src/modules/app/app.module.ts`)

- **TypeORM Connection Pool**: 20 connections maximum
- **Connection Timeouts**: 5 seconds to establish connection
- **Statement Timeout**: 30 seconds (kills long-running queries)
- **Idle Transaction Timeout**: 60 seconds (kills idle transactions)
- **TCP Keepalive**: Configured for dead connection detection (60 seconds total)
- **Connection Lifetime**: 
  - Connection timeout: 5 seconds waiting for pool connection
  - Idle timeout: 30 seconds before releasing idle connections
- **SSL**: Required (Railway), `rejectUnauthorized: false`
- **Auto-migration**: `migrationsRun: true` in non-dev environments
- **Timezone**: `Asia/Kolkata` in database connection
- **Logging**: Error-only in production, query+error in development

#### 1.3 Scheduled Jobs (using `@nestjs/schedule`)

**Booking Cleanup Service** (`src/modules/booking/booking-cleanup.service.ts`):
- `@Cron('*/1 * * * *')` - Every minute (test job)
- `@Cron('*/2 * * * *')` - Every 2 minutes (cleanup expired bookings)
- `@Cron('*/5 * * * *')` - Every 5 minutes (reconciliation)
- `@Cron('0 3 * * *')` - Daily at 3 AM (daily cleanup)
- **Distributed locking** implemented for multi-instance coordination
- Uses database-based locking to prevent duplicate runs

**PlayerNation Polling Job** (`src/modules/admin/jobs/playernation-polling.job.ts`):
- `@Cron(CronExpression.EVERY_HOUR)` - Hourly polling for stats
- Polls external PlayerNation API for match statistics

**Migration Strategy**: Convert to AWS EventBridge scheduled rules triggering ECS Fargate tasks

#### 1.4 File Storage & Image Processing

**Firebase Storage** (`src/modules/user/firebase-storage.service.ts`):
- Stores processed profile pictures
- Root path: `profile_pictures/{userId}/{uuid}.png`
- Public URLs: `https://storage.googleapis.com/{bucket}/{path}`
- Archives existing images before uploading new ones
- Supports both buffer and base64 uploads

**Image Processing Service** (`src/modules/user/image-processing.service.ts`):
- Calls **external Python service** for face detection, cropping, background removal
- Python service URL: `PYTHON_SERVICE_URL` env var (default: `http://localhost:8001`)
- Current production Python service: `https://hof-python-env-production.up.railway.app`
- Processing endpoints: `/process-selfie/`, `/health`
- Timeout: **75 seconds** for processing
- Health check endpoint with 2-second timeout
- Handles SSL/TLS errors and timeouts gracefully

**File Upload Handling**:
- Uses **Multer** for multipart/form-data file uploads
- Supports both file uploads and base64 image data

**Migration Strategy**: 
- Migrate Firebase Storage → S3
- Migrate Python service to ECS Fargate (or keep on Railway temporarily)

#### 1.5 Realtime Features

- **No WebSocket gateway found** in codebase
- Documentation mentions WebSocket for booking slot updates, but implementation appears to be **polling-based fallback**
- Push notifications via **Web Push Protocol** (VAPID keys stored in DB)
- Notification service uses `web-push` library

**Migration Strategy**: 
- ALB supports WebSockets natively if needed later
- For now, polling-based approach works fine on ECS

#### 1.6 Third-Party Integrations

- **Razorpay** - Payment gateway (`RazorpayGateway` class)
  - Order creation, payment verification, refunds
  - Webhook signature verification
- **Firebase Admin** - Storage and potentially auth
  - Firebase Storage for images
- **PlayerNation API** - Stats integration
  - Base URL: `PLAYERNATION_BASE_URL` (default: `https://api.theplayernation.com`)
  - Credentials: `PLAYERNATION_PHONE`, `PLAYERNATION_PASSWORD`
- **Email** - Nodemailer (SMTP)
  - Host: `EMAIL_HOST`
  - Port: `EMAIL_PORT` (587 or 465)
  - Credentials: `EMAIL_USER`, `EMAIL_PASSWORD`
  - From: `EMAIL_FROM`
- **Digimiles** - External service
  - Credentials: `DIGIMILES_USERNAME`, `DIGIMILES_PASSWORD`

#### 1.7 Rate Limiting

- **Throttler**: 200 requests per 60 seconds per IP
- Configured globally via `ThrottlerGuard`

---

## 2. Frontend Architecture Analysis

### Framework & Stack

- **Framework**: Next.js 14.2.33 (App Router)
- **Language**: TypeScript
- **PWA**: Enabled via `next-pwa` (service worker, offline caching)
- **Data Fetching**: React Query (TanStack Query)
- **Styling**: Tailwind CSS

### Key Findings

#### 2.1 Rendering Strategy

✅ **Fully Client-Side Rendered**
- All pages use `'use client'` directive
- No `getServerSideProps`, `getStaticProps`, or server components found
- Data fetching: Client-side via React Query hooks
- **Perfect for static export** → S3 + CloudFront (no ECS needed)

**Decision**: Use `output: 'export'` in `next.config.mjs` for static build

#### 2.2 API Configuration (`src/config/api.ts`)

- Base URL: `process.env.NEXT_PUBLIC_API_BASE_URL` or defaults
- Development: `http://localhost:8000`
- Production: Environment variable or fallback to hardcoded URL

#### 2.3 Image Processing

- Client-side face detection (MediaPipe) for UX validation
- Backend Python service does actual processing
- Upload via base64 or File object
- Image upload service handles validation and API calls

#### 2.4 Build Configuration (`next.config.mjs`)

- PWA configured with `next-pwa`
- Runtime caching: NetworkFirst strategy, 24-hour cache
- Console removal in production builds
- Image domains: `api.hof.com`, `storage.googleapis.com`
- **Action Required**: Add `output: 'export'` for static export

#### 2.5 Pages Structure

All pages in `src/app/` are client components:
- Home (`page.tsx`)
- Onboarding (`onboarding/page.tsx`)
- Profile (`profile/page.tsx`, `profile/edit-selfie/page.tsx`, `profile/me/page.tsx`)
- Matches (`match/[id]/page.tsx`, `match-details/[id]/page.tsx`)
- Bookings (`bookings/page.tsx`, `bookings/[bookingId]/page.tsx`)
- Book Match (`book-match/[id]/page.tsx`)
- Leaderboard (`leaderboard/page.tsx`)
- Waitlist (`waitlist/confirm/page.tsx`)
- Play (`play/page.tsx`)
- Home (`home/page.tsx`)

---

## 3. Admin Panel Architecture Analysis

### Framework & Stack

- **Framework**: Create React App (react-scripts 5.0.1)
- **Admin UI**: React Admin v5.11.3
- **UI Components**: Material-UI (MUI)
- **Language**: TypeScript
- **Pure SPA** - no server-side rendering

### Key Findings

#### 3.1 Environment Configuration (`src/config/environment.ts`)

- **Local**: `http://localhost:8000`
- **Staging**: `https://testapi.humansoffootball.in`
- **Production**: `https://api.humansoffootball.in`
- Environment set via `REACT_APP_ENVIRONMENT` and `REACT_APP_API_URL`

#### 3.2 Build

- Standard CRA build: `react-scripts build`
- Output: `build/` directory (static files)
- **Perfect candidate for S3 + CloudFront** static hosting
- No changes needed to build process

#### 3.3 Features

- User management (Admin/Super Admin)
- Match management (All admin roles)
- CSV stats upload
- Analytics and reporting
- Role-based access control

---

## 4. External Services & Dependencies

### 4.1 Python Image Processing Service

- **Current Hosting**: Railway
- **URL**: `https://hof-python-env-production.up.railway.app`
- **Purpose**: Face detection, pose detection, cropping, background removal
- **Endpoints**: `/process-selfie/`, `/health`
- **Timeout**: 75 seconds for processing
- **Decision Needed**: 
  - **Option A (Recommended)**: Migrate to ECS Fargate as separate service
  - **Option B**: Keep on Railway temporarily, migrate later
  - **Option C**: AWS Lambda + container image (if processing < 15 min)

### 4.2 Firebase Storage

- **Current Usage**: Storing processed profile pictures
- **Structure**: `profile_pictures/{userId}/{uuid}.png`
- **Public URLs**: `https://storage.googleapis.com/{bucket}/{path}`
- **Decision**: Migrate to S3
  - Cost savings (S3 is cheaper than Firebase Storage)
  - Better integration with CloudFront
  - Migration script needed for existing images

### 4.3 Database

- **Current**: PostgreSQL on Railway
- **Migrations**: TypeORM migrations in `src/database/migrations/`
- **Connection Pool**: 20 connections
- **Timezone**: Asia/Kolkata
- **SSL**: Required
- **Migration Strategy**: 
  - Initial dump/restore for staging
  - Choose replication strategy based on DB size and write patterns

---

## 5. Architecture Decisions Based on Discovery

### 5.1 Backend (ECS Fargate)

✅ **Single ECS Service for API**
- No separate websocket service needed initially
- ALB with sticky sessions if websockets are added later
- Task size: Start with `0.5 vCPU, 1GB` (50MB uploads + Python service calls need memory)
- Autoscaling based on CPU/memory + ALB request count

### 5.2 Background Jobs

✅ **EventBridge Scheduled Rules → ECS Fargate Tasks**
- Same Docker image, different entrypoint/command
- Jobs to migrate:
  - Booking cleanup (every 2 min, 5 min, daily 3 AM)
  - PlayerNation polling (hourly)
- Use **distributed locking** via DynamoDB or RDS to prevent duplicate runs

### 5.3 Python Service

**Option A (Recommended)**: Migrate to **ECS Fargate** as separate service
- Same VPC, internal ALB or service discovery
- Cost-effective, scalable
- Better latency (same VPC)

**Option B**: Keep on Railway temporarily, migrate later
- Works but adds cross-cloud latency

**Option C**: AWS Lambda + container image
- Only if processing is < 15 minutes
- May be more cost-effective for low volume

### 5.4 File Storage

✅ **Migrate from Firebase Storage → S3**
- Cost savings
- Better CloudFront integration
- S3 bucket structure: `hof-assets-{env}/profile-pictures/{userId}/{uuid}.png`
- CloudFront distribution for CDN (optional but recommended)

### 5.5 Frontend (Next.js)

✅ **Static Export → S3 + CloudFront**
- Confirmed: Fully client-side rendered
- Add `output: 'export'` to `next.config.mjs`
- No ECS needed (significant cost savings)
- Build output: `out/` directory

### 5.6 Admin Panel

✅ **S3 + CloudFront** (pure static SPA)
- No changes needed to build process
- Build output: `build/` directory

### 5.7 Database Migration

- TypeORM migrations already in place
- Need to verify DB size and write patterns to choose replication strategy
- RDS parameter group should match current settings:
  - Timezone: Asia/Kolkata
  - Statement timeout: 30 seconds
  - Idle transaction timeout: 60 seconds
  - Connection pool: 20 connections

---

## 6. Critical Migration Considerations

### 6.1 Python Service Dependency

- Backend **requires** Python service for image processing
- Must migrate Python service **before or alongside** backend
- Or keep Python service on Railway temporarily (adds latency, but works)
- **Recommendation**: Migrate Python service to ECS Fargate in same VPC

### 6.2 Firebase Storage Migration

- Existing images need one-time migration script
- Update `FirebaseStorageService` to use S3 instead
- Or create abstraction layer (StorageService interface) for gradual migration
- **Recommendation**: Create S3 storage service, migrate images in background

### 6.3 Environment Variables

- **All secrets** must move to AWS SSM Parameter Store or Secrets Manager
- Update NestJS ConfigModule to read from SSM (or keep env vars, inject from ECS task definition)
- **Recommendation**: Use SSM Parameter Store (cheaper) for non-sensitive, Secrets Manager for sensitive

### 6.4 CORS Configuration

- Update `allowedOrigins` in `main.ts` to include new AWS domains
- Or make it environment-driven (read from SSM/env)
- **Recommendation**: Move to environment variable or SSM parameter

### 6.5 Database Connection

- RDS SSL: Update `rejectUnauthorized` based on RDS certificate
- Connection string format: RDS provides standard PostgreSQL URL
- **Recommendation**: Use RDS-provided certificate, set `rejectUnauthorized: true` for security

### 6.6 Cron Jobs

- Convert `@Cron` decorators to EventBridge rules
- Or keep decorators but ensure only one instance runs (distributed lock)
- **Recommendation**: Use EventBridge for better observability and control

### 6.7 Request Timeouts

- Current: 120 seconds for video uploads
- ALB default timeout: 60 seconds
- **Action**: Increase ALB idle timeout to 120 seconds for video uploads

---

## 7. Environment Variables Inventory

### Backend Environment Variables

```bash
# Database
DB_URL                          # PostgreSQL connection string

# Server
PORT                            # Server port (default: 3000)
NODE_ENV                        # Environment (development, production)

# Python Service
PYTHON_SERVICE_URL              # Image processing service URL

# Firebase
FIREBASE_STORAGE_ROOT           # Storage root path (default: profile_pictures)
# Firebase credentials (via service account JSON or env vars)

# Payment Gateway
RAZORPAY_KEY_ID                 # Razorpay API key
RAZORPAY_KEY_SECRET             # Razorpay API secret

# PlayerNation API
PLAYERNATION_BASE_URL           # API base URL (default: https://api.theplayernation.com)
PLAYERNATION_PHONE              # Phone number for authentication
PLAYERNATION_PASSWORD           # Password for authentication

# Email (SMTP)
EMAIL_HOST                      # SMTP host
EMAIL_PORT                      # SMTP port (587 or 465)
EMAIL_USER                     # SMTP username
EMAIL_PASSWORD                 # SMTP password
EMAIL_FROM                     # From email address

# Digimiles
DIGIMILES_USERNAME              # Digimiles username
DIGIMILES_PASSWORD              # Digimiles password

# Security
OTP_ENCRYPTION_KEY             # OTP encryption key
JWT_SECRET                      # JWT secret (implied from auth module)

# Push Notifications
VAPID_PUBLIC_KEY                # VAPID public key
VAPID_PRIVATE_KEY               # VAPID private key

# Frontend
FRONTEND_URL                    # Frontend URL for CORS
```

### Frontend Environment Variables

```bash
NEXT_PUBLIC_API_BASE_URL        # Backend API base URL
NODE_ENV                        # Environment (development, production)
```

### Admin Environment Variables

```bash
REACT_APP_ENVIRONMENT           # Environment (local, staging, production)
REACT_APP_API_URL               # Backend API URL
```

---

## 8. Migration Priority & Sequencing

### Phase 1: Infrastructure Setup
1. Create `hof-infra` Terraform repo
2. Design and implement Terraform modules
3. Set up AWS accounts/environments (staging, prod)

### Phase 2: Backend Containerization
1. Create Dockerfile for backend
2. Test locally with Docker Compose
3. Set up GitHub Actions CI/CD

### Phase 3: Python Service Migration
1. Containerize Python service
2. Deploy to ECS Fargate (staging first)
3. Update backend to use new Python service URL

### Phase 4: Frontend & Admin Migration
1. Update Next.js config for static export
2. Set up S3 + CloudFront for frontend
3. Set up S3 + CloudFront for admin
4. Configure GitHub Actions for deployment

### Phase 5: Database Migration
1. Provision RDS (staging)
2. Test migration process
3. Rehearse production migration
4. Execute production migration

### Phase 6: File Storage Migration
1. Create S3 buckets and CloudFront distribution
2. Update backend to use S3 instead of Firebase
3. Migrate existing images (background job)
4. Update frontend image URLs

### Phase 7: Production Cutover
1. Final DB sync
2. Deploy all services to production
3. DNS cutover
4. Monitor and validate

---

## 9. Cost Optimization Opportunities

### Compute
- Use small ECS task sizes initially (0.5 vCPU, 1GB)
- Autoscale based on actual usage
- Consider Spot Fargate for non-critical workers

### Storage
- S3 lifecycle policies for old images
- CloudFront caching for static assets
- S3 Intelligent-Tiering for infrequently accessed data

### Database
- Right-size RDS instance based on actual usage
- Use storage auto-scaling
- Consider Reserved Instances after usage stabilizes

### Networking
- Use CloudFront for all static assets
- Optimize ALB target groups
- Use VPC endpoints for S3 (reduce data transfer costs)

---

## 10. Next Steps

1. ✅ **Phase 0 Complete**: Deep discovery and code review
2. **Phase 1**: Create Terraform infrastructure repo and design modules
3. **Phase 2**: Containerize backend and Python service
4. **Phase 3**: Set up CI/CD pipelines
5. **Phase 4**: Deploy staging environment
6. **Phase 5**: Test and validate staging
7. **Phase 6**: Plan and execute production migration

---

## Appendix: File References

### Backend Key Files
- `src/main.ts` - Application entry point
- `src/modules/app/app.module.ts` - Main module configuration
- `src/modules/booking/booking-cleanup.service.ts` - Scheduled jobs
- `src/modules/admin/jobs/playernation-polling.job.ts` - PlayerNation polling
- `src/modules/user/image-processing.service.ts` - Image processing
- `src/modules/user/firebase-storage.service.ts` - File storage
- `src/config/configuration.ts` - Configuration
- `src/config/playernation.config.ts` - PlayerNation config

### Frontend Key Files
- `next.config.mjs` - Next.js configuration
- `src/app/layout.tsx` - Root layout
- `src/config/api.ts` - API configuration
- All pages in `src/app/` are client components

### Admin Key Files
- `src/config/environment.ts` - Environment configuration
- `package.json` - Build scripts

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-27  
**Author**: AWS Migration Team

