# Stats Provider API Integration Specification

## Overview

This document describes the API integration between **Humans of Football (HoF)** backend and the stats provider. This specification is provided to enable a new stats provider to design compatible APIs that maintain the same integration patterns and data structures.

**Purpose**: To ensure seamless transition between stats providers without requiring backend code changes.

---

## Base Configuration

- **Base URL**: Configurable via `STATS_PROVIDER_BASE_URL` environment variable
  - Example: `https://api.example-stats-provider.com`
- **Authentication**: JWT Bearer Token
- **Token Validity**: 30 days (tokens are cached and refreshed automatically)

---

## API Endpoints

### 1. Authentication: Verify Password & Get Token

**Purpose**: Authenticate and obtain a JWT access token for subsequent API calls.

#### Request

- **Method**: `POST`
- **Endpoint**: `/hof/verify`
- **Headers**:
  ```
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "phone": "+919999999999",
    "password": "222222"
  }
  ```
- **Fields**:
  - `phone` (string, required): Registered phone number with country code
  - `password` (string, required): 6-digit password provided by the stats provider

#### Response

- **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Verify successful",
    "accessToken": "eyJhbGciOiJIUzI1NiIsI.eyJ1c2VySWQiOiIxMjM0NTYsImV4cCI6MTcyODA1NjgwMH0.abc123XYZ"
  }
  ```
- **Fields**:
  - `success` (boolean): Indicates request success
  - `message` (string): Response message
  - `accessToken` (string): JWT token for authenticated requests (valid for 30 days)

#### Error Responses

- **400 Bad Request**: Incorrect or expired password
- **401 Unauthorized**: Invalid credentials
- **429 Too Many Requests**: Verification attempts exceeded
- **500 Internal Server Error**: Server-side error

#### Implementation Notes

- Tokens are cached in the database with expiration tracking
- Token is automatically refreshed if expired or invalid
- Token is refreshed before each API call to avoid stale authentication issues

---

### 2. Upload Game: Submit Match for Analysis

**Purpose**: Submit a complete match with all players and metadata for stats analysis.

#### Request

- **Method**: `POST`
- **Endpoint**: `/hof/uploadGame`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {accessToken}
  ```
- **Request Body**:
  ```json
  {
    "teamA": "Barcelona FC",
    "teamB": "Real Madrid",
    "matchDate": "2024-01-15T15:00:00.000Z",
    "matchLink": "https://example.com/match-video.mp4",
    "matchName": "Venue Name : City Name : 15 Jan, 2024 : 03:00 PM",
    "matchFormat": "ELEVEN_VS_ELEVEN",
    "matchDuration": 90,
    "teamAScore": 4,
    "teamBScore": 3,
    "matchMetaDataJson": {
      "formation": {
        "id": "6",
        "name": "6",
        "total_players": 11
      }
    },
    "players": {
      "teamA": [
        {
          "name": "Lionel Messi",
          "hofPlayerId": "123",
          "jerseyNumber": "10",
          "playerVideo": "https://example.com/messi-360.mp4",
          "playerImages": ["https://example.com/messi-thumb.jpg"],
          "goal": 2,
          "ownGoal": 1
        },
        {
          "name": "Sergio Busquets",
          "hofPlayerId": "124",
          "jerseyNumber": "11",
          "playerVideo": "",
          "goal": 0,
          "ownGoal": 1
        }
      ],
      "teamB": [
        {
          "name": "Karim Benzema",
          "hofPlayerId": "125",
          "jerseyNumber": "9",
          "playerVideo": "https://example.com/benzema-360.mp4",
          "goal": 1,
          "ownGoal": 2
        }
      ]
    }
  }
  ```

#### Request Fields

