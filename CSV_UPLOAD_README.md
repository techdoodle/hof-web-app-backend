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
- **User Identification** (at least one):
  - `phoneNumber`: User's phone number
  - `email`: User's email address
- **Match Participant Data**:
  - `matchId`: ID of the match (number)
  - `teamName`: Team name assignment (any string, e.g., "Team A", "Red Team", "Lions")

#### Optional Fields
- **Match Participant**:
  - `paidStatsOptIn`: Boolean (default: false)

- **Match Participant Stats** (all optional):
  - `isMvp`: Boolean (default: false)
  
  **Passing Stats (16 fields)**:
  - `totalPassingActions`, `totalCompletePassingActions`, `totalIncompletePassingActions`, `totalPassingAccuracy`
  - `totalOpenPlayPassingActions`, `totalOpenPlayCompletePassingActions`, `totalOpenPlayIncompletePassingActions`, `openPlayPassingAccuracy`
  - `totalPass`, `totalCompletePass`, `totalIncompletePass`
  - `totalThroughBall`, `totalCompleteThroughBall`, `totalIncompleteThroughBall`
  - `totalLongPass`, `totalCompleteLongPass`, `totalIncompleteLongPass`
  - `totalCross`, `totalCompleteCross`, `totalIncompleteCross`
  - `openPlayCompletePass`, `openPlayIncompletePass`
  - `openPlayCompleteThroughBall`, `openPlayIncompleteThroughBall`
  - `openPlayCompleteLongPass`, `openPlayIncompleteLongPass`
  - `openPlayCompleteCross`, `openPlayIncompleteCross`

  **Shooting Stats (6 fields)**:
  - `totalShot`, `totalOnTargetShot`, `totalOffTargetShot`
  - `totalBlockedShotTaken`, `totalOtherShot`, `shotAccuracy`

  **Attack Stats (8 fields)**:
  - `totalGoal`, `totalAssist`, `totalKeyPass`
  - `totalDribbleAttempt`, `totalSuccessfulDribble`, `totalUnsuccessfulDribble`
  - `dribbleSuccessPercent`, `totalOffensiveActions`

  **Defense Stats (15 fields)**:
  - `totalDefensiveActions`, `tackleInPossession`, `tackleOob`, `tackleTurnover`
  - `tackleTeamPossession`, `recovery`, `recoveryOther`
  - `blockedShotDefensive`, `steal`, `interceptionSameTeam`
  - `deflectionTurnover`, `deflectionOob`, `totalClearance`

  **Goalkeeper Stats (4 fields)**:
  - `totalSave`, `totalCatch`, `totalPunch`, `totalMiscontrol`

  **Miscellaneous (4 fields)**:
  - `totalWoodwork`, `totalOwnGoals`
  - `teamBlackGoals`, `teamWhiteGoals`

### Complete CSV Template
Use the file `sample_match_stats_complete.csv` as a reference. It includes all 66+ stat fields:

**Header Structure:**
```csv
phoneNumber,email,matchId,teamName,paidStatsOptIn,isMvp,totalPassingActions,totalCompletePassingActions,totalIncompletePassingActions,totalPassingAccuracy,totalOpenPlayPassingActions,totalOpenPlayCompletePassingActions,totalOpenPlayIncompletePassingActions,openPlayPassingAccuracy,totalPass,totalCompletePass,totalIncompletePass,totalThroughBall,totalCompleteThroughBall,totalIncompleteThroughBall,totalLongPass,totalCompleteLongPass,totalIncompleteLongPass,totalCross,totalCompleteCross,totalIncompleteCross,openPlayCompletePass,openPlayIncompletePass,openPlayCompleteThroughBall,openPlayIncompleteThroughBall,openPlayCompleteLongPass,openPlayIncompleteLongPass,openPlayCompleteCross,openPlayIncompleteCross,totalShot,totalOnTargetShot,totalOffTargetShot,totalBlockedShotTaken,totalOtherShot,shotAccuracy,totalGoal,totalAssist,totalKeyPass,totalDribbleAttempt,totalSuccessfulDribble,totalUnsuccessfulDribble,dribbleSuccessPercent,totalOffensiveActions,totalDefensiveActions,tackleInPossession,tackleOob,tackleTurnover,tackleTeamPossession,recovery,recoveryOther,blockedShotDefensive,steal,interceptionSameTeam,deflectionTurnover,deflectionOob,totalClearance,totalSave,totalCatch,totalPunch,totalMiscontrol,totalWoodwork,totalOwnGoals,teamBlackGoals,teamWhiteGoals
```

### Sample Data Rows
```csv
9717759793,,3,Red Team,true,false,85,72,13,0.85,65,55,10,0.85,60,48,12,8,6,2,12,9,3,5,3,2,45,8,5,1,7,2,2,1,8,5,2,1,0,0.63,2,1,4,6,4,2,0.67,45,35,12,3,2,15,8,5,2,3,2,1,1,4,0,0,0,0,0,0,2,1
,midfielder@email.com,3,Blue Team,false,true,78,65,13,0.83,58,48,10,0.83,55,44,11,6,4,2,10,7,3,4,2,2,40,9,3,1,5,2,1,1,6,4,1,1,0,0.67,1,2,6,4,3,1,0.75,38,28,8,2,1,12,6,4,1,2,1,0,1,2,0,0,0,0,0,0,1,2
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
      "data": { "userId": 123, "matchId": 3 }
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
  -F 'file=@sample_match_stats_complete.csv'
```

## Notes
- **Complete Template**: Use `sample_match_stats_complete.csv` for the full 66+ field template
- **Minimal Template**: You can also use a subset of fields - only include columns you need
- Large CSV files are processed sequentially to avoid database overload
- Consider breaking very large files (>1000 rows) into smaller chunks
- All operations are logged for debugging purposes
- Database transactions ensure data consistency
- Unique constraints prevent duplicate stats for the same player/match combination 