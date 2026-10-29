// Site themes. The palettes live in src/themes.css as [data-theme="<id>"] blocks;
// scripts/check-contrast.mjs checks every one. Stored at config/site/theme.
export const THEMES = [
  { id: "lime", label: "Lime", desc: "The default: near-black with a lime accent." },
  { id: "paper", label: "Paper", desc: "Light, with dark text and a deep green accent." },
  { id: "midnight", label: "Midnight", desc: "Blue-black with an electric blue accent." },
  { id: "ember", label: "Ember", desc: "Warm dark with an orange accent." },
  { id: "mint", label: "Mint", desc: "Dark with a teal accent." },
  { id: "violet", label: "Violet", desc: "Dark with a violet accent." },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "lime";

// Unknown or missing values fall back to the default.
export const normalizeTheme = (value) => (THEME_IDS.includes(value) ? value : DEFAULT_THEME);

// The last theme shown, so index.html can set it before first paint (no flash).
// Keep the key in step with the inline script there.
export const THEME_CACHE_KEY = "sws-theme";
const FADE_MS = 400;
let fadeTimer = null;

// Sets data-theme on <html> for the staff dashboard (the company console passes its
// own cacheKey). Switching from one theme to another gives #root a short opacity
// fade (none with reduced motion, see index.css). Returns false if the browser
// wouldn't store the choice.
export function applyTheme(id, cacheKey = THEME_CACHE_KEY) {
  const root = document.documentElement;
  const next = normalizeTheme(id);
  let stored = true;
  try { localStorage.setItem(cacheKey, next); } catch { stored = false; /* private window: the next load just isn't pre-themed */ }
  if (root.getAttribute("data-theme") === next) return stored;
  const switching = root.hasAttribute("data-theme");
  root.setAttribute("data-theme", next);
  syncThemeColor();
  if (!switching) return stored;
  root.classList.remove("sws-theme-fade");
  void root.offsetWidth; // restart the animation if themes change in quick succession
  root.classList.add("sws-theme-fade");
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove("sws-theme-fade"), FADE_MS);
  return stored;
}

// Public pages (landing, sign-in, the lot sign) always use the default look.
export function clearTheme() {
  document.documentElement.removeAttribute("data-theme");
  syncThemeColor();
}

// The browser chrome colour on phones follows the page background.
export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (meta && bg) meta.setAttribute("content", bg);
}
