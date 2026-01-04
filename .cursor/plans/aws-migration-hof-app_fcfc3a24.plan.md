---
name: aws-migration-hof-app
overview: Design a cost-conscious, scalable AWS architecture and a staged migration plan for the backend, frontend, admin, and PostgreSQL database from Railway/Netlify to AWS with minimal downtime.
todos:
  - id: choose-infra-repo-layout
    content: Decide and document whether to use a dedicated hof-infra repo or an /infra directory in an existing repo for Terraform.
    status: pending
  - id: design-terraform-modules
    content: Design Terraform module structure for VPC, ECS, RDS, static sites, jobs, and security for staging and prod.
    status: pending
    dependencies:
      - choose-infra-repo-layout
  - id: backend-containerization-and-ci
    content: Create Dockerfile and GitHub Actions pipeline for backend to build, push to ECR, and deploy to ECS staging.
    status: pending
    dependencies:
      - design-terraform-modules
  - id: frontend-admin-ci
    content: Create GitHub Actions pipelines for frontend and admin to build and deploy to S3 + CloudFront staging.
    status: pending
    dependencies:
      - design-terraform-modules
  - id: stand-up-staging-stack
    content: Provision full staging stack (VPC, ECS, RDS, S3, CloudFront) and wire apps and DB together.
    status: pending
    dependencies:
      - backend-containerization-and-ci
      - frontend-admin-ci
  - id: db-migration-drill
    content: Rehearse PostgreSQL migration from Railway to RDS in staging and refine steps for minimal downtime.
    status: pending
    dependencies:
      - stand-up-staging-stack
  - id: production-cutover-plan
    content: Write detailed runbook for production cutover, monitoring, and rollback, then execute migration.
    status: pending
    dependencies:
      - db-migration-drill
---

## AWS Migration Plan for HOF (BE, FE, Admin, DB)

### 1. High-level target architecture on AWS

```mermaid
flowchart LR
  subgraph vpcMain[App VPC]
    alb[ALB
"HTTPS, path routing"]
    ecsApi[ECS Fargate
"Node/Express API"]
    subgraph privateSubnets[Private Subnets]
      rds[RDS Postgres]
      redis[ElastiCache (optional)]
    end
  end

  user[Mobile/Web Users] --> cdn[CloudFront]
  cdn --> s3Frontend[S3 Frontend]
  cdn --> s3Admin[S3 Admin]
  cdn --> alb

  alb --> ecsApi

  ecsApi --> rds
  ecsApi --> redis
  ecsApi --> s3Assets[S3 Assets/Uploads]

  subgraph awsServices[Other AWS Services]
    ses[SES / Email]
    sqs[SQS (background jobs)]
    events[EventBridge / CloudWatch Events (cron)]
  end

  ecsApi --> sqs
  sqs --> ecsWorkers[ECS Fargate Workers]
  events --> ecsWorkers
  ecsApi --> ses
```



- **Backend**: `ECS Fargate` service behind an **Application Load Balancer (ALB)** in a private VPC; one service per environment (staging, prod).
- **Database**: `Amazon RDS for PostgreSQL` in private subnets; separate instances for staging and prod.
- **Frontend & Admin**: `S3` + `CloudFront` for static hosting; TLS via `ACM`, custom domains via `Route53`.
- **Background jobs / cron**: `ECS Fargate` scheduled tasks (via EventBridge) or `SQS` + worker service.
- **File uploads**: `S3` bucket (per env) for user/admin assets, optional `CloudFront` distribution in front.
- **Auth & secrets**: `AWS Secrets Manager` or `SSM Parameter Store` for DB credentials, API keys, OAuth secrets.
- **Observability**: `CloudWatch Logs` for app logs, metrics & alarms for CPU, memory, RDS, error rates.

This setup is **scalable**, **managed**, and can be tuned to be **cost-conscious** (small Fargate tasks + modest RDS instance + aggressive autoscaling).---

### 2. Repo and branching strategy (no forks)

