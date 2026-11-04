import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

let testOutbox = [];

export function isEmailConfigured() {
  return Boolean(config.email.host && config.email.defaultFromEmail);
}

export function getTestOutbox() {
  return testOutbox;
}

export function clearTestOutbox() {
  testOutbox = [];
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  if (process.env.NODE_ENV === 'test' && !config.email.host) {
    testOutbox.push({ to, resetUrl });
    return true;
  }

  if (!isEmailConfigured()) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.useSsl,
    auth: config.email.user
      ? {
          user: config.email.user,
          pass: config.email.password,
        }
      : undefined,
  });

  const message = {
    from: config.email.defaultFromEmail,
    to,
    subject: 'Redefinição de senha — HUB TEENS EM AÇÃO',
    text:
      'Recebemos uma solicitação para redefinir a senha da sua conta.\n\n' +
      `Use este link para escolher uma nova senha: ${resetUrl}\n\n` +
      'Se você não solicitou a redefinição, ignore esta mensagem.',
  };

  await transporter.sendMail(message);
  return true;
}

