import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { RouterError } from './components/app/router-error'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    /*
      Without this a route that throws renders nothing at all — a white screen,
      which to someone who just logged a trade looks exactly like losing it.
      The component also recognises a stale build and reloads onto the current
      one rather than showing an error nobody can act on.
    */
    defaultErrorComponent: ({ error }) => <RouterError error={error} />,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
