About the API
These endpoints let you securely authenticate, create a match, obtain player stats and highlight for every match.
Before calling any endpoint, you must first authenticate and obtain a valid JWT token.
Base URL: https://api.theplayernation.com


Authentication
The API uses JWT (JSON Web Token) based authentication. Before you can call any endpoint, you’ll need to authenticate and obtain a valid token. Without it, your requests will be rejected.
Tokens are valid for 30 days. After that, you’ll need to re-authenticate.
If you receive a 401 response, re-validate your phone number and update it online before retrying authentication.
Step 1: Get Password: Contact the PlayerNation team to obtain the password tied to your account.
Step 2: Verify Password & get token: Use the /hof/verify endpoint to obtain your token.
Step 3: Use the token: After receiving your JWT token, include it in the Authorization header as a Bearer token for all subsequent API requests.




Verify Password
Description: Verifies your account and returns a JWT token.
Method: POST
Path: /hof/verify
Request
Headers
Content-Type (string) Required - application/json
Request Body
phone (string) Required - Registered phone number using country code
password (string) Required - 6-digit password given by PlayerNation
Copy
{
  "phone": "+919999999999",
  "password": "222222"
}
Response
success (boolean) – Indicates whether the request was successful
message (string) – Response message providing additional context
accessToken (string) – JWT access token to be used for authenticated requests
Example:
Copy
{
  "success": true,
  "message": "Verify successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsI.eyJ1c2VySWQiOiIxMjM0NTYsImV4cCI6MTcyODA1NjgwMH0.abc123XYZ"
}
Response Codes:
200 - Success: Verify successfull
400 - Bad Request: The OTP provided is incorrect or expired.
401 - Unauthorized: Invalid OTP. Please check and try again.
429 - Too Many Attempts: OTP verification attempts exceeded.
500 - Internal Server Error: Something went wrong on our end.





Upload Game
Description: Uploads a complete game with all players in a single API call. Designed for create a match.
Method: POST
Path: /hof/uploadGame
Request
Headers
Content-Type (string) Required - application/json
Authorization (string) Required - Bearer token for authentication. Example: 'Bearer YOUR_JWT_TOKEN'
Request Body
teamA (string) Required - Team A Jersey Color / Name
teamB (string) Required - Team B Jersey Color / Name
matchFormat (enum) - Match format (THREE_VS_THREE, FIVE_VS_FIVE, SEVEN_VS_SEVEN, NINE_VS_NINE, ELEVEN_VS_ELEVEN)
matchDuration (number) - Match duration in minutes
matchDate (string (ISO date)) Required - Match date in ISO format
matchLink (string (URL)) Required - Match video URL
matchName (string) - Custom match name
teamAScore (number) - Team A scrore
teamBScore (number) - Team B scrore
matchMetaDataJson (JSON) - JSON object with additional info on the match such as formation, positions, etc.
players.teamA (array) Required - List of players for Team A
players.teamA[ ].name (string) - Player name
players.teamA[ ].hofPlayerId (string) - Hof internal player ID
players.teamA[ ].jerseyNumber (string) - Player jersey number
players.teamA[ ].playerVideo (string (URL)) - Player 360 video URL
players.teamA[ ].playerImages (array) - Array of player images
players.teamA[ ].ownGoal (number) - Goals scored by this player
players.teamA[ ].goal (number) - Goals scored against this player
players.teamB (array) Required - List of players for Team B
players.teamB[ ].name (string) - Player name
players.teamB[ ].hofPlayerId (string) - Hof internal player ID
players.teamB[ ].jerseyNumber (string) - Player jersey number
players.teamB[ ].playerVideo (string (URL)) - Player 360 video URL
players.teamB[ ].playerImages (array) - Array of player images
players.teamB[ ].ownGoal (number) - Number of goals this player accidentally scored against their own team.
players.teamB[ ].goal (number) - Number of goals this player scored against the opponent team.
Copy
{
  "teamA": "Barcelona FC",
  "teamB": "Real Madrid",
  "matchDuration": 90,
  "matchDate": "2024-01-15T15:00:00Z",
  "matchLink": "https://hof-videos.com/el-clasico-360.mp4",
  "matchName": "El Clasico",
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
        "jerseyNumber": "10",
        "playerVideo": "https://example.com/messi-360.mp4",
        "playerImages": [
          "https://example.com/messi-thumb.jpg"
        ],
        "goal": 2,
        "ownGoal": 1
      },
      {
        "name": "Sergio Busquets",
        "hofPlayerId": "HF-PLAYER-002",
        "jerseyNumber": "11",
        "goal": 0,
        "ownGoal": 1
      }
    ],
    "teamB": [
      {
        "name": "Karim Benzema",
        "hofPlayerId": "HF-PLAYER-003",
        "jerseyNumber": "9",
        "goal": 1,
        "ownGoal": 2
      },
      {
        "name": "Luka Modric",
        "hofPlayerId": "HF-PLAYER-004",
        "jerseyNumber": "10"
      }
    ]
  }
}
Response
success (boolean) – Indicates whether the request was successful
message (string) – Response message providing additional context
matchId (string) – Unique identifier for the requested match
Example:
Copy
{
  "success": true,
  "message": "Match upload successfully",
  "matchId": "255a3673-dc5d-451f-a5c1-dbc4b020464f"
}
Response Codes:
201 - Success: Match upload successfully
400 - Invalid Data: Provided data is incomplete or invalid
401 - Unauthorized: Missing or invalid JWT token
500 - Internal Server Error: Something went wrong on our end.







