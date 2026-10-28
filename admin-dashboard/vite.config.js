import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Writes build-info.json next to index.html so scripts/check-build.mjs can
// tell a real, demo or console build apart before anything is deployed.
function buildInfo(mode, env) {
  return {
    name: 'build-info',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify({
          mode,
          app: isConsole(env) ? 'console' : 'dashboard',
          demo: env.VITE_DEMO_MODE === 'true',
          dataRoot: env.VITE_DATA_ROOT || '',
          builtAt: new Date().toISOString(),
        }, null, 2),
      })
    },
  }
}

const isConsole = (env) => env.VITE_APP_MODE === 'console'

// The company console (VITE_APP_MODE=console, see .env.console) is a second app
// from the same index.html: it loads src/console/main.jsx instead of src/main.jsx,
// so neither bundle contains the other's code.
function consoleEntry(env) {
  return {
    name: 'console-entry',
    // "pre": swap the entry before Vite reads which script index.html loads.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!isConsole(env)) return html
        if (!html.includes('/src/main.jsx')) throw new Error('index.html no longer loads /src/main.jsx; update console-entry in vite.config.js.')
        return html
          .replace('/src/main.jsx', '/src/console/main.jsx')
          .replace(/<title>[^<]*<\/title>/, '<title>Smart Wheel Stop · Company console</title>')
      },
    },
  }
}

const outDir = (mode, env) => (isConsole(env) ? 'dist-console' : mode === 'demo' ? 'dist-demo' : 'dist')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), buildInfo(mode, env), consoleEntry(env)],
    // Demo and console builds never share a folder with the real site's build.
    build: { outDir: outDir(mode, env), emptyOutDir: true },
  }
})
