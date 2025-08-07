# Spider Chart Endpoint Documentation

## Overview

The Spider Chart endpoint (`GET /match-participant-stats/player/:playerId/spider-chart`) provides a comprehensive statistical analysis of a player's performance across five key dimensions: **Shooting**, **Passing**, **Dribbling**, **Tackling**, and **Impact**. This endpoint aggregates match statistics to create normalized scores (0-100) for each dimension, enabling visual representation in a spider/radar chart format.

## Endpoint Details

- **URL**: `GET /match-participant-stats/player/:playerId/spider-chart`
- **Authentication**: Not required
- **Parameters**: 
  - `playerId` (number, required): The unique identifier of the player
- **Response**: JSON object containing spider chart scores and detailed statistics

## Data Extraction Process

### 1. Raw Data Aggregation

The endpoint uses a TypeORM QueryBuilder to extract aggregated statistics from the `match_participant_stats` table:

```sql
SELECT 
  COUNT(*) as matchesPlayed,
  AVG(COALESCE(stats.shotAccuracy, 0)) as avgShotAccuracy,
  SUM(COALESCE(stats.totalShot, 0)) as totalShots,
  SUM(COALESCE(stats.totalOnTargetShot, 0)) as totalOnTargetShots,
  AVG(COALESCE(stats.totalPassingAccuracy, 0)) as avgPassingAccuracy,
  AVG(COALESCE(stats.openPlayPassingAccuracy, 0)) as avgOpenPlayPassingAccuracy,
  AVG(COALESCE(stats.dribbleSuccessPercent, 0)) as avgDribbleSuccess,
  SUM(COALESCE(stats.totalDribbleAttempt, 0)) as totalDribbleAttempts,
  SUM(COALESCE(stats.totalSuccessfulDribble, 0)) as totalSuccessfulDribbles,
  SUM(COALESCE(stats.totalDefensiveActions, 0)) as totalDefensiveActions,
  SUM(COALESCE(stats.tackleInPossession, 0) + COALESCE(stats.tackleTeamPossession, 0)) as successfulTackles,
  SUM(COALESCE(stats.tackleInPossession, 0) + COALESCE(stats.tackleOob, 0) + COALESCE(stats.tackleTurnover, 0) + COALESCE(stats.tackleTeamPossession, 0)) as totalTackleAttempts,
  SUM(COALESCE(stats.totalGoal, 0)) as totalGoals,
  SUM(COALESCE(stats.totalAssist, 0)) as totalAssists,
  SUM(CASE WHEN stats.isMvp = true THEN 1 ELSE 0 END) as totalMvpWins,
  SUM(COALESCE(stats.totalCompletePassingActions, 0)) as totalCompletePassingActions,
  SUM(COALESCE(stats.steal, 0)) as totalSteals,
  SUM(COALESCE(stats.interceptionSameTeam, 0)) as totalInterceptionSameTeam
FROM match_participant_stats stats
WHERE stats.player.id = :playerId
```

### 2. Data Source Fields

The endpoint extracts data from the following database fields:

#### Shooting Metrics
- `shotAccuracy`: Percentage of shots on target (stored as decimal, e.g., 0.8 = 80%)
- `totalShot`: Total number of shots attempted
- `totalOnTargetShot`: Number of shots on target

#### Passing Metrics
- `totalPassingAccuracy`: Overall passing accuracy percentage
- `openPlayPassingAccuracy`: Open play passing accuracy percentage
- `totalCompletePassingActions`: Total successful passing actions

#### Dribbling Metrics
- `dribbleSuccessPercent`: Dribbling success rate percentage
- `totalDribbleAttempt`: Total dribbling attempts
- `totalSuccessfulDribble`: Successful dribbles

#### Defensive Metrics
- `totalDefensiveActions`: Total defensive actions performed
- `tackleInPossession`: Successful tackles that result in possession
- `tackleTeamPossession`: Successful tackles that result in team possession
- `tackleOob`: Tackles that result in ball out of bounds
- `tackleTurnover`: Tackles that result in turnover
- `steal`: Number of steals
- `interceptionSameTeam`: Interceptions that maintain team possession

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

**Example**: Player with 85% accuracy and 3 shots per match
- Accuracy component: 85 × 0.8 = 68
- Volume component: min(3 × 4, 20) × 0.2 = 12 × 0.2 = 2.4
- Total: min(100, 68 + 2.4) = 70.4

### 2. Passing Score (0-100)

**Formula**: `Math.max(overallPassingAccuracy, openPlayPassingAccuracy)`

**Logic**: Uses the higher of two passing accuracy metrics:
- `overallPassingAccuracy`: General passing accuracy across all situations
- `openPlayPassingAccuracy`: Passing accuracy in open play situations