**Match-Level Fields**:
- `teamA` (string, required): Team A name/jersey color
- `teamB` (string, required): Team B name/jersey color
- `matchDate` (string, required): ISO 8601 date string (e.g., `2024-01-15T15:00:00.000Z`)
- `matchLink` (string, required): URL to the match video
- `matchName` (string, optional): Custom match name (format: `"Venue Name : City Name : Date : Time"`)
- `matchFormat` (enum, optional): One of:
  - `THREE_VS_THREE`
  - `FIVE_VS_FIVE`
  - `SEVEN_VS_SEVEN`
  - `NINE_VS_NINE`
  - `ELEVEN_VS_ELEVEN`
- `matchDuration` (number, optional): Match duration in minutes
- `teamAScore` (number, optional): Team A final score
- `teamBScore` (number, optional): Team B final score
- `matchMetaDataJson` (object, optional): Additional match metadata (formation, positions, etc.)

**Player Fields** (per player in `teamA` or `teamB` arrays):
- `name` (string, required): Player's full name
- `hofPlayerId` (string, required): Unique internal player ID (numeric string, e.g., `"123"`)
- `jerseyNumber` (string, optional): Player's jersey number
- `playerVideo` (string, optional): URL to player's 360-degree video (empty string `""` if not available)
- `playerImages` (array of strings, optional): Array of player image URLs
- `goal` (number, optional): Goals scored by this player
- `ownGoal` (number, optional): Own goals scored by this player

#### Response

- **Success Response (201)**:
  ```json
  {
    "success": true,
    "message": "Match uploaded successfully",
    "matchId": "255a3673-dc5d-451f-a5c1-dbc4b020464f"
  }
  ```
- **Fields**:
  - `success` (boolean): Indicates request success
  - `message` (string): Response message
  - `matchId` (string, UUID): Unique identifier for the submitted match (used for subsequent polling)

#### Error Responses

- **400 Bad Request**: Invalid or incomplete data
- **401 Unauthorized**: Missing or invalid JWT token
- **500 Internal Server Error**: Server-side error

#### Implementation Notes

- The `matchId` returned is stored in our database as `matchStatsId` and used for polling stats
- After successful submission, we set:
  - `statsStatus: 'PENDING'`
  - `statsNextPollAt: now + 1 hour` (first poll scheduled 1 hour later)
  - `statsPollAttempts: 0`
- We normalize `playerVideo` to empty string `""` if not provided (never `null` or `undefined`)

---

### 3. Get Player Statistics: Poll Match Stats

**Purpose**: Retrieve player statistics for a submitted match. This endpoint is polled periodically until stats are ready.

#### Request

