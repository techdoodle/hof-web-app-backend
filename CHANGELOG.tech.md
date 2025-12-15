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


