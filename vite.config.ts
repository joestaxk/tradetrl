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
/**
 * The Firebase auth handler, served from our own origin.
 *
 * Firebase's SDK completes a sign-in through a cross-origin iframe pointed at
 * `<project>.firebaseapp.com`. Browsers that block third-party storage —
 * Safari, and Chrome since it phased out third-party cookies — deny that
 * iframe access to its own storage, so `getRedirectResult` comes back empty
 * and the user is bounced to the sign-in screen having just authenticated.
 *
 * Firebase's documented fix is to stop it being cross-origin: proxy
 * `/__/auth/*` through our own domain and point `authDomain` at it. Then the
 * whole flow is same-origin and there is no third-party storage to block.
 *
 * Requires two matching settings, or sign-in fails closed:
 *   - `VITE_FIREBASE_AUTH_DOMAIN` set to the domain serving the app
 *   - `https://<that-domain>/__/auth/handler` added to the Google OAuth
 *     client's authorised redirect URIs
 */
const authProject = process.env.VITE_FIREBASE_PROJECT_ID ?? 'trad3journal'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitro({
      routeRules: {
        '/__/auth/**': {
          proxy: `https://${authProject}.firebaseapp.com/__/auth/**`,
        },
      },
    }),
    viteReact(),
  ],
})

export default config
