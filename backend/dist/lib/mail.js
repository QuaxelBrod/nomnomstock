"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
exports.renderTemplate = renderTemplate;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
async function sendMail(opts) {
    console.log('[mail] send requested', { to: opts.to, subject: opts.subject });
    if (process.env.EMAIL_AUTH_ENABLED === 'false') {
        console.log('[mail] EMAIL_AUTH_ENABLED=false, skipping send', opts);
        return { ok: true };
    }
    if (!host || !user) {
        console.error('[mail] SMTP not configured', { host: !!host, user: !!user, port });
        throw new Error('SMTP not configured');
    }
    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    }
    catch (e) {
        throw new Error('nodemailer not installed. Run `npm install nodemailer`');
    }
    console.log('[mail] creating transporter', { host, port, user });
    const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } });
    const info = await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
    console.log('[mail] send success', { to: opts.to, messageId: info?.messageId });
    return info;
}
function renderTemplate(template, vars) {
    let out = template;
    for (const k of Object.keys(vars)) {
        out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), vars[k]);
    }
    return out;
}
