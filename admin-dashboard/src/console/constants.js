// Set on <html data-app> by the console. scripts/check-build.mjs looks for this
// string to tell a console bundle from a customer one; keep them in step.
export const CONSOLE_MARKER = "sws-company-console";

// Subtitle under the wordmark on the console's sign-in page and sidebar.
export const CONSOLE_SUB = "COMPANY CONSOLE";

// Each person's console theme, kept in this browser only (never in the database).
// vite.config.js writes the same key into the console's pre-paint script.
export const CONSOLE_THEME_KEY = "sws-console-theme";
