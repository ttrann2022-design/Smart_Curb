
import { firebaseConfig } from "./config.js";
import { rankLots } from "./scoring.js";

const $ = id => document.getElementById(id);
const ZONES = ["A", "B", "C", "D"];
const DEMO_SPACES_PER_ZONE = 24;

let mode = "live";
let liveLots = {};
let liveUnits = {};
let demoLots = {};
let demoUnits = {};
let unsubscribe = [];
let errorMessage = "";

function entries(value) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).filter(([, v]) => v && typeof v === "object");
}

function makeDemo() {
  demoLots = {};
  demoUnits = {};

  ZONES.forEach((zone, zoneIndex) => {
    const lotId = `lot${zone}`;
    demoLots[lotId] = { name: `Zone ${zone}` };

    for (let i = 0; i < DEMO_SPACES_PER_ZONE; i++) {
      const id = `${lotId}-space-${i + 1}`;
      demoUnits[id] = {
        lot: lotId,
        online: true,
        occupied: Math.random() < [0.55, 0.22, 0.75, 0.9][zoneIndex]
      };
    }
  });
}

function getStatus(unit) {
  if (!unit) return "unknown";
  if (unit.online !== true) return "offline";
  if (unit.occupied === true) return "occupied";
  if (unit.occupied === false) return "available";
  return "unknown";
}

function buildZones(lots, units) {
  // Use the first four actual Firebase lots.
  // In demo mode, these correspond to Zones A-D.
  const lotEntries = entries(lots).slice(0, 4);

  // Include lots referenced by units even if missing from lots/.
  for (const [, unit] of entries(units)) {
    const id = String(unit.lot ?? "");
    if (id && !lotEntries.some(([key]) => key === id)
        && lotEntries.length < 4) {
      lotEntries.push([id, { name: id }]);
    }
  }

  return lotEntries.map(([id, lot], index) => {
    const stalls = entries(units)
      .filter(([, unit]) => String(unit.lot ?? "") === id)
      .map(([sensorId, unit]) => ({
        sensorId,
        state: getStatus(unit)
      }));

    const counts = {
      available: stalls.filter(s => s.state === "available").length,
      occupied: stalls.filter(s => s.state === "occupied").length,
      offline: stalls.filter(s => s.state === "offline").length,
      unknown: stalls.filter(s => s.state === "unknown").length
    };

    return {
      id,
      label: ZONES[index],
      name: String(lot?.name || `Zone ${ZONES[index]}`),
      stalls,
      counts
    };
  });
}

function getRecommended(zones, lots, units) {
  // Reuse the existing scoring algorithm from scoring.js.
  // It ranks lots using confirmed sensor availability.
  try {
    const ranked = rankLots(lots, units);
    if (Array.isArray(ranked)) {
      const winner = ranked.find(item =>
        item.counts?.available > 0 &&
        zones.some(zone => zone.id === item.id)
      );
      if (winner) return zones.find(z => z.id === winner.id);
    }
  } catch (error) {
    console.warn("Recommendation scoring:", error);
  }

  // Safety fallback: only recommend confirmed available spaces.
  return [...zones]
    .filter(z => z.counts.available > 0)
    .sort((a, b) =>
      b.counts.available - a.counts.available
    )[0] || null;
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text);
  return el;
}

function drawSpace(container, space, label) {
  const cell = element("div", "space");
  const dot = element("span", `dot ${space.state}`);
  cell.append(dot);
  cell.title = `${label}: ${space.state.toUpperCase()}`;
  container.append(cell);
}

function drawZone(container, zone, recommended) {
  const panel = element(
    "div",
    `zone ${recommended?.id === zone.id ? "recommended" : ""}`
  );

  const heading = element("div", "zone-heading");
  heading.append(
    element("strong", "", `ZONE ${zone.label}`),
    element(
      "span",
      "",
      `${zone.counts.available} confirmed open`
    )
  );
  panel.append(heading);

  const grid = element("div", "spaces");

  // Demo has 24 simulated sensors per zone.
  // Live mode shows real sensor states only.
  const spaces = zone.stalls.slice(0, 48);

  spaces.forEach((space, i) => {
    drawSpace(grid, space, space.sensorId);
  });

  // Empty positions are UNKNOWN, never falsely green.
  const minimumCells = mode === "demo" ? 24 : 12;
  for (let i = spaces.length; i < minimumCells; i++) {
    const placeholder = element("div", "space placeholder");
    placeholder.append(element("span", "dot unknown"));
    placeholder.title = "No sensor assigned";
    grid.append(placeholder);
  }

  panel.append(grid);
  container.append(panel);
}

