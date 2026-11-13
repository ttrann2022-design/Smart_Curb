# Smart Curb — Integrated Live Map and Recommendations

This version combines the previous parking-map prototype with the **existing** lot-recommendation algorithm. It is a standalone browser sign, not yet merged into the team's `admin-dashboard/src/pages/Sign.jsx`.

## Open in VS Code

1. Extract the ZIP, then open the **digital-parking-sign** folder in VS Code.
2. Open `index.html` using the **Live Server** VS Code extension (right-click > Open with Live Server).
3. Click **Switch to demo mode** to see two example lots with colored dots and automatically changing recommendations.
4. Click **Simulate curb change** to toggle a sample curb. Click **Return to live data** to attempt reading the team's Firebase.
5. Press F11 in Chrome for full-screen presentation.

## What is implemented

- Schematic parking lot map using **green available**, **red occupied**, **gray offline**, and **yellow unknown** dots.
- Live, read-only Firebase Realtime Database listeners for `lots/` and `units/`.
- Existing `scoring.js` recommendation heuristic that prefers lots with confirmed open spaces and lower occupancy. **Not A* routing or verified travel-distance recommendations.**
- Simulation mode with 2 lots and 24 sample curb IDs each; demo controls never write to Firebase.
- Optional `?site=SITE_ID` for live-site filtering.

## What still needs work

- Confirm Firebase database rules and test physical curb -> receiver -> Firebase -> sign end-to-end.
- Integrate this standalone UI into the team's React `Sign.jsx` page (not yet done).
- Obtain a genuine lot image/site plan and coordinates to replace schematic grid with accurate aerial overlay.
- Confirm real curb IDs and lot assignments. Unsensored spaces cannot truthfully show live occupancy.
- Directional arrows, route recommendations and A* integration require verified routing/entrance information.

## Files

- `index.html` — layout/styles
- `app.js` — Firebase subscriptions, map UI, simulation and recommendation display
- `scoring.js` — pure recommendation/status logic retained from previous prototype
- `config.js` — public Firebase web app identifiers (never store admin secrets)
- `test-scoring.mjs` — scoring logic tests (`node test-scoring.mjs`)

No Firebase database writes or rules changes are performed.
