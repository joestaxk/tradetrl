import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Two deliberate choices here.
 *
 * 1. `nitro()` is required for any real deployment. Without it the build emits
 *    a plain `dist/client` + `dist/server` pair that Vercel has no idea how to
 *    serve, which shows up as a blank site. With it, Nitro detects the Vercel
 *    environment and writes `.output/` in the Build Output API format.
 *
 * 2. The scaffold's `devtools()` plugin is deliberately absent. It bridges the
 *    SSR console into the client console and back again, which turns a single
 *    repeated React warning into an unbounded feedback loop — during
 *    development it wrote a 3.5GB log and filled the tmpfs, taking the dev
 *    server with it. The TanStack Router devtools panel is unaffected.
 */
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
})

export default config
