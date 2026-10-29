import { applyTheme, normalizeTheme } from "../themes";
import { CONSOLE_THEME_KEY } from "./constants";

// This browser's console theme. Lime when nothing is stored or storage is blocked.
export function readConsoleTheme() {
  try { return normalizeTheme(localStorage.getItem(CONSOLE_THEME_KEY)); } catch { return normalizeTheme(null); }
}

// Applies a theme (with the short fade) and remembers it here. Returns false if the
// browser wouldn't store it: the theme still applies until the page is reloaded.
export const setConsoleTheme = (id) => applyTheme(id, CONSOLE_THEME_KEY);
