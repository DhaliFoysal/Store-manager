import { env, isProd } from './env.js';

export async function sendMail({ to, subject, text }) {
  if (!env.SMTP_HOST) {
    if (isProd) console.warn(`[mail] SMTP not configured; e-mail "${subject}" to ${to} was not sent`);
    else console.log(`\n[mail:dev] to=${to}\nsubject=${subject}\n${text}\n`);
    return;
  }
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}
