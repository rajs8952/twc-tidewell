import 'server-only'
import nodemailer from 'nodemailer'
import { Resend } from 'resend'

/*
 * Every email OmniWell sends goes through here: sign-up confirmations and
 * password resets (Supabase's Send Email Hook, app/api/auth/send-email) and
 * coach alerts (lib/coach-alerts.ts).
 *
 * Transport, from Vercel env vars:
 *   SMTP (Nodemailer)  SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS,
 *                      optional SMTP_FROM. Gmail: smtp.gmail.com, 465, the Gmail
 *                      address and a Google "app password". Gmail always sends
 *                      from the signed-in address.
 *   Resend (fallback)  RESEND_API_KEY and RESEND_FROM.
 */

export interface Email {
  to: string
  subject: string
  text: string
  html: string
}

/** SMTP when configured, else Resend, else null (email isn't set up). */
function transport(): { name: string; send: (m: Email) => Promise<void> } | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, RESEND_API_KEY, RESEND_FROM } = process.env
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 465
    // A short-lived connection per send: serverless functions don't keep sockets between requests.
    const smtp = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = TLS from the start; 587 upgrades with STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    const from = SMTP_FROM || `OmniWell <${SMTP_USER}>`
    return { name: 'smtp', send: async (m) => void (await smtp.sendMail({ from, ...m })) }
  }
  if (RESEND_API_KEY && RESEND_FROM) {
    const client = new Resend(RESEND_API_KEY)
    return {
      name: 'resend',
      send: async (m) => {
        const { error } = await client.emails.send({ from: RESEND_FROM, ...m })
        if (error) throw new Error(`${error.name}: ${error.message}`)
      },
    }
  }
  return null
}

export class EmailNotConfiguredError extends Error {}

/** Sends one email. Throws if email isn't configured or the server refuses it. */
export async function sendEmail(m: Email) {
  const t = transport()
  if (!t) throw new EmailNotConfiguredError('Email isn’t configured: set SMTP_HOST/SMTP_USER/SMTP_PASS (e.g. Gmail) or RESEND_API_KEY/RESEND_FROM.')
  try {
    await t.send(m)
  } catch (e) {
    throw new Error(`Email via ${t.name} failed: ${(e as Error).message}`)
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * A plain, branded email: a heading, a few short paragraphs, one button and
 * a footer. Returns matching HTML and text versions (text helps
 * deliverability and screen readers).
 */
export function layout({ heading, paragraphs, button, footer }: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#eef3f4;padding:24px 12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#17303a">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px">
  <div style="height:4px;border-radius:4px;background:linear-gradient(90deg,#2f7bd6,#7c6bd6,#e05a7a,#e9851f,#2a9d8f);margin-bottom:20px"></div>
  <p style="margin:0 0 4px;font-weight:800;font-size:15px">OmniWell</p>
  <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25">${escapeHtml(heading)}</h1>
  ${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${escapeHtml(p)}</p>`).join('\n  ')}
  ${button ? `<p style="margin:20px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#17303a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${escapeHtml(button.label)}</a></p>
  <p style="margin:0 0 12px;font-size:12px;color:#5b6b73;word-break:break-all">Or paste this link into your browser: ${escapeHtml(button.url)}</p>` : ''}
  <p style="margin:18px 0 0;font-size:12px;color:#5b6b73">${escapeHtml(footer)}</p>
</div></body></html>`
  const text = [heading, '', ...paragraphs, ...(button ? ['', `${button.label}: ${button.url}`] : []), '', footer].join('\n')
  return { html, text }
}