- **Keep the existing three repos**:
- `hof-web-app-backend` (BE)
- `hof-web-app-frontend` (FE)
- `hof-admin` (Admin)
- **No forks for infra migration**:
- Forks make it harder to keep in sync and complicate PR review; not needed here.
- **Use branches + infra directories instead**:
- Create long-lived infra branches **per repo** for the initial work (e.g. `feature/aws-migration`), but:
    - Day-to-day dev continues on `main` as usual.
    - Merge infra changes to `main` when each piece is ready.
- Optionally create a **separate infra repo** (e.g. `hof-infra`) containing **Terraform code** that manages:
    - VPC, ALB, ECS, RDS, S3, CloudFront, Route53, Secrets.
    - CI users/roles (IAM) for GitHub Actions.
- In app repos, keep only **app-level deployment config** (GitHub Actions workflows, Dockerfiles, task definitions if needed) – infra stays in Terraform.

**Recommendation**: One dedicated `hof-infra` repo for Terraform, plus normal feature branches in app repos. This avoids forking, keeps history clean, and lets infra evolve independently.---

### 3. Environments and AWS accounts

- **AWS account strategy** (per your answer):
- Use **one AWS account** with **multiple environments**:
    - `staging` and `prod` resources separated by naming, tags, and sometimes VPCs.
- **Environment layout**:
- `vpc-staging`, `vpc-prod` (either two VPCs or one VPC with separated subnets; two VPCs is cleaner).
- `rds-staging`, `rds-prod`.
- `ecs-service-api-staging`, `ecs-service-api-prod`.
- S3 buckets: `hof-frontend-staging`, `hof-frontend-prod`, `hof-admin-staging`, `hof-admin-prod`, `hof-assets-staging`, `hof-assets-prod`.
- CloudFront distributions: one for FE, one for Admin; each with staging + prod origins or separate distributions per env.

---

### 4. Terraform structure and responsibilities

- **New `hof-infra` repo** (or `/infra` folder in backend repo if you prefer):
- `main.tf`, `providers.tf`, `variables.tf`, `outputs.tf`.
- `environments/`:
    - `staging/` and `prod/` workspaces or separate state files.
- `modules/`:
    - `network/` – VPC, subnets, NAT, Internet Gateway, routing.
    - `ecs/` – cluster, services, task definitions, autoscaling policies.
    - `rds/` – Postgres instances, parameter groups, subnet groups.
    - `static_site/` – S3 + CloudFront + ACM + Route53 integration.
    - `jobs/` – SQS, ECS worker tasks, EventBridge schedules.
    - `security/` – IAM roles for ECS, GitHub Actions OIDC, Secrets Manager/SSM.
- **Terraform responsibilities**:
- Create **all shared infra** (network, compute, DB, buckets, distributions, DNS, roles).
- Do **not** embed app build logic – that remains in GitHub Actions.

---

### 5. Backend migration plan (Railway → ECS Fargate)

1. **Containerize backend if not already**

- Add a lean `Dockerfile` in `hof-web-app-backend`:
    - Multi-stage build (builder + runtime) to keep images small.
    - Expose the same port your Express app currently uses.
- Ensure all config is driven via **environment variables** (DB URL, Redis, third-party APIs, auth secrets), which you will later inject from Secrets Manager/SSM.

2. **Add GitHub Actions pipeline for backend**

- Workflow triggers:
    - `push` to `main` → build & deploy to `staging` on AWS.
    - manual `workflow_dispatch` or tag (e.g. `vX.Y.Z`) → deploy to `prod`.
- Steps:
    - Build Docker image.
    - Push to `ECR` (per-environment repositories or shared with tags).
    - Update ECS service/task definition via `aws-actions` or a small CD script.

3. **Define ECS Fargate service via Terraform**

- ECS cluster in private subnets, tasks with:
    - Small task size for cost (`0.25 vCPU`, `512MB` or `1GB` memory to start).
    - Desired count `1`–`2` for staging and `2+` for prod.
- ALB target group and listener rules:
    - HTTPS only via ACM; redirect HTTP → HTTPS.
