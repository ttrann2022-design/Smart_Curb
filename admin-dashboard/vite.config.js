import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Writes build-info.json next to index.html so scripts/check-build.mjs can
// tell a real build from a demo build before anything is deployed.
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
          demo: env.VITE_DEMO_MODE === 'true',
          dataRoot: env.VITE_DATA_ROOT || '',
          builtAt: new Date().toISOString(),
        }, null, 2),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), buildInfo(mode, env)],
    // Demo builds never share a folder with the real site's build.
    build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', emptyOutDir: true },
  }
})
