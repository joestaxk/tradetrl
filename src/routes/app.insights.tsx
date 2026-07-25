import { createFileRoute } from '@tanstack/react-router'
import { InsightsPage } from '#/components/insights/insights-page'

export const Route = createFileRoute('/app/insights')({
  component: InsightsPage,
})