- Autoscaling policies based on CPU/memory and/or ALB request count.

4. **Set up environment variables and secrets**

- Create `SSM`/`Secrets Manager` entries for DB URL, Redis URL (if any), auth secrets, third-party keys.
- Wire them into ECS task definition via Terraform.

5. **Smoke test in staging**

- Point **staging FE & Admin** to the **staging backend ALB** URL.
- Run a subset of end-to-end flows (login, booking, stats, ticketing, etc.).

6. **Cutover strategy for backend**

- Initially, **keep Railway backend running**; FE & Admin still call it in production.
- After DB is replicated/migrated (see Section 7), flip FE & Admin production to the ECS backend via **environment variables** and DNS switch.

---

### 6. Frontend & Admin migration plan (Netlify → S3 + CloudFront)

1. **Review existing builds**

- Confirm existing `npm run build` commands for:
    - `hof-web-app-frontend` (Next.js app).
    - `hof-admin` (React admin app).

2. **Static hosting strategy**

- For `hof-web-app-frontend` (Next.js):
    - ✅ **Confirmed**: Fully client-side rendered (all pages use `'use client'`)
    - ✅ **Decision**: Add `output: 'export'` to `next.config.mjs` for static export
    - ✅ Host via **S3 + CloudFront** (no ECS needed - significant cost savings)
    - Build command: `next build` (with static export config)
    - Output directory: `out/` (Next.js static export default)
- For `hof-admin` (Create React App):
    - ✅ Straightforward S3 static hosting + CloudFront.
    - Build output: `build/` directory

3. **Terraform static site module**

- S3 bucket + CloudFront + ACM + Route53 for each site.
- Configure sensible cache behavior and invalidation hooks.

4. **GitHub Actions pipelines for FE and Admin**

- On `push` to `main`:
    - Build FE/Admin.
    - Sync build output to S3 (`aws s3 sync`).
    - Create a CloudFront invalidation for changed assets.
- Use separate jobs for `staging` vs `prod` (different S3 buckets and distributions).

5. **Cutover plan for FE and Admin**

- Start by deploying **staging** versions to AWS S3 + CloudFront using a **staging domain** (e.g. `staging.app.example.com`, `staging.admin.example.com`).
- Test against **staging backend** thoroughly.
- For **production** cutover:
    - Create/validate ACM certificates.
    - Update Route53 DNS to point `app.example.com` and `admin.example.com` to new CloudFront distributions.
    - Keep Netlify as a temporary backup (with different domains or as fallback) until you’re confident.

---

### 7. PostgreSQL migration plan (Railway → RDS Postgres) with minimal downtime

1. **Provision RDS Postgres in Terraform**

- Choose a small but production-suitable instance (e.g. `db.t4g.small` or `db.t4g.medium` depending on current load).
- Allocate enough storage and enable:
    - Multi-AZ if availability is critical (cost vs reliability tradeoff).
    - Automated backups and point-in-time recovery.
- Security:
    - DB in private subnets, accessible only from ECS tasks and temporary migration hosts via security groups.

2. **Initial data load (offline copy)**

- Use `pg_dump` (or Railway’s backup export) to create a snapshot of the existing Postgres DB.
- Restore into RDS using `psql` from a temporary EC2 or your local machine with VPN/SSH tunnel.
- This creates a **near-current** copy of data in RDS.

3. **Sync strategy for minimal downtime** (two options)

- **Option A – Short read-only window (simpler)**:
    - Choose a low-traffic period.
    - Temporarily put the app into **maintenance mode** (read-only or full downtime) on Railway.
    - Run an incremental `pg_dump` or `pg_dump` of latest data (if downtime window is acceptable).
    - Restore the latest dump into RDS, overwriting the previous copy or applying deltas.
    - Switch backend connection strings to RDS, deploy backend on ECS, and then cut FE/Admin over.
    - Total downtime can typically be kept to **a few minutes** with good planning.
