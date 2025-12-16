## v1.1.0 (2025-01-20)

### Added
- Match ticketing system for admin users to report and track issues:
  - New `tickets` table with fields: `id`, `match_id`, `created_by_admin_id`, `assigned_to_admin_id`, `title`, `description`, `resolution_notes`, `status`, `priority`, `created_at`, `updated_at`.
  - `Ticket` entity (`src/modules/admin/entities/ticket.entity.ts`) with TypeORM mappings and relations to `Match` and `User`.
  - Database migration `1764311000000-CreateTicketsTable.ts` creates the `tickets` table with foreign keys and indexes.
  - `TicketsService` (`src/modules/admin/services/tickets.service.ts`) handles ticket creation, listing with filters/pagination, retrieval, and updates.
  - `CreateTicketDto` and `UpdateTicketDto` (`src/modules/admin/dto/ticket.dto.ts`) with class-validator decorators.
  - REST endpoints in `AdminController`:
    - `POST /admin/matches/:matchId/tickets` – create ticket for a match
    - `GET /admin/tickets` – list tickets with filters (status, priority, matchId, createdBy) and pagination
    - `GET /admin/tickets/:id` – get ticket by ID
    - `PATCH /admin/tickets/:id` – update ticket (status, priority, resolutionNotes, assignedToAdminId)
  - All ticket endpoints require `ADMIN` or `SUPER_ADMIN` role.

## v1.0.0 (2025-12-15)

### Added
- Introduced dual changelog convention for backend, frontend, and admin repos (technical + admin-facing files).

### Changed
- Adjusted recorded match stats status transitions so that partial stats ingestion for mapped players does **not** move the match beyond `SS_MAPPING_PENDING` unless all detected players are mapped and ingested.
  - `src/modules/admin/services/playernation.service.ts` – updated `processMatchedPlayerStats` to:
    - Allow partial ingestion for matched players.
    - Keep `playernationStatus` as `SUCCESS_WITH_UNMATCHED` (and match status as `SS_MAPPING_PENDING`) when any players remain unmapped.
    - Set `playernationStatus` to `IMPORTED` only when all players are mapped, which lets `calculateMatchStatus` move the match to `STATS_UPDATED`.
  - `src/modules/matches/matches.service.ts` – `calculateMatchStatus` continues to interpret `SUCCESS_WITH_UNMATCHED` as `SS_MAPPING_PENDING` and `IMPORTED` as `STATS_UPDATED`.


