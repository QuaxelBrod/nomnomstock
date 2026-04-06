const host = process.env.SMTP_HOST
const port = Number(process.env.SMTP_PORT || 587)
const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS
const from = process.env.EMAIL_FROM || process.env.SMTP_USER

export async function sendMail(opts: { to: string; subject: string; text?: string; html?: string }) {
  if (process.env.EMAIL_AUTH_ENABLED === 'false') {
    console.log('[mail] EMAIL_AUTH_ENABLED=false, skipping send', opts)
    return { ok: true }
  }
  if (!host || !user) throw new Error('SMTP not configured')
  let nodemailer: any
  try {
    nodemailer = require('nodemailer')
  } catch (e) {
    throw new Error('nodemailer not installed. Run `npm install nodemailer`')
  }
  const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } })
  const info = await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html })
  return info
}

export function renderTemplate(template: string, vars: Record<string, string>) {
  let out = template
  for (const k of Object.keys(vars)) {
    out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), vars[k])
  }
  return out
}