- **Option B – Logical replication (more complex)**:
    - Set up **logical replication** or a tool like `pglogical`/`pg_repack` from Railway Postgres to RDS.
    - Allow changes to be continuously streamed until lag is near zero.
    - Schedule a very short cutover window where you:
    - Stop writes on Railway (maintenance mode).
    - Wait for replication lag to reach zero.
    - Point backend config to RDS and bring the AWS stack live.
    - This minimizes downtime to **seconds**–**tens of seconds** but requires more setup.

4. **Validation & rollback**

- Before cutover:
    - Run regression tests against RDS (via staging backend configured to RDS snapshot).
- At cutover:
    - Monitor errors, slow queries, and connection issues closely.
- Rollback plan:
    - If anything goes wrong, switch DNS/env vars back to Railway DB + backend, and disable traffic to AWS until fixed.

---

### 8. Handling background jobs, file storage, realtime, and third-party auth

- **Background jobs / cron**:
- Identify existing jobs (from Railway cron or code): email sending, stats processing, cleanups, etc.
- Implement on AWS using:
    - `EventBridge` scheduled rules triggering ECS Fargate tasks, or
    - `SQS` + ECS workers for queue-based jobs.
- Use the same Docker image (with a different `CMD`) to run workers, to keep maintenance simple.
- **File storage (images, avatars, etc.)**:
- Audit current usage (Netlify/Railway or third-party) and migrate assets to `S3`.
- In backend, adjust file upload endpoints to store in `S3` and return CloudFront/S3 URLs.
- For existing files, one-time migration from old storage to S3 (scripted job).
- **Realtime features**:
- If using websockets today, host them on ECS along with the Express app (ALB supports websockets).
- For long-term scalability, consider `API Gateway WebSocket` + `Lambda` or `Amazon IVS Chat`, but starting with ECS is usually enough.
- **Third-party auth**:
- Store OAuth client IDs and secrets in Secrets Manager/SSM.
- Ensure callback URLs are updated for new domains, and both old and new are allowed during migration window.

---

### 9. Cost-control strategies

- **Compute (ECS Fargate)**:
- Start with **small task sizes** and **low desired counts**; autoscale up when needed.
- Use **spot Fargate** for non-critical worker tasks if appropriate.
- **RDS**:
- Right-size instance type; avoid over-provisioning.
- Use storage auto-scaling and start with modest IOPS.
- Consider **reserved instances** or **Savings Plans** once usage stabilizes.
- **S3 + CloudFront**:
- Use caching aggressively for static assets.
- Compress assets (Gzip/Brotli) and optimize images.
- **Observability & logging**:
- Use log retention policies in CloudWatch (e.g. 7–30 days) to avoid unbounded costs.
- **Enforce tagging**:
- Standard tags (e.g. `env`, `service`, `owner`) to enable clear cost allocation and clean-up.

---

### 10. Cutover sequencing for a seamless user experience

1. **Phase 1 – Prepare infra (non-disruptive)**

- Build out VPC, RDS (initially with snapshot), ECS cluster, S3, CloudFront, Route53 records for staging.
- Set up GitHub Actions pipelines for all three repos.
- Deploy full stack to `staging` and run full tests.

2. **Phase 2 – DB near-live copy**

- Perform initial DB dump and restore to RDS.
- Configure backend staging to use RDS and verify everything works.

3. **Phase 3 – Dry runs & performance checks**

- Run load tests or at least moderate synthetic traffic on staging.
- Tune RDS parameters, ECS task sizes, and autoscaling.

4. **Phase 4 – Production cutover window**

- Announce **maintenance window** (even if you aim to make it very short) to be safe.
- Put Railway-backed app into maintenance/read-only.
- Perform final DB sync (dump/restore or replication catch-up).
- Point backend config to RDS and deploy ECS backend with **production** settings.
- Switch FE & Admin DNS from Netlify to CloudFront.

5. **Phase 5 – Post-cutover monitoring & rollback readiness**

- Watch logs, error rates, DB metrics, and user feedback.
- Keep Railway + Netlify infra intact but idle for a **defined rollback window** (e.g. 24–72 hours).