Get Player Statistics
Description: Retrieve all player statistics for a specific match, grouped by playerId.
Method: POST
Path: /hof/getStats
Request
Headers
Content-Type (string) Required - application/json
Authorization (string) Required - Bearer token for authentication. Example: 'Bearer YOUR_JWT_TOKEN'
Request Body
matchId (string (UUID)) Required - Unique identifier of the match
Copy
{
  "matchId": "f26fccaa-97b5-4cbc-9e0a-4e874ca1b59d"
}
Response
status (string) – Indicates the overall status of the response (e.g., success or analyzing or cancelled)
matchNotes (string) – Match analysis completed successfully/ The match is currently being analyzed/ This was not a football match footage
playerStats (object) – Detailed player-wise statistics keyed by matchId
playerStats.<playerId>.playerInfo (object) – Information about the player (name, jersey number, team, hofPlayerId,thumbnail)
playerStats.<playerId>.stats (object) – Performance statistics for the player including goals, assists, tackles, etc.
playerStats.<playerId>.hightlightURL (array) – Array of highlight videos for the player's performance.
playerStats.<playerId>.hightlightURL[ ].youtubeVideoUrl (string) – YouTube video URL of the highlight.
playerStats.<playerId>.hightlightURL[ ].name (string) – Name/identifier of the highlight video (e.g., 'top_moments_1', 'top_moments_2').
playerStats.<playerId>.stats.<statName>.totalCount (number) – Total occurrences of the given stat (e.g., goals = 2)
playerStats.<playerId>.stats.<statName>.isPercentageStat (boolean) – Whether the stat is a percentage
playerStats.<playerId>.stats.<statName>.minutes (array<number>) – Match minutes when this event occurred (only provided for time-based actions like goals; empty if not applicable)
Example:
Expand
Copy
{
  "status": "success",
  "playerStats": {
    "255a3673-dc5d-451f-a5c1-dbc4b020464f": {
      "playerInfo": {
        "name": "Luka Modric",
        "jerseyNumber": "10",
        "team": "B",
        "hofPlayerId": "HF-PLAYER-004",
        "thumbnail": [
          "https://hof-thumbnail.com/player-255a3673-dc5d-451f-a5c1-dbc4b020464f.png"
        ]
      },
      "hightlightURL": [
        {
          "youtubeVideoUrl": "https://www.youtube.com/watch?v=example1",
          "name": "top_moments_2"
        },
        {
          "youtubeVideoUrl": "https://www.youtube.com/watch?v=example2",
          "name": "top_moments_1"
        }
      ],
      "stats": {
        "goal": {
          "totalCount": 2,
          "description": "Successful attempt that results in a goal",
          "isPercentageStat": false,
          "minutes": [
            16,
            68
          ]
        }
      }
    }
  }
}
Response Codes:
200 - Success: Match statistics retrieved successfully or The match is currently being analyzed or This was not a football match footage
400 - Bad Request: Invalid or missing matchId
401 - Unauthorized: Missing or invalid JWT token
404 - Match Not Found: No match found with the provided matchId
500 - Internal Server Error: Something went wrong on our end