function draw() {
  const lots = mode === "demo" ? demoLots : liveLots;
  const units = mode === "demo" ? demoUnits : liveUnits;

  const zones = buildZones(lots, units);
  const recommended = getRecommended(zones, lots, units);

  const map = $("parkingMap");
  const list = $("zoneList");
  map.replaceChildren();
  list.replaceChildren();

  if (!zones.length) {
    $("bestZone").textContent = "NO DATA";
    $("bestCount").textContent = "No parking lots available";
    $("totals").textContent = "No sensor data to display.";
    $("details").textContent = errorMessage ||
      "Waiting for Firebase lots and units.";
    return;
  }

  // Render zones in a 2x2 overhead parking layout.
  zones.forEach((zone, index) => {
    if (index === 2) {
      const road = element(
        "div", "road",
        "↑  MAIN DRIVING LANE  ↑"
      );
      map.append(road);
    }
    drawZone(map, zone, recommended);
  });

  for (const zone of zones) {
    const row = element(
      "div",
      `zone-row ${recommended?.id === zone.id ? "selected" : ""}`
    );

    const title = element("div");
    title.append(
      element("div", "", `ZONE ${zone.label}`),
      element("small", "", zone.name)
    );

    const number = element(
      "span",
      "number",
      `${zone.counts.available} / ${zone.stalls.length}`
    );

    row.append(title, number);
    list.append(row);
  }

  if (recommended) {
    $("bestZone").textContent = `ZONE ${recommended.label}`;
    $("bestCount").textContent =
      `${recommended.counts.available} confirmed spaces available`;
    $("direction").textContent = "➜";
  } else {
    $("bestZone").textContent = "NO OPEN LOT";
    $("bestCount").textContent =
      "No confirmed available spaces";
    $("direction").textContent = "—";
  }

  const total = zones.reduce((acc, zone) => {
    for (const key of Object.keys(acc)) {
      acc[key] += zone.counts[key];
    }
    return acc;
  }, { available: 0, occupied: 0, offline: 0, unknown: 0 });

  $("totals").textContent =
    `${total.available} Available  |  ` +
    `${total.occupied} Occupied  |  ` +
    `${total.offline} Offline  |  ` +
    `${total.unknown} Unknown`;

  $("modeLabel").textContent =
    mode === "demo" ? "SIMULATED PARKING DATA" : "FIREBASE LIVE DATA";

  $("details").textContent =
    mode === "demo"
      ? "DEMO MODE: All displayed sensor readings are simulated. No Firebase writes."
      : errorMessage ||
        "LIVE MODE: Read-only Firebase data. Gray indicates offline; yellow indicates unknown or unassigned spaces.";

  $("change").disabled = mode !== "demo";
  $("reset").disabled = mode !== "demo";
}

function startDemo() {
  mode = "demo";
  errorMessage = "";
  makeDemo();
  $("demo").textContent = "Switch to Live Mode";
  $("connection").textContent = "● DEMO MODE";
  draw();
}

function startLive() {
  mode = "live";
  $("demo").textContent = "Switch to Demo Mode";
  $("connection").textContent =
    errorMessage ? "● FIREBASE ERROR" : "● LIVE FIREBASE";
  draw();
}

$("demo").addEventListener("click", () => {
  if (mode === "live") startDemo();
  else startLive();
});

$("change").addEventListener("click", () => {
  if (mode !== "demo") return;
  const keys = Object.keys(demoUnits);
  const key = keys[Math.floor(Math.random() * keys.length)];
  if (!key) return;

  const unit = demoUnits[key];
  unit.occupied = !unit.occupied;
  draw();
});

$("reset").addEventListener("click", () => {
  if (mode === "demo") {
    makeDemo();
    draw();
  }
});

async function connectFirebase() {
  try {
    const { initializeApp } = await import(
      "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"
    );
    const { getDatabase, ref, onValue } = await import(
      "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js"
    );

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    unsubscribe.push(
      onValue(
        ref(db, "lots"),
        snapshot => {
          liveLots = snapshot.val() || {};
          errorMessage = "";
          if (mode === "live") {
            $("connection").textContent = "● LIVE FIREBASE";
            draw();
          }
        },
        error => firebaseError(error)
      )
    );

    unsubscribe.push(
      onValue(
        ref(db, "units"),
        snapshot => {
          liveUnits = snapshot.val() || {};
          errorMessage = "";
          if (mode === "live") {
            $("connection").textContent = "● LIVE FIREBASE";
            draw();
          }
        },
        error => firebaseError(error)
      )
    );
  } catch (error) {
    firebaseError(error);
  }
}

function firebaseError(error) {
  errorMessage = `Firebase error: ${error.message || error}`;
  if (mode === "live") {
    $("connection").textContent = "● FIREBASE ERROR";
    draw();
  }
}

draw();
connectFirebase();

