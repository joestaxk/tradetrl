/**
 * Telegram delivery for feedback.
 *
 * Chosen over email for support because it removes every blocker email had:
 * no domain to buy, no DNS records, no verification wait, no spam folder, and
 * a push notification on a phone rather than a message sitting unread.
 *
 * The one thing it cannot do is let the admin reply *through* the bot. A
 * Telegram bot may only message someone who has messaged it first, so an
 * unsolicited reply is impossible by design. That is why the message carries
 * whatever contact the sender left, and why the app points people at a direct
 * chat link when they want a conversation rather than a one-way note.
 */

export interface FeedbackMessage {
  mood?: string
  note?: string
  /** Who sent it, so a reply is possible at all. */
  name?: string | null
  email?: string | null
  /** Optional Telegram handle they gave us, which makes replying one tap. */
  telegram?: string | null
  /** Where in the app they were. */
  context?: string | null
  appVersion?: string
}

const MOOD_LABEL: Record<string, string> = {
  love: '😍 Loves it',
  good: '🙂 Likes it',
  meh: '😐 It’s okay',
  bad: '☹️ Not for them',
}

/**
 * Telegram's HTML mode only permits a handful of tags, and an unescaped `<`
 * anywhere in user text makes the whole API call fail with a parse error —
 * losing the feedback silently. Escaping is not optional.
 */
export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Telegram rejects messages over 4096 characters outright. */
export const TELEGRAM_MAX = 4096

export function buildFeedbackMessage(input: FeedbackMessage): string {
  const lines: string[] = []

  const heading = input.mood ? MOOD_LABEL[input.mood] ?? input.mood : 'New feedback'
  lines.push(`<b>${escapeTelegramHtml(heading)}</b>`)

  if (input.note) {
    lines.push('', escapeTelegramHtml(input.note))
  }

  const who: string[] = []
  if (input.name) who.push(escapeTelegramHtml(input.name))
  if (input.email) who.push(`<code>${escapeTelegramHtml(input.email)}</code>`)
  if (input.telegram) {
    const handle = input.telegram.startsWith('@') ? input.telegram : `@${input.telegram}`
    who.push(escapeTelegramHtml(handle))
  }
  if (who.length > 0) {
    lines.push('', `<i>from</i> ${who.join(' · ')}`)
  } else {
    // Say so explicitly — otherwise it looks like a bug rather than a choice.
    lines.push('', '<i>sent anonymously — no way to reply</i>')
  }

  if (input.context) {
    lines.push(`<i>on</i> ${escapeTelegramHtml(input.context)}`)
  }

  const message = lines.join('\n')
  // Truncate rather than let Telegram reject the whole thing.
  return message.length > TELEGRAM_MAX
    ? `${message.slice(0, TELEGRAM_MAX - 20)}\n<i>…truncated</i>`
    : message
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
}

export interface SendResult {
  ok: boolean
  error?: string
}

export async function sendTelegram(text: string): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    return { ok: false, error: 'Telegram is not configured' }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        // Feedback is rarely about a link, and previews would bury the note.
        disable_web_page_preview: true,
      }),
    })

    if (res.ok) return { ok: true }

    // Telegram returns a descriptive body; surfacing it turns "it didn't work"
    // into something fixable in one read.
    const body = await res.text().catch(() => '')
    return { ok: false, error: `Telegram responded ${res.status}: ${body.slice(0, 300)}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
