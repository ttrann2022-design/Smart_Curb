<p align="center">
  <img src="admin-dashboard/src/assets/smartcurb-logo.jpg" alt="Smart Curb logo" width="150">
</p>

<h1 align="center">Smart Wheel Stop</h1>

<p align="center">
  A solar-powered smart parking curb that knows when a spot is taken,<br>
  tells drivers where to go, and lets admins run every lot from one screen.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black" alt="Firebase">
  <img src="https://img.shields.io/badge/Flutter-02569B?logo=flutter&logoColor=white" alt="Flutter">
  <img src="https://img.shields.io/badge/ESP32-E7352C?logo=espressif&logoColor=white" alt="ESP32">
  <img src="https://img.shields.io/badge/LoRa-planned-555555" alt="LoRa planned">
</p>

<p align="center">
  <b>FAU Engineering Senior Design · Fall 2026 · Team Smart Curb</b><br>
  <a href="https://smartcurb-d174e.web.app">Admin dashboard</a> ·
  <a href="https://smartcurb-d174e--demo-azspi0b7.web.app">Live demo</a> (until Oct 31, 2026)
</p>

---

## The problem

Finding parking is slower and more stressful than it should be. A spot that looks open from the lane turns out to have a small car tucked into it. Permit signs are easy to miss, so it's not obvious which rows are red permit and which are blue. Drivers loop the same lots over and over, which means more traffic, more frustration, and more chances for a collision.

The Smart Wheel Stop replaces the ordinary concrete curb at the front of each parking space with one that **detects whether the spot is taken**, **shows the zone with a colored LED panel**, and **reports live to a central system** that drivers and staff can both see.

## How it works

```mermaid
flowchart LR
    curb["Smart Wheel Stop curb<br/>ESP32 · sensor · LED panel"] -->|"LoRa (planned)"| gw["Gateway"]
    gw --> db[("Firebase<br/>Realtime Database")]
    db --> admin["Admin dashboard<br/>React"]
    db --> app["Driver app<br/>Flutter"]
    db --> sign["Lot entrance sign"]
    admin -->|"LED color + panel text"| db
```

1. Each curb senses whether a car is parked and reports its status, battery level, and health.
2. Everything lands in one shared Firebase Realtime Database.
3. The **driver app** shows which lots have room and routes drivers to the best one.
4. The **admin dashboard** shows every curb live, and can change any curb's LED color and panel text remotely, so a permit zone can be changed without repainting a single curb.
5. A **lot entrance sign** shows open spaces for drivers who aren't using the app.

## What's in the system

### Admin dashboard · `admin-dashboard/`

| Page | What it does |
|---|---|
| **Overview** | Live totals, occupancy for every lot, and alerts for offline curbs and low batteries |
| **Parking lots** | A tile for every curb, plus remote control of each curb's LED color and panel text |
| **Curb units** | Every curb in one table, with filters for offline, low battery, and open spots |
| **Lot sign** | A full-screen entrance sign view, built for a TV or projector |
| **Assistant** | Answers plain-language questions like *"where should I park?"* from live data |
| **Analytics** | Occupancy heatmap by day and hour, plus a live occupancy trend |
| **Users & roles** | Viewer, Operator, and Manager access, with invite-only sign-up |

It updates in real time, works on phones and tablets, and has a demo mode with a built-in traffic simulator.

### Driver app · `smart_curb/`

A Flutter app with a map of campus lots showing live availability, with A\* routing that recommends the best lot for where the driver is headed.

### Hardware

Solar panels and rechargeable batteries power each curb. An ESP32 microcontroller reads an ultrasonic sensor and drives the LED panel. LoRa networking is planned for getting readings from the curbs to the database.

## Tech stack

| Layer | Technology |
|---|---|
| Admin dashboard | React, Vite, React Router |
| Driver app | Flutter |
| Backend | Firebase Authentication, Firebase Realtime Database, Firebase Hosting |
| Routing | A\* search |
| Curb hardware | ESP32, ultrasonic sensor, LED panel, solar + rechargeable batteries |
| Curb networking | LoRa (planned) |

## Repository layout

