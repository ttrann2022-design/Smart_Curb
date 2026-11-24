# Smart Curb Multi-Location Sign — Demo Build

This is a **separate version** of the Smart Curb digital sign for testing. It does not replace the working GitHub/Netlify version.

## Deploy
Upload the **entire contents of this folder** to a new Netlify site, or drag this folder into Netlify Drop. Do not upload only `index.html`. No build step required.

## Locations
- **FAU**: Four-zone original-style asphalt map. Defaults to Firebase Live Mode and supports simulated Demo Mode. Reads the existing `lots` and `units` Firebase paths.
- **Broward Mall**: Custom dark-asphalt approximate mall footprint and five parking fields. **Demo only**, with simulated sensors. Layout inferred from the map screenshot provided by the user; individual stall locations and counts are NOT verified.

## Safety and limitations
The Broward schematic is not a survey, navigable routing map, or source of real parking availability. The recommendation selects the zone with the most confirmed available simulated spaces; it does not compute driving time, congestion, A* routes, or actual entrance-based directions. The Firebase web configuration is public by design; protect data through Firebase database rules.
