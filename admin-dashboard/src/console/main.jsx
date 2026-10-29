import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../themes.css'
import '../index.css'
import './console.css'
import { syncThemeColor } from '../themes.js'
import { CONSOLE_MARKER } from './constants.js'
import { readConsoleTheme } from './theme.js'
import ConsoleApp from './ConsoleApp.jsx'

// Company console entry (npm run dev:console / build:console). vite.config.js
// swaps this in for src/main.jsx, so none of the customer dashboard is bundled.
// The pre-paint script vite.config.js puts in index.html has already set this
// browser's theme (Lime if none); this repeats it in case that script was blocked.
document.documentElement.setAttribute('data-theme', readConsoleTheme())
syncThemeColor()
document.documentElement.dataset.app = CONSOLE_MARKER

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConsoleApp />
  </StrictMode>,
)
