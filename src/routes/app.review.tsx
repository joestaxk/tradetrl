import { createFileRoute } from '@tanstack/react-router'
import { ReviewPage } from '#/components/review/review-page'

export const Route = createFileRoute('/app/review')({
  component: ReviewPage,
})