**Example**: Player with 78% overall accuracy and 82% open play accuracy
- Passing score = max(78, 82) = 82

### 3. Dribbling Score (0-100)

**Formula**: `Math.min(100, (dribbleSuccess * 0.9) + (Math.min(dribbleAttemptsPerMatch * 2, 10) * 0.1))`

**Components**:
- **Success Rate Weight (90%)**: `dribbleSuccess * 0.9`
  - Dribbling success percentage (converted from decimal)
  - Primary factor in dribbling assessment
- **Frequency Bonus (10%)**: `Math.min(dribbleAttemptsPerMatch * 2, 10) * 0.1`
  - `dribbleAttemptsPerMatch = totalDribbleAttempts / matchesPlayed`
  - Each attempt per match contributes 2 points (capped at 10 points)
  - Maximum bonus contribution is 10% of total score

**Example**: Player with 75% success rate and 4 attempts per match
- Success component: 75 × 0.9 = 67.5
- Frequency component: min(4 × 2, 10) × 0.1 = 8 × 0.1 = 0.8
- Total: min(100, 67.5 + 0.8) = 68.3

### 4. Tackling Score (0-100)

**Formula**: `Math.min(100, (tackleSuccessRate * 0.7) + (Math.min(defensiveActionsPerMatch * 1.5, 30) * 0.3))`

**Components**:
- **Success Rate Weight (70%)**: `tackleSuccessRate * 0.7`
  - `tackleSuccessRate = (successfulTackles / totalTackleAttempts) * 100`
  - `successfulTackles = tackleInPossession + tackleTeamPossession`
  - `totalTackleAttempts = tackleInPossession + tackleOob + tackleTurnover + tackleTeamPossession`
- **Defensive Activity Weight (30%)**: `Math.min(defensiveActionsPerMatch * 1.5, 30) * 0.3`
  - `defensiveActionsPerMatch = totalDefensiveActions / matchesPlayed`
  - Each defensive action per match contributes 1.5 points (capped at 30 points)
  - Maximum bonus contribution is 30% of total score

**Example**: Player with 80% tackle success and 8 defensive actions per match
- Success component: 80 × 0.7 = 56
- Activity component: min(8 × 1.5, 30) × 0.3 = 12 × 0.3 = 3.6
- Total: min(100, 56 + 3.6) = 59.6

### 5. Impact Score (0-100)

**Formula**: `Math.min(100, (impactPerMatch / 1.5) * 100)`

**Components**:
- **Impact Per Match**: `(totalGoals + totalAssists) / matchesPlayed`
- **Scaling Factor**: 1.5 goals + assists per match = 100 points
- **Normalization**: Linear scaling where 1.5 impact per match equals maximum score

**Example**: Player with 12 goals and 8 assists in 15 matches
- Impact per match: (12 + 8) / 15 = 1.33
- Impact score: min(100, (1.33 / 1.5) × 100) = 88.67

## Response Structure

```json
{
  "playerId": 123,
  "matchesPlayed": 15,
  "totalMvpWins": 3,
  "spiderChart": {
    "shooting": 70.4,
    "passing": 82.0,
    "dribbling": 68.3,
    "tackling": 59.6,
    "impact": 88.67
  },
  "detailedStats": {
    "shooting": {
      "shotAccuracy": 85.0,
      "shotsPerMatch": 3.0,
      "totalShots": 45,
      "totalOnTargetShots": 38
    },
    "passing": {
      "overallAccuracy": 78.0,
      "openPlayAccuracy": 82.0,
      "totalCompletePassingActions": 234
    },
    "dribbling": {
      "successRate": 75.0,
      "attemptsPerMatch": 4.0,
      "totalAttempts": 60,
      "totalSuccessful": 45
    },
    "tackling": {
      "successRate": 80.0,
      "defensiveActionsPerMatch": 8.0,
      "totalDefensiveActions": 120,
      "successfulTackles": 24,
      "totalTackleAttempts": 30,
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

## Usage Examples

### Frontend Integration

```javascript
// Fetch spider chart data
const response = await fetch('/match-participant-stats/player/123/spider-chart');
const data = await response.json();

// Use with charting library (e.g., Chart.js)
const chartData = {
  labels: ['Shooting', 'Passing', 'Dribbling', 'Tackling', 'Impact'],
  datasets: [{
    label: 'Player Performance',
    data: [
      data.spiderChart.shooting,
      data.spiderChart.passing,
      data.spiderChart.dribbling,
      data.spiderChart.tackling,
      data.spiderChart.impact
    ],
    backgroundColor: 'rgba(54, 162, 235, 0.2)',
    borderColor: 'rgba(54, 162, 235, 1)',
    borderWidth: 2
  }]
};
```

### Performance Considerations

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