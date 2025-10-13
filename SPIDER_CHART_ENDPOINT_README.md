# Spider Chart Endpoint Documentation

## Overview

The Spider Chart endpoint (`GET /match-participant-stats/player/:playerId/spider-chart`) provides a compact-stats-based analysis of a player's performance across four key dimensions: **Shooting**, **Passing**, **Tackling (Defending)**, and **Impact**. This endpoint aggregates match statistics to create normalized scores (0-100) for each dimension using only compact stats, enabling visual representation in a spider/radar chart format.

## Endpoint Details

- **URL**: `GET /match-participant-stats/player/:playerId/spider-chart`
- **Authentication**: Not required
- **Parameters**: 
  - `playerId` (number, required): The unique identifier of the player
- **Response**: JSON object containing spider chart scores and detailed statistics

## Data Extraction Process

### 1. Raw Data Aggregation (Compact Only)

The endpoint uses a TypeORM QueryBuilder to extract aggregated statistics from the `match_participant_stats` table:

```sql
SELECT 
  COUNT(*) as matchesPlayed,
  player.playerCategory as playerCategory,
  AVG(COALESCE(stats.shotAccuracy, 0)) as avgShotAccuracy,
  SUM(COALESCE(stats.totalShot, 0)) as totalShots,
  AVG(COALESCE(stats.totalPassingAccuracy, 0)) as avgPassingAccuracy,
  SUM(COALESCE(stats.totalKeyPass, 0)) as totalKeyPasses,
  SUM(COALESCE(stats.totalTackles, 0)) as totalTackles,
  SUM(COALESCE(stats.totalInterceptions, 0)) as totalInterceptions,
  SUM(COALESCE(stats.totalGoal, 0)) as totalGoals,
  SUM(COALESCE(stats.totalAssist, 0)) as totalAssists,
  SUM(CASE WHEN stats.isMvp = true THEN 1 ELSE 0 END) as totalMvpWins,
  SUM(COALESCE(stats.totalSave, 0)) as totalSave
FROM match_participant_stats stats
LEFT JOIN users player ON player.id = stats.player_id
WHERE stats.player.id = :playerId
GROUP BY player.playerCategory
```

### 2. Data Source Fields (Compact)

The endpoint extracts data from the following database fields:

#### Shooting Metrics
- `shotAccuracy`: Percentage of shots on target (stored as decimal, e.g., 0.8 = 80%)
- `totalShot`: Total number of shots attempted

#### Passing Metrics
- `totalPassingAccuracy`: Overall passing accuracy percentage
- `totalKeyPass`: Total key passes made

#### Defensive Metrics
- `totalTackles`: Total tackles attempted
- `totalInterceptions`: Total interceptions made

#### Impact Metrics
- `totalGoal`: Total goals scored
- `totalAssist`: Total assists provided
- `isMvp`: Boolean flag indicating MVP performance

## Calculation Methodology

### 1. Shooting Score (0-100)

**Formula**: `Math.min(100, (shotAccuracy * 0.8) + (Math.min(shotsPerMatch * 4, 20) * 0.2))`

**Components**:
- **Accuracy Weight (80%)**: `shotAccuracy * 0.8`
  - Shot accuracy is converted from decimal to percentage (e.g., 0.8 → 80%)
  - Directly contributes 80% of the shooting score
- **Volume Bonus (20%)**: `Math.min(shotsPerMatch * 4, 20) * 0.2`
  - `shotsPerMatch = totalShots / matchesPlayed`
  - Each shot per match contributes 4 points (capped at 20 points)
  - Maximum bonus contribution is 20% of total score

### 2. Passing Score (0-100)

**Formula**: `overallPassingAccuracy`

**Logic**: Uses the overall passing accuracy from compact stats.

### 3. Tackling (Defending) Score (0-100)

**Formula**: `Math.min(100, (min(tacklesPerMatch * 20, 60) + min(interceptionsPerMatch * 20, 40)))`

**Components**:
- Tackles per match (capped to 60 of the 100 scale)
- Interceptions per match (capped to 40 of the 100 scale)

### 4. Impact Score (0-100)

**Formula**: `Math.min(100, (impactPerMatch / 2.0) * 100)`

**Components**:
- **Impact Per Match**: `(totalGoals + totalAssists) / matchesPlayed`
- **Scaling Factor**: 2.0 goals + assists per match = 100 points
- **Normalization**: Linear scaling where 2.0 impact per match equals maximum score

## Response Structure

```json
{
  "playerId": 123,
  "matchesPlayed": 15,
  "totalMvpWins": 3,
  "spiderChart": {
    "shooting": 70.4,
    "passing": 82.0,
    "tackling": 59.6,
    "impact": 88.67
  },
  "detailedStats": {
    "shooting": {
      "shotAccuracy": 85.0,
      "shotsPerMatch": 3.0,
      "totalShots": 45
    },
    "passing": {
      "overallAccuracy": 78.0,
      "totalKeyPasses": 12
    },
    "tackling": {
      "totalTackles": 30,
      "interceptions": 18
    },
    "impact": {
      "goalsAndAssistsPerMatch": 1.33,
      "totalGoals": 12,
      "totalAssists": 8
    }
  }
}
```

## Error Handling

- **Player Not Found**: Returns 404 if no stats exist for the specified player
- **No Matches Played**: Returns empty spider chart and detailed stats objects
- **Invalid Player ID**: Returns 400 for non-numeric player IDs

## Performance Considerations

- **Caching**: Consider caching results for frequently accessed players
- **Database Indexing**: Ensure proper indexing on `player_id` and related fields
- **Pagination**: For players with extensive match history, consider limiting the date range

## Data Quality Notes

- **NULL Handling**: All calculations use `COALESCE` to handle NULL values (defaulting to 0)
- **Percentage Conversion**: Accuracy percentages are stored as decimals (0.0-1.0) and converted to percentages (0-100)
- **Division by Zero**: Protected against division by zero when calculating per-match statistics
- **Rounding**: All final scores are rounded to 2 decimal places for consistency

## Future Enhancements

1. **Time-based Filtering**: Add date range parameters for seasonal analysis
2. **Position-specific Weighting**: Adjust calculations based on player position
3. **League/Competition Filtering**: Allow filtering by specific competitions
4. **Comparative Analysis**: Add endpoints for comparing multiple players
5. **Trend Analysis**: Include historical progression of spider chart scores 