# Admin Dashboard Demo Script (about 5 minutes)

## Before the showcase (do the day before and 30 minutes before)
- [ ] Receiver powered, on a phone hotspot or your own router (not FAU Wi-Fi), and both curbs (C-095, C-201) powered.
- [ ] Open https://smartcurb-d174e.web.app signed in as a Manager. Data source = Live.
- [ ] A second tab on Simulation, in case the hardware or Wi-Fi fails.
- [ ] Confirm both curbs show online and a car/hand over the sensor flips the status within a few seconds.
- [ ] Open lot sign page on a second screen if available.
- [ ] History recorder running on your desktop (for Analytics), computer awake.
- [ ] Screen mirroring tested; browser zoom 100 percent; notifications off.

## Script
1. **Overview (30 s).** "This is the Admin Dashboard. The big number is free spots right now, with each lot and curb below."
2. **Live occupancy (45 s).** Have a teammate cover the sensor on C-095. Say: "Sensor, LoRa, Receiver, Firebase, dashboard." The curb flips to occupied and the free count drops. Uncover it and it flips back.
3. **LED control (45 s).** Parking lots, pick the lot, pick C-095, choose gold, type RESERVED, press Apply changes, then set the brightness slider to 60. Point to the physical panel changing. Say: "Operators and managers can do this; viewers cannot."
4. **Schedules (45 s).** Open Schedules and show a rule (dim 10 PM to 6 AM, or RESERVED in gold on weekdays). Press Apply now. Say: "The every-minute automatic version is built and tested but needs the paid Firebase plan, so Apply now covers the demo."
5. **Offline alert (30 s).** Unplug C-201 (or its power) ahead of time if you want to show it, and point to Needs attention. Say: "A curb that goes silent is flagged instead of showing stale data."
6. **Assistant (20 s).** Ask "what do the lights show on C-095?"
7. **Analytics (45 s).** Show occupancy and latency. Say: "Receiver to Firebase is measured live. Curb to Receiver is a benchmark from our simulator and is labeled that way. Firebase to dashboard is too small to measure with a browser clock, so it says so."
8. **Roles and security (20 s).** Users and roles: three roles, invite-only, database rules tested.
9. **Close (15 s).** "One dashboard for monitoring, control, schedules and analytics; the real hardware runs end to end."

## If something fails
- Wi-Fi or Receiver down: switch to the Simulation tab and say so out loud.
- Curb not updating: check Receiver power and hotspot; wait 15 s for the next heartbeat.
- Page looks stale: Ctrl+Shift+R.
- Never show the Firebase console, key files or passwords on screen.
