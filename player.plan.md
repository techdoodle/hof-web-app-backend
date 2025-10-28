# PlayerNation Integration Plan

## Overview

Add admin workflow to submit match + per-player 360 videos to PlayerNation, persist external matchId, and poll for stats to ingest into our compact stats system.

## Existing Infrastructure (Leveraged)

✅ **Matches entity**: `matchStatsId` already nullable, `matchType` enum (RECORDED/NON_RECORDED) exists  
✅ **Admin module**: Existing with DTO structure, controllers, and services  
✅ **Guards**: `RolesGuard` and `JwtAuthGuard` for RBAC  
✅ **Notifications**: `NotificationService` and `EmailService` for alerts  
✅ **GCS**: Firebase Storage integration via `FirebaseStorageService`  
✅ **Config pattern**: `registerAs` pattern established  

## Scope

- Admin UI to submit a match to PlayerNation with per-player 360 URLs and full match video URL.
- Backend endpoint to validate, call PlayerNation, store `externalMatchId` against our match.
- Background job to poll `/hof/getStats` by `externalMatchId`, map to compact stats (10), upsert into `match_participant_stats`.
- JWT-based auth, retries, and admin access control.

## Backend

### API Reference

Follow the official PlayerNation HOF docs: [PlayerNation HOF API](https://www.theplayernation.com/apidocs/hof)

- **Base URL**: `https://api.theplayernation.com`
- **Endpoints**:
  - POST `/hof/verify` → `{ phone, password }` → returns `{ success, message, accessToken }` (valid 30 days)
  - POST `/hof/uploadGame` (not uploadMatch) → returns `{ success, message, matchId }`
  - POST `/hof/getStats` → `{ matchId }` → returns `{ status, matchNotes, playerStats }`

### Authentication (JWT-based)

- One-time: obtain password from PlayerNation team.
- Verify: POST `/hof/verify` with `{ phone, password }` → store `accessToken`.
- Use: `Authorization: Bearer <accessToken>` header on all requests.
- Token valid 30 days; refresh on 401.

### Error Handling

- 201 (uploadGame success), 200 (getStats success/analyzing/cancelled), 400 (validation), 401 (auth), 404 (not found), 429 (rate limit), 5xx (server).
- Retry 5xx with exponential backoff; never retry 4xx.
- getStats status: "success", "analyzing", "cancelled"; matchNotes provides context.

### Payload (uploadGame)

**Required**: `teamA`, `teamB`, `matchDate` (ISO), `matchLink` (URL), `players.teamA[]`, `players.teamB[]`.

**Optional per player**: `name`, `hofPlayerId`, `jerseyNumber`, `playerVideo`, `playerImages[]`, `goal`, `ownGoal`.

**Optional match**: `matchFormat` (enum), `matchDuration` (number), `matchName`, `teamAScore`, `teamBScore`, `matchMetaDataJson` (JSON).

### Configuration

- Create separate `src/config/playernation.config.ts` using `registerAs` pattern (matching existing config structure):
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('playernation', () => ({
  baseUrl: process.env.PLAYERNATION_BASE_URL || 'https://api.theplayernation.com',
  phone: process.env.PLAYERNATION_PHONE,
  password: process.env.PLAYERNATION_PASSWORD,
}));
```
- Import in `app.module.ts` ConfigModule imports array
- Store JWT token in DB table `playernation_tokens` (30-day TTL); refresh logic in service.

### DTOs

- `src/modules/admin/dto/playernation-submit.dto.ts`: mirrors uploadGame payload.
- `src/modules/admin/dto/playernation-auth.dto.ts`: `{ phone, password }`.
- **Note**: Admin module already exists with DTO structure - extend the existing `admin/dto/` directory.

### Controller/Service

**POST /admin/playernation/submit/:matchId**:
- Validate admin role; load `Match`.
- Ensure JWT token is valid (call verify if expired/missing).
- Build payload per docs; call `POST https://api.theplayernation.com/hof/uploadGame` with `Authorization: Bearer <token>`.
- On 201: persist `matchStatsId` (PlayerNation's returned matchId); store payload; audit log.

**GET /admin/playernation/status/:matchId**:
- Return `matchStatsId`, status, last poll time, mapping completeness.

**POST /admin/playernation/poll-now/:matchId**:
- Enqueue immediate poll job.

### Database Changes (Migration)

**`matches` table** (extends existing entity):
- ✅ `matchStatsId` is **already NULLABLE** (varchar(255), unique, nullable: true) - no migration needed for this!
- Use existing `matchStatsId` to store PlayerNation's returned `matchId`; only populate for recorded matches.
- ✅ `matchType` enum already exists (RECORDED/NON_RECORDED) - use this to identify recorded matches.
- Add new columns:
  - `playernation_status` VARCHAR (PENDING/PROCESSING/PARTIAL/IMPORTED/TIMEOUT/ERROR)
  - `playernation_next_poll_at` TIMESTAMPTZ
  - `playernation_poll_attempts` INT
  - `playernation_payload` JSONB
  - `playernation_last_response` JSONB

**New table `playernation_player_mappings`**:
- `id` (PK)
- `match_id` (FK to matches)
- `external_player_id` VARCHAR
- `external_name` TEXT
- `external_team` CHAR
- `thumbnail_urls` TEXT[]
- `internal_player_id` (FK to users, nullable)
- `internal_phone` TEXT
- `status` ENUM (UNMATCHED/MATCHED/IGNORED)
- `created_by` (FK to users)
- `updated_at` TIMESTAMPTZ

**New table `playernation_tokens`**:
- `id` (PK)
- `access_token` TEXT
- `expires_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ

### Polling Job

- Queue/cron: poll every 60 minutes for up to 24 hours (12 attempts max) per match with `matchStatsId` and status != IMPORTED.
- Call `POST https://api.theplayernation.com/hof/getStats` with `{ matchId }` and `Authorization: Bearer <token>`.

**Response handling**:
- `status: "analyzing"` → set `playernation_status = PROCESSING`; schedule next poll at +60m.
- `status: "cancelled"` → set `playernation_status = ERROR`; stop polling; alert admins.
- `status: "success"` → proceed to mapping/ingestion.

**Player mapping**:
- If `playerVideo` was NOT provided in uploadGame, PlayerNation returns `thumbnail[]` in `playerInfo`.
- Upsert into `playernation_player_mappings` with status UNMATCHED; block ingestion until admin maps.
- If `hofPlayerId` present or mapping is MATCHED, join to internal user (by phoneNumber).

**Stats ingestion (once MATCHED)**:

Map PlayerNation stats to compact (10):
- `goal.totalCount` → goals
- `assist.totalCount` → assists
- `pass.totalCount` → totalPasses
- `passAccuracy.totalCount` (as decimal) → passingAccuracy
- `keyPass.totalCount` → keyPasses
- `shot.totalCount` → totalShots
- `shotAccuracy.totalCount` (as decimal) → shotAccuracy
- `tackle.totalCount` → tackles
- `interception.totalCount` → interceptions
- `save.totalCount` → saves

- Upsert into `match_participant_stats` (phoneNumber join); set `isMvp` from `isMOTM`.
- Store `hightlightURL` and `thumbnail[]` in match/player media.

**Stop conditions**:
- All players ingested → `playernation_status = IMPORTED`; stop polling; trigger GCS cleanup.
- 24h elapsed or 12 attempts with status != success → `playernation_status = TIMEOUT`; alert admins.

### Error Handling

- JWT refresh on 401; retry 5xx with exponential backoff; respect 429 `Retry-After`.
- Validate URLs (https), ISO dates, enums; rate-limit outbound calls; circuit breaker.

## Frontend (Admin Panel)

### Match Creation Integration

- Use existing `matchType` enum (RECORDED/NON_RECORDED) to identify recorded matches.
- In match create/edit form, when `matchType === 'RECORDED'` is selected, show "Prepare PlayerNation Upload" CTA on match detail admin page post-creation.
- Hide PlayerNation section for `matchType === 'NON_RECORDED'` matches.

### Upload Form Route

**Route**: `/admin/playernation/upload?matchId=...`

**Help text & tooltips throughout**:
- Page header: "Upload match data to PlayerNation for AI-powered stats generation. This process takes up to 24 hours."
- Match link field: "Provide Google Drive link or full match video URL. Must be accessible."
- Player video: "⚠️ Click 'Save Video' for each player to avoid loss if page refreshes. Videos are auto-deleted after 48h."
- hofPlayerId: "Link to registered user for automatic stats mapping. Leave empty if player not in system."
- Submit button: "Submit to PlayerNation. You can check processing status on this page."

**Form Sections**:
- Match info: teamA, teamB, matchDate (ISO picker), matchFormat (enum dropdown), matchDuration, matchName, matchLink (full match URL or Google Drive), teamAScore, teamBScore, matchMetaDataJson (JSON editor).
- Players per team: dynamic list with fields (name, hofPlayerId [search/select], jerseyNumber, playerVideo URL or upload, playerImages[] URLs/upload, goal, ownGoal).
- 360 capture (optional):
  - Camera widget per player to record short clips.
  - Each player row has individual "Save Video" button (not global submit).
  - On click: immediately upload to GCS via signed URL; store returned URL; show success indicator.
  - Persist uploaded URLs to draft/session (backend or localStorage) to survive page refresh.
  - Visual state: show thumbnail/preview + "✓ Saved" once uploaded; "Upload" if pending.

**Actions**:
- Submit: calls `POST /admin/playernation/submit/:matchId`.
- Status panel: shows `matchStatsId`, last poll time, status badge, "Poll Now" button.

**Validation**:
- Required: teamA, teamB, matchDate (ISO), matchLink (URL), players arrays non-empty.

### Thumbnail-based Player Matching (Fallback)

**Route**: `/admin/playernation/match?matchId=...`

**UI**: Two-column layout
- Left: PlayerNation detected players (thumbnail[], name, team, jerseyNumber).
- Right: Internal match participants with visible data: name, **phoneNumber** (prominently displayed), jerseyNumber; searchable/filterable by name or phone; phoneNumber is authoritative identifier.

**Features**:
- Drag-and-drop or select-to-map.
- Auto-suggest by name similarity; highlight conflicts.
- One-to-one validation; block finalization if unresolved.
- Actions: Save Draft, Finalize Mapping.
- Post-finalize: all future polls auto-apply mapping; stats write via phoneNumber.
- Audit: who mapped, when, before/after snapshot.

## Security & Access

- Restrict to roles `ADMIN`, `FOOTBALL_CHIEF` using **existing `RolesGuard`** (`src/common/guards/roles.guard.ts`).
- Use existing `JwtAuthGuard` for authentication.
- PlayerNation JWT token stored server-side in DB; never exposed to FE.

## Temporary Media Storage (GCS)

- Bucket: Reuse existing Firebase Storage bucket (configured via `FIREBASE_STORAGE_BUCKET` env var).
- Use prefix `playernation_temp/` for PlayerNation media (separate from existing `profile_pictures/` prefix).

**Upload flow**:
- FE requests signed URL (PUT) per asset (player 360, images, match video if in-app).
- BE endpoint: `POST /admin/playernation/signed-url` → returns `{ uploadUrl, filePath }` (15m TTL).
- Leverage existing `FirebaseStorageService` or extend with `getSignedUploadUrl()` method.
- FE uploads directly to GCS; BE stores returned `filePath` in form state.

**Retention**:
- Lifecycle rule: delete objects with prefix `playernation_temp/` after 48h.
- On successful ingestion: enqueue immediate deletion of match-specific files (don't wait 48h).

**Security**:
- Private objects; signed URLs only; MIME/size validation (enforce video/image types, max 200MB per file); optional virus scan.

## Observability

- Audit: submit, poll, mapping actions.
- Metrics: submit success rate, poll success rate, mapping coverage (%), ingestion latency, token refresh rate.
- Alerts: stuck states, 401 (token issues), timeout, cancelled matches.
- **Leverage existing `NotificationService` and `EmailService`** for admin alerts on errors/timeouts.

## Deliverables

- BE: endpoints, migrations, polling worker, JWT refresh logic.
- FE: admin upload page, player mapping UI, status dashboard.
- Docs: README section for PlayerNation integration, stat mapping table, troubleshooting.

## Implementation Todos

- [ ] Add PlayerNation config (base URL, phone, password, token storage)
- [ ] Create migrations for matches columns, playernation_player_mappings, playernation_tokens
- [ ] JWT verify service with token refresh logic
- [ ] Create DTOs for uploadGame payload and verify
- [ ] Implement POST submit, GET status, POST poll-now with RBAC
- [ ] HTTP client for PlayerNation with JWT and retries
- [ ] Polling job (60m cadence, 24h window) with status handling
- [ ] Map PlayerNation stats to compact stats; upsert to DB
- [ ] Player matching service for thumbnail-based flow
- [ ] Admin UI to submit match and per-player 360 URLs
- [ ] 360 capture widget with GCS upload
- [ ] Player matching UI for thumbnail fallback
- [ ] GCS bucket lifecycle and signed URL generation
- [ ] README docs, stat mapping table, admin guide