---

### 11. Phase 0 - Deep Discovery & Code Review (COMPLETED)

**Status**: ✅ Completed comprehensive codebase analysis

#### 11.1 Backend Architecture (`hof-web-app-backend`)

**Framework & Stack**:

- **NestJS** (v11) with TypeScript
- **TypeORM** (v0.3.25) for database ORM (NOT Prisma as initially assumed)
- **PostgreSQL** via `DB_URL` environment variable
- **Node.js** >= 22.0.0

**Key Findings**:

1. **Entry Point** (`src/main.ts`):

- Express app on `process.env.PORT || 3000`
- Timezone set to `Asia/Kolkata`
- Body parser limits: **50MB** (for image/video uploads)
- Request timeout: **120 seconds** (2 minutes for video uploads)
- Graceful shutdown handlers (SIGTERM, SIGINT)
- CORS configured with multiple allowed origins (Netlify, Railway, custom domains)

2. **Database Configuration** (`src/modules/app/app.module.ts`):

- TypeORM connection pool: **20 connections**
- Connection timeouts: 5 seconds
- Statement timeout: **30 seconds**
- Idle transaction timeout: **60 seconds**
- SSL required (Railway): `rejectUnauthorized: false`
- Auto-migration on startup: `migrationsRun: true` (non-dev)
- Timezone: `Asia/Kolkata`

3. **Scheduled Jobs** (using `@nestjs/schedule`):

- **Booking Cleanup Service** (`booking-cleanup.service.ts`):
    - `@Cron('*/1 * * * *')` - Every minute (test job)
    - `@Cron('*/2 * * * *')` - Every 2 minutes (cleanup expired bookings)
    - `@Cron('*/5 * * * *')` - Every 5 minutes (reconciliation)
    - `@Cron('0 3 * * *')` - Daily at 3 AM (daily cleanup)
- **PlayerNation Polling Job** (`playernation-polling.job.ts`):
    - `@Cron(CronExpression.EVERY_HOUR)` - Hourly polling for stats
- **Distributed locking** implemented for multi-instance coordination

4. **File Storage & Image Processing**:

- **Firebase Storage** (`firebase-storage.service.ts`):
    - Stores processed profile pictures
    - Root path: `profile_pictures/{userId}/{uuid}.png`
    - Public URLs: `https://storage.googleapis.com/{bucket}/{path}`
- **Image Processing Service** (`image-processing.service.ts`):
    - Calls **external Python service** for face detection, cropping, background removal
    - Python service URL: `PYTHON_SERVICE_URL` env var (default: `http://localhost:8001`)
    - Current production Python service: `https://hof-python-env-production.up.railway.app`
    - Processing endpoints: `/process-selfie/`, `/health`
    - Timeout: **75 seconds** for processing
- **Multer** for file upload handling

5. **Realtime Features**:

- **No WebSocket gateway found** in codebase
- Documentation mentions WebSocket for booking slot updates, but implementation appears to be **polling-based fallback**
- Push notifications via **Web Push Protocol** (VAPID keys stored in DB)

6. **Third-Party Integrations**:

