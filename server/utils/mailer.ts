/**
 * Utilitaire d'envoi d'emails
 * Configuration via variables d'environnement
 */

import * as nodemailer from 'nodemailer';

/**
 * Échappe les caractères HTML dangereux pour prévenir l'injection HTML dans les emails
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Configuration SMTP depuis les variables d'environnement
const smtpConfig = {
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASSWORD || '',
  },
};

const fromEmail = process.env.SMTP_FROM || 'noreply@localhost';
const appName = process.env.APP_NAME || 'Poker Planning';
const appUrl = process.env.APP_URL || 'http://localhost:3000';

// Vérifier si SMTP est configuré
const isSmtpConfigured = !!process.env.SMTP_HOST && !!process.env.SMTP_USER;

const transporter = isSmtpConfigured
  ? nodemailer.createTransport(smtpConfig)
  : null;

/**
 * Envoie un email de réinitialisation de mot de passe
 */
export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetCode: string
): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    console.warn('SMTP not configured - password reset email not sent');
    // Ne jamais logger le code de reset en production
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Reset code for ${to.substring(0, 3)}***: ${resetCode.substring(0, 4)}...`);
    }
    return { success: false, error: 'Service email non configuré' };
  }

  try {
    await transporter.sendMail({
      from: `"${appName}" <${fromEmail}>`,
      to,
      subject: `Réinitialisation de votre mot de passe - ${appName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a7a3d;">${appName}</h2>
          <p>Bonjour ${escapeHtml(userName)},</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
          <p>Voici votre code de vérification :</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1a7a3d;">${resetCode}</span>
          </div>
          <p>Ce code expire dans <strong>1 heure</strong>.</p>
          <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            Cet email a été envoyé automatiquement depuis <a href="${appUrl}">${appName}</a>.
          </p>
        </div>
      `,
      text: `
Bonjour ${userName},

Vous avez demandé la réinitialisation de votre mot de passe sur ${appName}.

Votre code de vérification : ${resetCode}

Ce code expire dans 1 heure.

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.

${appUrl}
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: 'Erreur lors de l\'envoi de l\'email' };
  }
}
