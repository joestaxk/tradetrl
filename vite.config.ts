import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The scaffold's `devtools()` plugin is deliberately not here. It bridges the
 * SSR console into the client console and back again, which turns a single
 * repeated React warning into an unbounded feedback loop — during development
 * it wrote a 3.5GB log and filled the tmpfs, taking the dev server with it.
 * The TanStack Router devtools panel is unaffected by its removal.
 */
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})

export default config
