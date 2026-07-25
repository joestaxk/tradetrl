import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '#/components/app/gate'

export const Route = createFileRoute('/app')({
  component: AppLayout,
})

function AppLayout() {
  return (
    <AuthGate>
      <Outlet />
    </AuthGate>
  )
}
