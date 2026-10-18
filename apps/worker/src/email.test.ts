import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WeftEmailTemplates } from './email-templates'
import { LogMailer, SmtpMailer } from './mailer'

const templates = new WeftEmailTemplates()
const comment = {
  kind: 'comment' as const,
  recipientName: 'Ana',
  authorName: 'Beto <script>',
  videoTitle: 'Q4 "plan"',
  commentText: 'Nice & clear\n<b>really</b>',
  url: 'https://weft.example/v/abc?t=3&x=1',
}

describe('email templates', () => {
  it('writes comment emails in English and Spanish, escaping user content in HTML', () => {
    const en = templates.render(comment, 'en')
    expect(en.subject).toBe('Beto <script> commented on “Q4 "plan"”')
    expect(en.text).toContain('Nice & clear\n<b>really</b>')
    expect(en.text).toContain('Open the video: https://weft.example/v/abc?t=3&x=1')
    expect(en.html).toContain('Beto &lt;script&gt;')
    expect(en.html).toContain('Nice &amp; clear\n&lt;b&gt;really&lt;/b&gt;')
    expect(en.html).toContain('href="https://weft.example/v/abc?t=3&amp;x=1"')
    expect(en.html).not.toContain('<script>')

    const es = templates.render({ ...comment, kind: 'reply' }, 'es')
    expect(es.subject).toBe('Beto <script> respondió tu comentario en «Q4 "plan"»')
    expect(es.text).toContain('Abrir la conversación')
  })

  it('writes "they watched your video" emails', () => {
    const view = {
      kind: 'view' as const,
      recipientName: 'Ana',
      viewerName: 'Beto',
      videoTitle: 'Demo',
      url: 'https://w/v/a',
    }
    expect(templates.render(view, 'es').subject).toBe('Beto vio «Demo»')
    expect(templates.render(view, 'en').text).toContain(
      'See the video and its stats: https://w/v/a',
    )
  })

  it('writes invitations with the role and expiry', () => {
    const invitation = {
      kind: 'invitation' as const,
      inviterName: '',
      workspaceName: 'Acme',
      role: 'viewer',
      url: 'https://weft.example/invite/tok',
      expiresAt: new Date('2026-10-24T10:00:00Z'),
    }
    const es = templates.render(invitation, 'es')
    expect(es.subject).toBe('Alguien te invitó a Acme en Weft')
    expect(es.text).toContain('como lector')
    expect(es.text).toContain('24 de octubre de 2026')
    expect(
      templates.render({ ...invitation, inviterName: 'Ana', role: 'admin' }, 'en').text,
    ).toContain('Ana invited you to join Acme as an admin.')
  })
})

describe('mailers', () => {
  let mailpit: StartedTestContainer

  beforeAll(async () => {
    mailpit = await new GenericContainer('axllent/mailpit:v1.31')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forListeningPorts())
      .start()
  })

  afterAll(async () => {
    await mailpit?.stop()
  })

  it('delivers over SMTP', async () => {
    const host = mailpit.getHost()
    const mailer = new SmtpMailer(
      `smtp://${host}:${mailpit.getMappedPort(1025)}`,
      'Weft <weft@example.com>',
    )
    await mailer.send({ to: 'ana@example.com', ...templates.render(comment, 'en') })
    const api = `http://${host}:${mailpit.getMappedPort(8025)}/api/v1/messages`
    const { messages } = (await (await fetch(api)).json()) as {
      messages: { Subject: string; From: { Address: string }; To: { Address: string }[] }[]
    }
    expect(messages[0]).toMatchObject({
      Subject: 'Beto <script> commented on “Q4 "plan"”',
      From: { Address: 'weft@example.com' },
      To: [{ Address: 'ana@example.com' }],
    })
  })

  it('logs instead of sending without SMTP', async () => {
    const log = vi.fn()
    await new LogMailer(log).send({ to: 'a@b.co', subject: 'Hi', text: '', html: '' })
    expect(log).toHaveBeenCalledWith('email not sent (SMTP_URL is not set)', {
      to: 'a@b.co',
      subject: 'Hi',
    })
  })
})
