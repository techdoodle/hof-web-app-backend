## v1.2.0 (2025-01-21)

### What changed
- Promo codes can now be restricted to specific users:
  - When creating or editing a promo code, you can select which users are allowed to use it.
  - If you don't select any users, the promo code works for everyone (subject to other restrictions like cities, matches, first-time users, etc.).
  - If you select specific users, only those users can redeem the promo code.
  - The promo code detail page shows which users are allowed to use it.

### How to test
1. Go to **Promo Codes** → click **Create**.
2. Fill in the basic promo code details (code, discount, dates, etc.).
3. Scroll to the **Eligibility Rules** section.
4. In the **Allowed Users** field, search for and select one or more users.
5. Save the promo code.
6. Open the promo code detail page (click **Show**) and verify the selected users are displayed.
7. Try to validate the promo code with a user who is NOT in the allowed list (should fail with "This promo code is not available for your account").
8. Try to validate the promo code with a user who IS in the allowed list (should work if other conditions are met).

## v1.1.0 (2025-01-20)

### What changed
- New **Tickets** feature for reporting and tracking match issues:
  - Admins can now create tickets directly from match detail pages using a "Report issue" button.
  - A new **Tickets** tab appears in the admin menu (visible to Admin and Super Admin roles).
  - In the Tickets list, you can filter by match ID, status, priority, and creator.
  - Click any ticket to open the edit screen where you can:
    - Change the status (Open → In Progress → Resolved)
    - Update priority (Low, Medium, High)
    - Assign the ticket to another admin
    - Add resolution notes

### How to test
1. Go to **Matches** → open any match → click **Show**.
2. Scroll down and click the **Report issue** button.
3. Fill in the ticket form (title, description, priority) and submit.
4. Go to the **Tickets** tab in the menu.
5. Find your ticket in the list (you can filter by match ID or status).
6. Click the ticket row to open the edit screen.
7. Change the status to "In Progress", add resolution notes, and save.
8. Verify the status update appears in the Tickets list.

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


