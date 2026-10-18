import type { EmailLocale, EmailTemplates, NotificationContent } from '@weft/core'

/** Escapes text for HTML: names, titles and comments come from users. */
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const ROLES: Record<EmailLocale, Record<string, string>> = {
  en: { admin: 'an admin', member: 'a member', viewer: 'a viewer' },
  es: { admin: 'administrador', member: 'miembro', viewer: 'lector' },
}

const copy = {
  en: {
    comment: (c: CommentContent) => ({
      subject: `${c.authorName} commented on “${c.videoTitle}”`,
      intro: `${c.authorName} commented on your video “${c.videoTitle}”:`,
      action: 'Open the video',
    }),
    reply: (c: CommentContent) => ({
      subject: `${c.authorName} replied to your comment on “${c.videoTitle}”`,
      intro: `${c.authorName} replied to your comment on “${c.videoTitle}”:`,
      action: 'Open the conversation',
    }),
    view: (c: ViewContent) => ({
      subject: `${c.viewerName} watched “${c.videoTitle}”`,
      intro: `${c.viewerName} is watching your video “${c.videoTitle}”. See how far people get in its stats.`,
      action: 'See the video and its stats',
    }),
    invitation: (c: InvitationContent) => ({
      subject: `${c.inviterName || 'Someone'} invited you to ${c.workspaceName} on Weft`,
      intro: `${c.inviterName || 'Someone'} invited you to join ${c.workspaceName} as ${ROLES.en[c.role] ?? c.role}.`,
      action: 'Accept the invitation',
      expires: (date: string) => `The link works until ${date}, only for this email address.`,
    }),
    footer: 'You get this email because of your account on Weft.',
  },
  es: {
    comment: (c: CommentContent) => ({
      subject: `${c.authorName} comentó «${c.videoTitle}»`,
      intro: `${c.authorName} comentó tu video «${c.videoTitle}»:`,
      action: 'Abrir el video',
    }),
    reply: (c: CommentContent) => ({
      subject: `${c.authorName} respondió tu comentario en «${c.videoTitle}»`,
      intro: `${c.authorName} respondió tu comentario en «${c.videoTitle}»:`,
      action: 'Abrir la conversación',
    }),
    view: (c: ViewContent) => ({
      subject: `${c.viewerName} vio «${c.videoTitle}»`,
      intro: `${c.viewerName} está viendo tu video «${c.videoTitle}». Mira hasta dónde llega la gente en sus estadísticas.`,
      action: 'Ver el video y sus estadísticas',
    }),
    invitation: (c: InvitationContent) => ({
      subject: `${c.inviterName || 'Alguien'} te invitó a ${c.workspaceName} en Weft`,
      intro: `${c.inviterName || 'Alguien'} te invitó a unirte a ${c.workspaceName} como ${ROLES.es[c.role] ?? c.role}.`,
      action: 'Aceptar la invitación',
      expires: (date: string) =>
        `El enlace funciona hasta el ${date}, solo para esta dirección de email.`,
    }),
    footer: 'Recibes este email por tu cuenta en Weft.',
  },
} as const

type CommentContent = Extract<NotificationContent, { kind: 'comment' | 'reply' }>
type InvitationContent = Extract<NotificationContent, { kind: 'invitation' }>
type ViewContent = Extract<NotificationContent, { kind: 'view' }>

const ACCENT = '#d4237a'

function layout(parts: {
  intro: string
  quote?: string
  action: string
  url: string
  note?: string
  footer: string
}) {
  const quote = parts.quote
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${ACCENT};background:#f6f4f7;white-space:pre-wrap">${escapeHtml(parts.quote)}</blockquote>`
    : ''
  const note = parts.note
    ? `<p style="color:#6b6470;font-size:13px">${escapeHtml(parts.note)}</p>`
    : ''
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#faf9fb;font-family:system-ui,sans-serif;color:#1f1b22">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e3ea;border-radius:16px;padding:28px">
<p style="margin:0 0 4px;font-weight:600;color:${ACCENT}">weft</p>
<p style="font-size:16px;line-height:1.5">${escapeHtml(parts.intro)}</p>${quote}
<p style="margin:24px 0"><a href="${escapeHtml(parts.url)}" style="display:inline-block;background:#1f1b22;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${escapeHtml(parts.action)}</a></p>${note}
</div>
<p style="max-width:520px;margin:16px auto 0;color:#8a838e;font-size:12px">${escapeHtml(parts.footer)}</p>
</body></html>`
}

/** Bilingual notification emails (plain text and simple, escaped HTML). */
export class WeftEmailTemplates implements EmailTemplates {
  render(content: NotificationContent, locale: EmailLocale) {
    const t = copy[locale]
    if (content.kind === 'invitation') {
      const words = t.invitation(content)
      const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        content.expiresAt,
      )
      const note = words.expires(date)
      return {
        subject: words.subject,
        text: `${words.intro}\n\n${words.action}: ${content.url}\n\n${note}\n\n${t.footer}\n`,
        html: layout({
          intro: words.intro,
          action: words.action,
          url: content.url,
          note,
          footer: t.footer,
        }),
      }
    }
    if (content.kind === 'view') {
      const words = t.view(content)
      return {
        subject: words.subject,
        text: `${words.intro}\n\n${words.action}: ${content.url}\n\n${t.footer}\n`,
        html: layout({
          intro: words.intro,
          action: words.action,
          url: content.url,
          footer: t.footer,
        }),
      }
    }
    const words = content.kind === 'comment' ? t.comment(content) : t.reply(content)
    return {
      subject: words.subject,
      text: `${words.intro}\n\n${content.commentText}\n\n${words.action}: ${content.url}\n\n${t.footer}\n`,
      html: layout({
        intro: words.intro,
        quote: content.commentText,
        action: words.action,
        url: content.url,
        footer: t.footer,
      }),
    }
  }
}