- **Razorpay** - Payment gateway (RazorpayGateway class)
- **Firebase Admin** - Storage and potentially auth
- **PlayerNation API** - Stats integration (`PLAYERNATION_BASE_URL`, `PLAYERNATION_PHONE`, `PLAYERNATION_PASSWORD`)
- **Email** - Nodemailer (SMTP: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`)
- **Digimiles** - (`DIGIMILES_USERNAME`, `DIGIMILES_PASSWORD`)

7. **Environment Variables Required**:
   ```javascript
      DB_URL (PostgreSQL connection string)
      PORT (default: 3000)
      PYTHON_SERVICE_URL
      FIREBASE_STORAGE_ROOT
      RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
      PLAYERNATION_BASE_URL, PLAYERNATION_PHONE, PLAYERNATION_PASSWORD
      EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM
      DIGIMILES_USERNAME, DIGIMILES_PASSWORD
      OTP_ENCRYPTION_KEY
      JWT_SECRET (implied from auth module)
      VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (for push notifications)
      FRONTEND_URL
   ```




8. **Rate Limiting**:

- Throttler: **200 requests per 60 seconds** per IP

#### 11.2 Frontend Architecture (`hof-web-app-frontend`)

**Framework & Stack**:

- **Next.js 14.2.33** (App Router)
- **TypeScript**
- **PWA** enabled via `next-pwa` (service worker, offline caching)
- **React Query** for data fetching

**Key Findings**:

1. **Rendering Strategy**:

- Uses **App Router** (`src/app/` directory)
- ✅ **Fully client-side rendered** - All pages use `'use client'` directive
- ✅ **No SSR/SSG** - No `getServerSideProps`, `getStaticProps`, or server components found
- ✅ **Perfect for static export** - Can use `next export` or `output: 'export'` in next.config
- Data fetching: Client-side via React Query hooks
- PWA configured with runtime caching (NetworkFirst, 24hr cache)
- Console removal in production builds
- **Decision**: Use **static export** → S3 + CloudFront (no ECS needed for frontend)

2. **API Configuration** (`src/config/api.ts`):

- Base URL: `process.env.NEXT_PUBLIC_API_BASE_URL` or defaults
- Development: `http://localhost:8000`
- Production: Environment variable or fallback

3. **Image Processing**:

- Client-side face detection (MediaPipe) for UX validation
- Backend Python service does actual processing
- Upload via base64 or File object

4. **Build Output**:

- Standard Next.js build (`next build`)
- No explicit static export configured (need to verify if SSR-heavy)

#### 11.3 Admin Panel Architecture (`hof-admin`)

**Framework & Stack**:

- **Create React App** (react-scripts 5.0.1)
- **React Admin** (v5.11.3) for admin UI
- **Material-UI** components
- **Pure SPA** - no server-side rendering

**Key Findings**:

1. **Environment Configuration** (`src/config/environment.ts`):

- Local: `http://localhost:8000`
- Staging: `https://testapi.humansoffootball.in`
- Production: `https://api.humansoffootball.in`
- Environment set via `REACT_APP_ENVIRONMENT` and `REACT_APP_API_URL`

2. **Build**:

- Standard CRA build: `react-scripts build`
- Output: `build/` directory (static files)
- **Perfect candidate for S3 + CloudFront** static hosting

#### 11.4 External Services & Dependencies

1. **Python Image Processing Service**:

- Currently hosted on Railway: `https://hof-python-env-production.up.railway.app`
- **Decision needed**: Migrate to AWS (ECS Fargate) or keep on Railway temporarily?
- Processing: Face detection, pose detection, cropping, background removal

2. **Firebase Storage**:

- Currently storing processed images
- **Decision needed**: Migrate to S3 or keep Firebase? (Cost vs. simplicity)

3. **Database**:

- PostgreSQL on Railway
- TypeORM migrations in `src/database/migrations/`
- Connection pooling: 20 connections
- Timezone: Asia/Kolkata

#### 11.5 Architecture Decisions Based on Discovery

**Updated AWS Architecture Recommendations**:

1. **Backend (ECS Fargate)**:

- ✅ Single ECS service for API (no separate websocket service needed initially)
- ✅ ALB with **sticky sessions** if websockets are added later
- ✅ Task size: Start with `0.5 vCPU, 1GB` (50MB uploads + Python service calls need memory)
- ✅ Autoscaling based on CPU/memory + ALB request count

2. **Background Jobs**:

- ✅ **EventBridge** scheduled rules → ECS Fargate tasks (same Docker image, different entrypoint)
- ✅ Jobs to migrate:
    - Booking cleanup (every 2 min, 5 min, daily 3 AM)
    - PlayerNation polling (hourly)
- ✅ Use **distributed locking** via DynamoDB or RDS to prevent duplicate runs

3. **Python Service**:

- **Option A (Recommended)**: Migrate to **ECS Fargate** as separate service
    - Same VPC, internal ALB or service discovery
    - Cost-effective, scalable
- **Option B**: Keep on Railway temporarily, migrate later
- **Option C**: Use AWS Lambda + container image (if processing is < 15 min)

4. **File Storage**:

- **Decision**: Migrate from Firebase Storage → **S3**
    - Cost savings (S3 is cheaper than Firebase Storage)
    - Better integration with CloudFront
    - Migration script needed for existing images
- S3 bucket structure: `hof-assets-{env}/profile-pictures/{userId}/{uuid}.png`
- CloudFront distribution for CDN (optional but recommended)

5. **Frontend (Next.js)**:

- ✅ **Confirmed**: Fully client-side rendered (all pages use `'use client'`)
- ✅ **Decision**: Static export (`output: 'export'` in next.config) → S3 + CloudFront
- No ECS needed for frontend (cost savings)
- Update `next.config.mjs` to add `output: 'export'` for static build

6. **Admin Panel**:

- ✅ **S3 + CloudFront** (pure static SPA)
- No changes needed to build process

7. **Database Migration**:

- TypeORM migrations already in place
- Need to verify DB size and write patterns to choose replication strategy
- RDS parameter group should match current settings (timezone, timeouts)

#### 11.6 Critical Migration Considerations

1. **Python Service Dependency**:

- Backend **requires** Python service for image processing
- Must migrate Python service **before or alongside** backend
- Or keep Python service on Railway temporarily (adds latency, but works)

2. **Firebase Storage Migration**:

- Existing images need one-time migration script
- Update `FirebaseStorageService` to use S3 instead
- Or create abstraction layer (StorageService interface) for gradual migration

3. **Environment Variables**:

- **All secrets** must move to AWS SSM Parameter Store or Secrets Manager
- Update NestJS ConfigModule to read from SSM (or keep env vars, inject from ECS task definition)

4. **CORS Configuration**:

- Update `allowedOrigins` in `main.ts` to include new AWS domains
- Or make it environment-driven (read from SSM/env)

5. **Database Connection**:

- RDS SSL: Update `rejectUnauthorized` based on RDS certificate
- Connection string format: RDS provides standard PostgreSQL URL

6. **Cron Jobs**:

- Convert `@Cron` decorators to EventBridge rules
- Or keep decorators but ensure only one instance runs (distributed lock)

---

### 12. Concrete Initial Steps (Updated Based on Phase 0)

1. **Create `hof-infra` Terraform repo**:

- Initialize with basic structure
- Set up remote state (S3 backend)

2. **Design Terraform modules** (based on findings):

- `network/` - VPC, subnets, NAT (2 VPCs: staging, prod)
- `ecs-api/` - Backend API service
- `ecs-python/` - Python image processing service (separate service)
- `ecs-jobs/` - Background job workers (EventBridge-triggered)
- `rds/` - PostgreSQL with proper timezone/timeout settings
- `s3-assets/` - File storage buckets (migrate from Firebase)
- `static-site/` - S3 + CloudFront for FE & Admin
- `security/` - IAM roles, SSM parameters, Secrets Manager

3. **Backend Containerization**:

- Create `Dockerfile` (multi-stage, Node 22)
- Test locally with Docker Compose (simulate ECS)

4. **Python Service Containerization**:

- Create `Dockerfile` for Python service
- Or document if Python service repo is separate

5. **GitHub Actions CI/CD**:

- Backend: Build → ECR → ECS deploy
- Python service: Build → ECR → ECS deploy (if separate)
- Frontend: Build → S3 sync → CloudFront invalidation
- Admin: Build → S3 sync → CloudFront invalidation

6. **Environment Variables Migration**:

- Document all env vars (done above)
- Create SSM Parameter Store entries via Terraform
- Update backend to optionally read from SSM (or keep env vars from ECS task def)

7. **Staging Stack Deployment**:

- Deploy full stack to staging
- Test end-to-end flows
- Performance testing

8. **Database Migration Rehearsal**:

- Test DB dump/restore process
- Measure downtime window
- Decide on replication strategy

---