```
Smart_Curb/
├── admin-dashboard/        React admin console
│   ├── src/pages/          One file per page
│   ├── src/components/     Shared layout and animated numbers
│   ├── src/demo/           Demo data and traffic simulator
│   └── .env.demo           Settings for demo mode
├── smart_curb/             Flutter driver app
├── run_parking_test.py     A* parking algorithm test
├── database.rules.json     Firebase security rules (draft)
└── README.md
```

## Getting started

### Admin dashboard

You'll need [Node.js](https://nodejs.org) (LTS version).

```bash
cd admin-dashboard
npm install
npm run dev
```

Open http://localhost:5173. Sign-up is invite-only: a Manager invites you from **Users & roles**, then you create your account with that exact email.

| Command | What it does |
|---|---|
| `npm run dev` | Run locally with real data |
| `npm run dev:demo` | Run locally with demo data and Demo controls |
| `npm run build` | Build the real site |
| `npm run build:demo` | Build the demo site |

### Driver app

You'll need the [Flutter SDK](https://docs.flutter.dev/get-started/install).

```bash
cd smart_curb
flutter pub get
flutter run -d chrome
```

On Windows, Flutter needs **Developer Mode** turned on (Settings → System → For developers).

### Deploying

From `admin-dashboard`, with the [Firebase CLI](https://firebase.google.com/docs/cli) installed:

```bash
# Real site
npm run build
firebase deploy --only hosting

# Demo site
npm run build:demo
firebase hosting:channel:deploy demo --expires 30d
```

Always check which build you just ran before deploying. Deploying a demo build to the real site puts demo data and Demo controls in front of real users.

## Data model

```
lots/<lotId>
    name           "Lot 6"
    openSpots      7
    totalSpots     20
    units/         { "C-001": true, ... }

units/<curbId>
    lot            "lot06"
    occupied       true / false
    online         true / false
    battery        0 to 100
    ledColor       red | blue | green | gold | white
    panelText      up to 16 characters

users/<uid>        Dashboard accounts: email, role, last active
invites/<email>    Pending dashboard invites (dots in the email become commas)
drivers/<uid>      Driver app accounts
demo/              Same shape as above, used only for demos
```

A few rules keep everything in sync:

- A curb's `lot` must match its lot's ID **exactly**, including upper and lower case.
- Lot IDs are zero-padded (`lot06`, `lot07`) so they sort in the right order.
- Whoever changes a curb also updates that lot's `openSpots` and `totalSpots` **in the same write**, so the counts can never disagree with the curbs.

## Demo mode

`npm run dev:demo` and the live demo link read and write only the `demo/` section of the database, so a demo can never touch real data. The **Demo controls** page provides:

| Control | What it does |
|---|---|
| **Load fresh demo data** | Creates 94 curbs across Lots 6, 7, 12, and 14, plus a week of occupancy history |
| **Start simulation** | Cars arrive and leave every two seconds, and every screen updates live |
| **Rush hour in Lot 6** | Fills Lot 6 almost instantly |
| **Take a curb offline** | Knocks a random curb offline to trigger an alert |
| **Bring all curbs online** | Restores every offline curb |

## Roles

| Role | Can do |
|---|---|
| **Viewer** | See occupancy, battery, and curb status |
| **Operator** | Everything a Viewer can, plus change LED colors and panel text |
| **Manager** | Everything, plus invite people and change roles |

## Working in this repo

- **Run `git pull` before you start**, every time.
- **`main`** is the real product. Work in progress goes on its own branch and comes into `main` through a pull request.
- If `git status` shows generated Flutter plugin files you didn't mean to change, run `git restore smart_curb` from the repo root before committing or switching branches.

## Roadmap

- [ ] Publish the Firebase security rules
- [ ] LoRa gateway writing live curb readings and lot counts
- [ ] Exact GPS position for every curb, for spot-level navigation
- [ ] Separate data for each customer facility
- [ ] AI language model behind the Assistant
- [ ] Facility type and theme setup for new customers

## Team

| Name | Focus |
|---|---|
| Ryan Hart | Power, sensors, and hardware integration |
| Brad Middlebrook | A\* parking efficiency algorithm |
| Tuan Nhat Tran | Driver app, map, and routing |
| Tim Perez | Microcontroller and security |
| Naqib Chowdhury | Admin dashboard and system architecture |

<p align="center"><sub>Built at Florida Atlantic University</sub></p>