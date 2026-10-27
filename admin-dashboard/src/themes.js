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