- **Method**: `POST`
- **Endpoint**: `/hof/getStats`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {accessToken}
  ```
- **Request Body**:
  ```json
  {
    "matchId": "255a3673-dc5d-451f-a5c1-dbc4b020464f"
  }
  ```
- **Fields**:
  - `matchId` (string, UUID, required): The match ID returned from `/hof/uploadGame`

#### Response

The response structure varies based on the analysis status:

##### Status: `"analyzing"` (Match Still Being Processed)

```json
{
  "status": "analyzing",
  "matchNotes": "The match is currently being analyzed"
}
```

**Our Behavior**: 
- We schedule the next poll in 1 hour
- Update `statsStatus: 'PROCESSING'`
- Increment `statsPollAttempts`

##### Status: `"cancelled"` (Match Analysis Failed)

```json
{
  "status": "cancelled",
  "matchNotes": "This was not a football match footage"
}
```

**Our Behavior**:
- Update `statsStatus: 'ERROR'`
- Stop polling

##### Status: `"success"` (Stats Ready)

```json
{
  "status": "success",
  "matchNotes": "Match analysis completed successfully",
  "matchHighlights": "https://example.com/match-highlights.mp4",
  "playerStats": {
    "255a3673-dc5d-451f-a5c1-dbc4b020464f": {
      "playerInfo": {
        "name": "Luka Modric",
        "jerseyNumber": "10",
        "team": "B",
        "hofPlayerId": "Hof-125",
        "playerVideo": "https://example.com/player-360-video.mp4",
        "thumbnail": [
          "https://example.com/player-thumbnail.png"
        ]
      },
      "highlightURL": [
        {
          "youtubeVideoUrl": "https://www.youtube.com/watch?v=L3OmFBQhGjU",
          "youtubeUploadStatus": "COMPLETED",
          "name": "top_moments_1"
        },
        {
          "youtubeVideoUrl": "https://www.youtube.com/watch?v=ABC123",
          "youtubeUploadStatus": "COMPLETED",
          "name": "top_moments_2"
        }
      ],
      "stats": {
        "goal": {
          "totalCount": 2,
          "type": "raw",
          "description": "Successful attempt that results in a goal",
          "isPercentageStat": false,
          "minutes": [16, 68]
        },
        "assists": {
          "totalCount": 1,
          "type": "raw",
          "isPercentageStat": false
        },
        "passes_total": {
          "totalCount": 45,
          "type": "raw",
          "isPercentageStat": false
        },
        "passing_accuracy_overall": {
          "totalCount": 0.85,
          "type": "derived",
          "isPercentageStat": true
        },
        "key_passes": {
          "totalCount": 3,
          "type": "raw",
          "isPercentageStat": false
        },
        "shots_total": {
          "totalCount": 5,
          "type": "raw",
          "isPercentageStat": false
        },
        "shot_accuracy": {
          "totalCount": 0.60,
          "type": "derived",
          "isPercentageStat": true
        },
        "tackles_total": {
          "totalCount": 8,
          "type": "raw",
          "isPercentageStat": false
        },
        "interceptions_total": {
          "totalCount": 4,
          "type": "raw",
          "isPercentageStat": false
        },
        "saves": {
          "totalCount": 0,
          "type": "raw",
          "isPercentageStat": false
        }
      }
    }
  }
}
```

#### Response Fields

**Top-Level Fields**:
- `status` (string, required): One of `"success"`, `"analyzing"`, or `"cancelled"`
- `matchNotes` (string, optional): Human-readable status message
- `matchHighlights` (string, optional): URL to match highlights video (can be `"null"` string or empty)
- `playerStats` (object, optional): Object keyed by external player ID (UUID string)

**Player Stats Object** (`playerStats[externalPlayerId]`):
- `playerInfo` (object):
  - `name` (string): Player name
  - `jerseyNumber` (string): Jersey number
  - `team` (string): Team identifier ("A" or "B")
  - `hofPlayerId` (string, optional): May include "Hof-" prefix (e.g., `"Hof-125"`). We strip this prefix to get the numeric ID.
  - `playerVideo` (string, optional): URL to 360-degree player video (can be empty string or `"null"`)
  - `thumbnail` (array of strings): Array of thumbnail image URLs
- `highlightURL` (array, optional): Array of highlight video objects:
  - `youtubeVideoUrl` (string): YouTube video URL
  - `youtubeUploadStatus` (string): Status like `"COMPLETED"`, `"PROCESSING"`, `"FAILED"`
  - `name` (string): Highlight name/identifier
- `stats` (object): Statistics object where keys are stat names and values are stat objects

**Stat Object Structure**:
- `totalCount` (number | string): The stat value (can be numeric or string like `"NA"`)
- `type` (string): Either `"raw"` or `"derived"`
- `isPercentageStat` (boolean): Whether this is a percentage stat (0-1 range or 0-100)
- `description` (string, optional): Human-readable description
- `minutes` (array of numbers, optional): Match minutes when this event occurred (only for time-based events like goals)

#### Expected Stat Names

We expect the following stat names in the `stats` object:
- `goal` / `goals`
- `assists`
- `passes_total`
- `passing_accuracy_overall` (percentage)
- `key_passes`
- `shots_total`
- `shot_accuracy` (percentage)
- `tackles_total`
- `interceptions_total`
- `saves`

#### Error Responses

- **200 Success**: Even when status is `"analyzing"` or `"cancelled"` (these are not errors)
- **400 Bad Request**: Invalid or missing `matchId`
- **401 Unauthorized**: Missing or invalid JWT token
- **404 Not Found**: Match not found
- **500 Internal Server Error**: Server-side error

#### Implementation Notes

**Polling Behavior**:
- We poll this endpoint every 1 hour when status is `"analyzing"`
- We stop polling when status is `"success"` or `"cancelled"`
- We store the entire response in `statsLastResponse` for later processing

**Player Matching**:
- We use `hofPlayerId` from `playerInfo` to match players (stripping "Hof-" prefix if present)
- If `playerVideo` is provided, we trust the `hofPlayerId` mapping
- If `playerVideo` is empty, we perform name + team matching as fallback
- We create mapping entries for all players (matched or unmatched)

**Stats Processing**:
- We only process stats for players that are matched to internal users
- Stats are stored in our `match_participant_stats` table
- We handle percentage stats by checking `isPercentageStat` flag
- We combine stats if a player has multiple external IDs (e.g., changed teams)

**Video URLs**:
- `playerInfo.playerVideo`: 360-degree video (stored in `statsVideoUrl`, not displayed to users)
- `highlightURL[0].youtubeVideoUrl`: YouTube highlight video (stored in `playerHighlights`, displayed to users)
- `matchHighlights`: Match-level highlights (stored in `match.matchHighlights`)

---

## Data Flow

### 1. Match Submission Flow

```
1. Admin submits match via our admin panel
   ↓
