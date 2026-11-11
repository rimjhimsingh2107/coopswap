import { env } from '../../config/env.js';
import { sendMail } from '../../lib/mailer.js';

const link = (path: string, token: string) => `${env.WEB_ORIGIN}${path}?token=${encodeURIComponent(token)}`;

export const sendVerifyEmail = (to: string, token: string) =>
  sendMail({
    to,
    subject: 'Confirm your CoopSwap email',
    text: `Hi! Confirm this address to finish setting up CoopSwap:\n\n${link('/verify-email', token)}\n\nThe link expires in 24 hours. If you didn't sign up, ignore this.`,
  });

export const sendUniversityEmail = (to: string, token: string) =>
  sendMail({
    to,
    subject: 'Confirm your university email on CoopSwap',
    text: `Someone (hopefully you) wants to link this university address to a CoopSwap account:\n\n${link('/verify-university', token)}\n\nIf that wasn't you, ignore this email.`,
  });

export const sendPasswordReset = (to: string, token: string) =>
  sendMail({
    to,
    subject: 'Reset your CoopSwap password',
    text: `Use this link to choose a new password:\n\n${link('/reset-password', token)}\n\nIt expires in 30 minutes. If you didn't ask for this you can ignore it.`,
  });
