## v1.0.0 (2025-12-15)

### What changed
- Stats behaviour for recorded matches has been updated:
  - When only some players are mapped to stats, you can still save and process stats for those mapped players.
  - The match will continue to show as **“SS Mapping Pending” / “Stats mapping pending”** until **all** detected players are mapped and processed.
  - Once all players are mapped and stats are processed again, the match will move to **“Stats Updated”**.

### How to test
1. Create or open a recorded match and upload stats.
2. On the stats mapping screen, map only some of the detected players to your registered players.
3. Process stats:
   - Confirm that stats appear for the mapped players.
   - Confirm that in the Matches list, the match status still shows “SS Mapping Pending” / “Stats mapping pending”.
4. Go back to the stats mapping screen, map all remaining players, and process stats again.
5. Confirm that the Matches list now shows the match as “Stats Updated”.


