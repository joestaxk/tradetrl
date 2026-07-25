/**
 * How's it going? (feedback)
 *
 * Deliberately never called a survey, a rating, or an NPS score anywhere the
 * user can see. It is one question, four faces, and an optional sentence —
 * because the moment something announces itself as a survey, people either
 * close it or answer it dishonestly.
 *
 * Rules this encodes:
 *  - asked once, and never again after they answer;
 *  - dismissable, and a dismissal is respected for a long time;
 *  - never shown to someone who has barely used the app — there is nothing
 *    to have an opinion about yet;
 *  - a permanent, always-available way to send more thoughts afterwards, so
 *    answering once doesn't mean being shut out.
 */

export type Mood = 'love' | 'good' | 'meh' | 'bad'

export interface MoodOption {
  value: Mood
  /** Rendered as SVG, never an emoji glyph — §12 forbids emoji as icons. */
  label: string
  /** What we say back once they pick it. Warm, never salesy. */
  reply: string
}

export const MOODS: MoodOption[] = [
  { value: 'love', label: 'Love it', reply: 'That means a lot. Thank you.' },
  { value: 'good', label: "It's good", reply: 'Good to hear — thank you.' },
  { value: 'meh', label: "It's okay", reply: "Fair enough. Thanks for being honest." },
  { value: 'bad', label: 'Not for me', reply: 'Thanks for saying so — that helps most of all.' },
]

export interface FeedbackState {
  /** Set once they answer. Never ask again after this. */
  submittedAt?: number
  /** Set when they close it without answering. */
  dismissedAt?: number
  mood?: Mood
}

export const FEEDBACK_MIN_TRADES = 8
export const FEEDBACK_MIN_DAYS = 3
/** A dismissal buys ~7 weeks of silence, not a permanent block. */
export const FEEDBACK_SNOOZE_MS = 50 * 24 * 60 * 60 * 1000

export interface AskInput {
  state: FeedbackState | undefined
  tradeCount: number
  /** Distinct days on which they logged something. */
  activeDays: number
  now?: number
}

/**
 * Should we ask? Conservative on purpose — the cost of asking too early is a
 * user who dismisses forever, and the cost of never asking is one fewer
 * data point.
 */
export function shouldAsk({
  state,
  tradeCount,
  activeDays,
  now = Date.now(),
}: AskInput): boolean {
  // Answered already. Never again, regardless of anything else.
  if (state?.submittedAt) return false

  if (state?.dismissedAt && now - state.dismissedAt < FEEDBACK_SNOOZE_MS) return false

  // Not enough use to have a real opinion yet.
  if (tradeCount < FEEDBACK_MIN_TRADES) return false
  if (activeDays < FEEDBACK_MIN_DAYS) return false

  return true
}

export function replyFor(mood: Mood): string {
  return MOODS.find((m) => m.value === mood)?.reply ?? 'Thank you.'
}

/** Trims and caps a free-text note so one paste can't blow up a document. */
export const MAX_NOTE = 2000

export function normalizeNote(note: string): string | undefined {
  const trimmed = note.trim().slice(0, MAX_NOTE)
  return trimmed.length > 0 ? trimmed : undefined
}