2. Backend calls /hof/verify to get/refresh token
   ↓
3. Backend calls /hof/uploadGame with match data
   ↓
4. Store returned matchId as matchStatsId
   ↓
5. Set status to PENDING, schedule first poll in 1 hour
```

### 2. Stats Polling Flow

```
1. Scheduled job polls /hof/getStats every hour
   ↓
2. If status = "analyzing":
   - Store response
   - Schedule next poll in 1 hour
   - Update status to PROCESSING
   ↓
3. If status = "success":
   - Store full response
   - Create player mappings (matched/unmatched)
   - If all players matched: auto-ingest stats
   - If unmapped players exist: wait for manual mapping
   ↓
4. If status = "cancelled":
   - Update status to ERROR
   - Stop polling
```

### 3. Stats Processing Flow

```
1. For each player in playerStats:
   - Extract hofPlayerId (strip "Hof-" prefix)
   - Match to internal user by ID or name+team
   - Create mapping entry (MATCHED or UNMATCHED)
   ↓
2. If all players matched:
   - Process stats for all players
   - Update match status to STATS_UPDATED
   ↓
3. If unmapped players exist:
   - Wait for admin to manually map players
   - After mapping, process stats for matched players
```

---

## Important Implementation Details

### 1. Player ID Format

- **We Send**: Numeric string (e.g., `"123"`)
- **We Receive**: May include "Hof-" prefix (e.g., `"Hof-123"`)
- **We Process**: Strip "Hof-" prefix (case-insensitive) to get numeric ID

### 2. Player Video Handling

- **If `playerVideo` is provided**: We trust the `hofPlayerId` mapping
- **If `playerVideo` is empty**: We perform fallback name + team matching
- **Empty string vs null**: We normalize empty values to `""` (empty string)

### 3. Stats Value Parsing

- **Numeric values**: Can be number or string (e.g., `"45"` or `45`)
- **String values**: `"NA"` or empty string `""` are treated as `0`
- **Percentage stats**: 
  - Check `isPercentageStat` flag
  - If `true` and value > 1: divide by 100 (assume 0-100 range)
  - If `true` and value ≤ 1: use as-is (assume 0-1 range)

### 4. Highlight URL Field Name

- **Field name variation**: Response may use `highlightURL` or `hightlightURL` (typo)
- **We handle both**: Check for both field names
- **We use**: First element's `youtubeVideoUrl` if array is non-empty

### 5. Match Highlights

- **Field**: `matchHighlights` in response
- **Can be**: URL string, empty string, or `"null"` string
- **We store**: Only if non-empty and not `"null"`

### 6. Token Management

- **Caching**: Tokens cached in database with expiration
- **Refresh**: Token refreshed before each API call if expired
- **Validity**: 30 days (we check with 1-hour buffer)
- **Force refresh**: We force refresh on submit and poll operations

### 7. Error Handling

- **Network errors**: Retry with exponential backoff
- **401 errors**: Refresh token and retry
- **400/404 errors**: Log and return error to user
- **500 errors**: Log and schedule retry

---

## Database Schema (Reference)

### Match Table Fields (Relevant to Integration)

- `matchStatsId` (string): The `matchId` returned from `/hof/uploadGame`
- `statsStatus` (enum): `PENDING`, `PROCESSING`, `SUCCESS_WITH_UNMATCHED`, `IMPORTED`, `ERROR`, `POLL_SUCCESS_MAPPING_FAILED`
- `statsPayload` (jsonb): Full payload sent to `/hof/uploadGame`
- `statsLastResponse` (jsonb): Full response from `/hof/getStats`
- `statsNextPollAt` (timestamp): Next scheduled poll time
- `statsPollAttempts` (number): Number of poll attempts
- `matchHighlights` (string): Match highlights URL

### Player Mapping Table

- `matchId` (number): Internal match ID
- `externalPlayerId` (string): Player ID from stats provider response (UUID)
- `internalPlayerId` (number): Our internal user ID (nullable)
- `externalName` (string): Player name from stats provider
- `externalTeam` (string): Team identifier
- `thumbnailUrls` (array): Thumbnail URLs
- `status` (enum): `MATCHED` or `UNMATCHED`

### Match Participant Stats Table

- Stores processed stats for each player:
  - `totalGoal`, `totalAssist`, `totalPass`, `totalPassingAccuracy`, etc.

---

## Testing Requirements

To ensure compatibility, the new provider should:

1. **Authentication**:
   - Return JWT token with 30-day validity
   - Handle phone + password authentication

2. **Upload Game**:
   - Accept all required fields
   - Return unique `matchId` (UUID format)
   - Handle empty `playerVideo` strings

3. **Get Stats**:
   - Return `"analyzing"` status while processing
   - Return `"success"` with full stats when ready
   - Return `"cancelled"` if analysis fails
   - Include `hofPlayerId` in `playerInfo` (with or without "Hof-" prefix)
   - Provide all expected stat names
   - Mark percentage stats with `isPercentageStat: true`
   - Include `highlightURL` array with YouTube URLs
   - Provide `matchHighlights` URL when available

4. **Data Formats**:
   - ISO 8601 dates for `matchDate`
   - UUID format for `matchId`
   - Support both numeric and string stat values
   - Handle `"NA"` and empty string values

---

## Migration Checklist

When switching to a new provider, ensure:

- [ ] Base URL is configurable via environment variable
- [ ] Authentication endpoint matches `/hof/verify` format
- [ ] Upload endpoint matches `/hof/uploadGame` format
- [ ] Stats endpoint matches `/hof/getStats` format
- [ ] Response structures match exactly (field names, types, nested objects)
- [ ] Status values are `"success"`, `"analyzing"`, or `"cancelled"`
- [ ] `hofPlayerId` is returned in `playerInfo` (with or without prefix)
- [ ] All expected stat names are provided
- [ ] Percentage stats are marked with `isPercentageStat: true`
- [ ] `highlightURL` array structure matches
- [ ] `matchHighlights` field is provided
- [ ] Token validity is 30 days
- [ ] Error responses match expected HTTP status codes

---

## Contact & Support

For questions about this integration:
- Review the implementation in: `src/modules/admin/services/stats-provider.service.ts`
- Check DTOs in: `src/modules/admin/dto/stats-submit.dto.ts`
- Review existing API documentation in the codebase

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Maintained By**: Humans of Football Backend Team

