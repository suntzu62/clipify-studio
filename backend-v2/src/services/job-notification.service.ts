import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { pool } from './database.service.js';
import { getUserSettings } from './user-settings.service.js';

const logger = createLogger('job-notification');

type Recipient = {
  email: string;
  fullName: string | null;
};

type CompletedPayload = {
  userId: string;
  jobId: string;
  clipCount: number;
  processingTimeMs: number;
};

type FailedPayload = {
  userId: string;
  jobId: string;
  errorMessage: string;
  processingTimeMs: number;
};

let transporter: Transporter | null = null;
let warnedMissingConfig = false;

function formatDuration(processingTimeMs: number): string {
  const totalSeconds = Math.max(0, Math.round(processingTimeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getTransporter(): Transporter | null {
  if (!env.notifications.emailEnabled) {
    return null;
  }

  if (!env.notifications.smtpHost || !env.notifications.smtpFrom) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      logger.warn(
        'Email notifications enabled but SMTP_HOST/SMTP_FROM is missing. Notifications will be skipped.'
      );
    }
    return null;
  }

  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.notifications.smtpHost,
    port: env.notifications.smtpPort,
    secure: env.notifications.smtpSecure,
    auth: env.notifications.smtpUser
      ? {
          user: env.notifications.smtpUser,
          pass: env.notifications.smtpPass,
        }
      : undefined,
  });

  return transporter;
}

async function getRecipient(userId: string): Promise<Recipient | null> {
  const result = await pool.query(
    'SELECT email, full_name FROM profiles WHERE id = $1 LIMIT 1',
    [userId]
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  const email = String(row.email || '').trim();

  if (!email) {
    return null;
  }

  return {
    email,
    fullName: typeof row.full_name === 'string' ? row.full_name : null,
  };
}

export async function sendJobCompletedEmail(payload: CompletedPayload): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  const settings = await getUserSettings(payload.userId);
  if (!settings.notifications.jobCompleteEmail) {
    return false;
  }

  const recipient = await getRecipient(payload.userId);
  if (!recipient) {
    logger.warn({ userId: payload.userId, jobId: payload.jobId }, 'No recipient email found');
    return false;
  }

  const duration = formatDuration(payload.processingTimeMs);
  const displayName = recipient.fullName || recipient.email;

  await mailer.sendMail({
    from: env.notifications.smtpFrom,
    to: recipient.email,
    subject: `Seu job ${payload.jobId} foi concluido`,
    text:
      `Olá ${displayName},\n\n` +
      `Seu processamento foi concluído com sucesso.\n` +
      `Job: ${payload.jobId}\n` +
      `Clipes gerados: ${payload.clipCount}\n` +
      `Tempo total: ${duration}\n\n` +
      `Você já pode acessar seus clipes no dashboard.\n`,
    html:
      `<p>Olá ${displayName},</p>` +
      `<p>Seu processamento foi concluído com sucesso.</p>` +
      `<ul>` +
      `<li><strong>Job:</strong> ${payload.jobId}</li>` +
      `<li><strong>Clipes gerados:</strong> ${payload.clipCount}</li>` +
      `<li><strong>Tempo total:</strong> ${duration}</li>` +
      `</ul>` +
      `<p>Você já pode acessar seus clipes no dashboard.</p>`,
  });

  logger.info(
    { userId: payload.userId, jobId: payload.jobId, to: recipient.email },
    'Job completion email sent'
  );

  return true;
}

export async function sendJobFailedEmail(payload: FailedPayload): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  const settings = await getUserSettings(payload.userId);
  if (!settings.notifications.jobFailedEmail) {
    return false;
  }

  const recipient = await getRecipient(payload.userId);
  if (!recipient) {
    logger.warn({ userId: payload.userId, jobId: payload.jobId }, 'No recipient email found');
    return false;
  }

  const duration = formatDuration(payload.processingTimeMs);
  const displayName = recipient.fullName || recipient.email;

  await mailer.sendMail({
    from: env.notifications.smtpFrom,
    to: recipient.email,
    subject: `Falha no processamento do job ${payload.jobId}`,
    text:
      `Olá ${displayName},\n\n` +
      `Seu processamento falhou.\n` +
      `Job: ${payload.jobId}\n` +
      `Tempo até a falha: ${duration}\n` +
      `Erro: ${payload.errorMessage}\n\n` +
      `Você pode tentar novamente com outro vídeo/configuração.\n`,
    html:
      `<p>Olá ${displayName},</p>` +
      `<p>Seu processamento falhou.</p>` +
      `<ul>` +
      `<li><strong>Job:</strong> ${payload.jobId}</li>` +
      `<li><strong>Tempo até a falha:</strong> ${duration}</li>` +
      `<li><strong>Erro:</strong> ${payload.errorMessage}</li>` +
      `</ul>` +
      `<p>Você pode tentar novamente com outro vídeo/configuração.</p>`,
  });

  logger.info(
    { userId: payload.userId, jobId: payload.jobId, to: recipient.email },
    'Job failure email sent'
  );

  return true;
}
