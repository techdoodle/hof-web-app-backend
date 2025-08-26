# CSV Upload API Documentation

## Overview
The CSV upload endpoint allows bulk upload of match participant statistics along with automatically creating match participant records.

## Endpoint
```
POST /match-participant-stats/upload-csv
```

### Authentication
- Requires JWT token in Authorization header
- Use JwtAuthGuard protection

### Request
- **Content-Type**: `multipart/form-data`
- **File Parameter**: `file` (CSV file)

### CSV Format Requirements

#### Required Fields
- **User Identification** :
  - `phoneNumber`: User's phone number
- **Match Participant Data**:
  - `matchId`: ID of the match (number)
  - `teamName`: Team name assignment (any string, e.g., "Team A", "Red Team", "Lions")

#### Optional Fields
- **Match Participant**:
  - `paidStatsOptIn`: Boolean (default: false)

- **Match Participant Stats** (all optional):
  - `isMvp`: Boolean (default: false)
  
  **Passing Stats (2 fields)**:
  - `totalPassingActions`: Total number of passing actions
  - `totalPassingAccuracy`: Passing accuracy (decimal, e.g., 0.72 = 72%)

  **Shooting Stats (2 fields)**:
  - `totalShot`: Total number of shots attempted
  - `shotAccuracy`: Shot accuracy (decimal, e.g., 0.2 = 20%)

  **Attack Stats (4 fields)**:
  - `totalGoal`: Total goals scored
  - `totalAssist`: Total assists provided
  - `totalKeyPass`: Total key passes made
  - `totalDribbleAttempt`: Total dribbling attempts
  - `totalSuccessfulDribble`: Successful dribbles
  - `totalUnsuccessfulDribble`: Unsuccessful dribbles
  - `dribbleSuccessPercent`: Dribbling success rate (decimal)

  **Defense Stats (6 fields)**:
  - `totalDefensiveActions`: Total defensive actions performed
  - `totalTackles`: Total tackles attempted
  - `totalInterceptions`: Total interceptions made
  - `blockedShotDefensive`: Shots blocked defensively
  - `steal`: Number of steals
  - `totalClearance`: Total clearances made

  **Goalkeeper Stats (3 fields)**:
  - `totalSave`: Total saves made
  - `totalCatch`: Total catches made
  - `totalPunch`: Total punches made

  **Miscellaneous (4 fields)**:
  - `totalMiscontrol`: Total miscontrols
  - `totalOwnGoals`: Total own goals
  - `teamAGoals`: Goals scored by Team A in the match
  - `teamBGoals`: Goals scored by Team B in the match

### Complete CSV Template
Use the file `sample_match_stats.csv` as a reference. It includes all the essential stat fields:

**Header Structure:**
```csv
id,name,teamName,phoneNumber,date,totalPassingActions,totalPassingAccuracy,totalShot,shotAccuracy,totalGoal,totalAssist,totalKeyPass,totalDribbleAttempt,totalSuccessfulDribble,totalUnsuccessfulDribble,dribbleSuccessPercent,totalDefensiveActions,totalTackles,totalInterceptions,blockedShotDefensive,steal,totalClearance,totalSave,totalCatch,totalPunch,totalMiscontrol,totalOwnGoals,teamAGoals,teamBGoals,matchId
```

### Sample Data Rows
```csv
A711,Dhruv,Team White,8810663584,"Aug 24, 2025",53,0.72,10,0.2,0,3,5,5,1,4,0.2,12,4,2,0,1,0,0,0,0,1,0,11,23,4
B407,Maulik,Team Black,7204888969,"Aug 24, 2025",24,0.75,1,1,1,1,2,0,0,0,,10,1,3,0,3,0,3,0,0,1,0,11,23,4
A861,Manav,Team White,7701969691,"Aug 24, 2025",63,0.86,14,0.79,6,4,8,6,2,4,0.33,31,6,7,4,7,0,0,0,0,1,0,11,23,4
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
      "errors": ["User not found with email: unknown@example.com"],
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
- The system will try to find users by `phoneNumber` first, then by `email`
- At least one identification method must be provided
- If user is not found, the row will fail with an error

### Match Participant Creation
- If a match participant record doesn't exist, it will be created automatically
- If it exists but has a different team name, it will be updated
- Warnings will be generated for these operations

### Stats Creation
- If stats already exist for a player in a match, the row will be skipped with a warning
- All stat fields are optional and will be set to null if not provided
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
  http://localhost:3000/match-participant-stats/upload-csv \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -F 'file=@sample_match_stats.csv'
```

## Notes
- **Complete Template**: Use `sample_match_stats.csv` for the essential stat fields template
- **Minimal Template**: You can also use a subset of fields - only include columns you need
- Large CSV files are processed sequentially to avoid database overload
- Consider breaking very large files (>1000 rows) into smaller chunks
- All operations are logged for debugging purposes
- Database transactions ensure data consistency
- Unique constraints prevent duplicate stats for the same player/match combination
- The `id` and `name` fields in the CSV are for reference only and are not stored in the database
- The `date` field is for reference only and is not stored in the database 