import type { EmailMessage, Mailer } from '@weft/core'
import { createTransport, type Transporter } from 'nodemailer'

/** Sends email through an SMTP server, e.g. smtp://user:pass@smtp.example.com:587. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl)
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message })
  }
}

/** Used when no SMTP server is configured: emails are logged and dropped. */
export class LogMailer implements Mailer {
  constructor(private readonly log: (message: string, details: object) => void) {}

  async send(message: EmailMessage): Promise<void> {
    this.log('email not sent (SMTP_URL is not set)', { to: message.to, subject: message.subject })
  }
}
