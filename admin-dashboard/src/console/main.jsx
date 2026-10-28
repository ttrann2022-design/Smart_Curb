import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../themes.css'
import '../index.css'
import './console.css'
import { CONSOLE_MARKER } from './constants.js'
import ConsoleApp from './ConsoleApp.jsx'

// Company console entry (npm run dev:console / build:console). vite.config.js
// swaps this in for src/main.jsx, so none of the customer dashboard is bundled.
// Always the Lime theme: the console isn't a customer site.
document.documentElement.setAttribute('data-theme', 'lime')
document.documentElement.dataset.app = CONSOLE_MARKER

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConsoleApp />
  </StrictMode>,
)
