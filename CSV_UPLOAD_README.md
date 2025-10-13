# CSV Upload API Documentation

## Overview
The CSV upload endpoint allows bulk upload of match participant statistics along with automatically creating match participant records.

## Endpoint
```
POST /match-participant-stats/upload-csv/:matchId
```

### Authentication
- Requires JWT token in Authorization header
- Use JwtAuthGuard protection

### Request
- **Content-Type**: `multipart/form-data`
- **File Parameter**: `file` (CSV file)

### CSV Format Requirements

#### Required Columns
- `phoneNumber`: User's phone number (primary identifier)
- `teamName`: Team name (e.g., "Team A", "Red Team")

#### Compact Stats Columns (used for XP)
- `goals`, `assists`
- `totalPasses`, `passingAccuracy` (decimal 0..1)
- `keyPasses`
- `totalShots`, `shotAccuracy` (decimal 0..1)
- `tackles`, `interceptions`
- `saves`

#### Optional Columns
- `Name`, `Date` (for reference only)
- `paidStatsOptIn`, `isMvp`

### Compact CSV Template (Recommended)
Use the compact stats format for all new uploads. Only 10 stat fields are required for performance calculation; other legacy columns are optional.

**Header Structure:**
```csv
Name,Team Name,phoneNumber,Date,goals,assists,totalPasses,passingAccuracy,keyPasses,totalShots,shotAccuracy,tackles,interceptions,saves
```

### Sample Data Rows (Compact)
```csv
A2,teamA,8810663584,"Oct 10, 2025",2,2,64,0.81,7,5,0.29,4,4,2
A3,teamA,7701969691,"Oct 10, 2025",3,0,40,0.62,2,5,0.88,5,3,2
```

### Response Format
```json
{
  "totalRows": 4,
  "successfulRows": 3,
  "failedRows": 1,
  "errors": [
    {
      "row": 4,
      "errors": ["User not found with phoneNumber: 0000000000"],
      "data": { ... }
    }
  ],
  "warnings": [
    {
      "row": 1,
      "message": "Created new match participant for user 123",
      "data": { "userId": 123, "matchId": 4 }
    }
  ]
}
```

## Behavior

### User Resolution
- Users are resolved strictly by `phoneNumber` (mandatory). If not found, the row fails.

### Match Participant Creation
- If a match participant record doesn't exist, it will be created automatically
- If it exists but has a different team name, it will be updated
- Warnings will be generated for these operations

### Stats Creation
- If stats already exist for a player in a match, the row will be skipped with a warning
- Compact stats are stored in existing columns (`goals`→`totalGoal`, `assists`→`totalAssist`, etc.)
- Legacy columns are ignored for XP and can be omitted from uploads
- Database transaction ensures atomicity - if any part fails, the entire row is rolled back
- Unique constraint prevents duplicate stats for the same player in the same match

### Validation
- All numeric fields are validated
- Team name can be any string (e.g., "Team A", "Red Team", "Lions", etc.)
- Boolean fields accept true/false, 1/0, or boolean strings
- Empty strings are converted to null for optional fields
- Empty rows are automatically skipped
- Duplicate entries in the same CSV file are detected and rejected
- Maximum of 2 teams per match is enforced

## Error Handling
- File validation (must be .csv)
- Row-by-row processing with individual error tracking
- Detailed error messages for debugging
- Partial success support (some rows can succeed while others fail)
- Duplicate detection within CSV file
- Empty row filtering

## Usage Example

```bash
curl -X POST \
  http://localhost:3000/match-participant-stats/upload-csv/4 \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -F 'file=@Stats_latest.csv'
```

## Notes
- Use the compact template above for all new uploads
- Large CSV files are processed sequentially to avoid database overload
- Consider breaking very large files (>1000 rows) into smaller chunks
- All operations are logged for debugging purposes
- Database transactions ensure data consistency
- Unique constraints prevent duplicate stats for the same player/match combination
- The `Name` and `Date` fields in the CSV are for reference only and are not stored in the database