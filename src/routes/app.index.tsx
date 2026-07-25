import { createFileRoute } from '@tanstack/react-router'
import { JournalPage } from '#/components/app/journal-page'

export const Route = createFileRoute('/app/')({
  component: JournalPage,
})
