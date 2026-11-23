# Smart Parking Curb: Admin Dashboard User Guide

The admin dashboard is where a manager sees which curbs are free, controls the LED panel on each curb, schedules LED looks by time of day, and reviews analytics. It runs in a web browser.

- Customer dashboard: https://smartcurb-d174e.web.app
- Company console (vendor staff only): https://smartcurb-console.web.app

## 1. How the system fits together

1. Each curb has an ultrasonic sensor and an LED panel. It detects whether a car is parked and sends the status over LoRa (915 MHz).
2. The Receiver gets the LoRa packets and writes them to Firebase Realtime Database over Wi-Fi.
3. The dashboard reads Firebase and shows the result live. When you change an LED setting on the dashboard, the Receiver sends it back to the curb over LoRa.

## 2. Signing in and roles

You sign in with the email address a manager invited. Your role decides what you can do:

| Role | Can do |
|---|---|
| Viewer | See everything. Cannot change curbs, schedules or settings. |
| Operator | Everything a viewer can, plus change a curb's LED color, panel text and brightness, and run the simulation. |
| Manager | Everything an operator can, plus invite people, change roles, edit alert settings, site settings, the theme and schedules. |

To add a person: open **Users & roles**, enter their email address and a role, and press **Send invite**. The dashboard doesn't email them, so press **Copy sign-up link** and send it to them. They create their account with that email address (**Create your account** on the sign-in page).

## 3. Live and Simulation

At the bottom of the sidebar, **Data source** switches between:

- **Live:** real data from the real curbs.
- **Simulation:** made-up data for demos. A "Simulation" label stays visible so nobody mistakes it for real data.

## 4. The pages

**Overview.** The big number is how many spots are free right now. Below it are the lots and each curb's status. Curbs that are offline or low on battery are listed under **Needs attention**, and so are curbs that have stopped reporting, if that alert is turned on in Settings.

**Parking lots.** Pick a lot, then a curb to see its status and control its LED panel (see section 5).

**Schedules.** Timed states: change what the LEDs show by time of day (see section 6).

**Curb units.** Every curb in one table, with its lot, status, battery, last change, LED color and panel text. Filter by needs attention, offline, low battery or free spots, or search for a curb.

**Assistant.** Ask a question in plain words, such as "what do the lights show on C-095?" or "which curbs are offline?". It answers from the dashboard's own data.

**Analytics.** Occupancy trends and transmission latency (see section 7).

**Users & roles.** Everyone can see who has access. Only managers can invite people and change roles.

**Settings.** Your account (change your password), the data source, the site setup, the dashboard theme (there are six themes) and alert thresholds: low battery, and whether to flag a curb that hasn't reported for a set number of minutes (off by default).

**Open lot sign.** A public page that shows free spots for each lot, designed to run on a TV at a lot entrance without signing in.

## 5. Changing a curb's LED panel

1. Open **Parking lots**, pick the lot, then pick the curb.
2. Choose a color: red, blue, green, gold or white. The curb supports only these five.
3. Type the panel text, up to 16 characters.
4. Press **Apply changes** to save the color and text.
5. Set the brightness from 0 to 100 percent with the slider. Brightness saves on its own when you let go of the slider.

The Receiver then sends the change to the curb.

An occupied curb turns its LED off. The color, text and brightness you set only show while the curb is free.

## 6. Timed states (Schedules)

A timed state is a color, panel text and brightness that apply during chosen days and hours. Examples: dim the LEDs from 10 PM to 6 AM, or show RESERVED in gold on weekdays. Only managers can change timed states.

1. Open **Schedules** and switch **Timed states** on for the site. Set the **Timezone**, and the look under **Outside timed states, show...** for the times when no timed state applies.
2. Press **New timed state**: pick the days, the start and end time, what it applies to (the whole site, selected lots or single curbs), and the look.
3. If timed states overlap, the higher priority wins. A window that passes midnight belongs to the day it starts.
4. Press **Apply now** to apply the current schedule right away.

A manual LED change stays until the next scheduled change. The version that applies schedules automatically every minute is built and tested, but it is not deployed, because it needs Firebase's paid plan. Use **Apply now** instead.

## 7. Analytics

- **Live occupancy:** percent of curbs occupied over time. It is recorded by a small script (see section 9) and only fills in while that script is running.
- **Weekly heatmap:** average occupancy by day and hour. It appears after about a week of continuous recording.
- **Transmission latency:** how long an event takes to reach the dashboard, stage by stage. Each number is tagged as measured live, a simulated benchmark, or simulated.
  - Curb to Receiver: a benchmark from Brad's report, run in the simulator, not on the curbs.
  - Receiver to Firebase: measured live.
  - Firebase to dashboard: usually too small to measure with a browser clock. When it can't be measured, the card says "Not measurable here" instead of showing a number.

A measured stage needs at least 5 samples, and a sample is one report from a curb while the page is open.

## 8. Troubleshooting

| What you see | What to check |
|---|---|
| A curb shows offline or "Needs attention" | The curb has power, and the Receiver is on and on Wi-Fi. The Receiver cannot connect on the FAU Wi-Fi, so use a hotspot or router. |
| LED change doesn't reach the curb | The Receiver is online. The color must be one of the five. |
| Analytics says "Not enough data" | Wait for at least 5 reports from a curb with the page open, or switch to Simulation. |
| A page is empty after an update | Hard refresh with Ctrl+Shift+R. |

## 9. For the team: recording occupancy history

The history recorder is a script that runs on a computer while the curbs are reporting:

```
cd admin-dashboard
npm install
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account-key.json"
npm run history:record -- --units C-095,C-201
```

- The key file gives full admin access. Keep it outside the repository and never share it.
- The recorder only records while it is running. Keep the computer awake and online.
- Name only real curbs with `--units`, or placeholder curbs are counted too.
