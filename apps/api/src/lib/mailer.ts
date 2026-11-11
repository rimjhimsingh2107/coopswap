import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

let transport: Transporter | null = null;
if (env.SMTP_URL) transport = nodemailer.createTransport(env.SMTP_URL);

export async function sendMail(mail: Mail) {
  if (!transport) {
    // no smtp configured. print it so local dev still works
    logger.info({ subject: mail.subject, text: mail.text }, 'mail (not sent, no SMTP_URL)');
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...mail });
}
