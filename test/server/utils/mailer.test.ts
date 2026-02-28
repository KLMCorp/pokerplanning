import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock nodemailer avant l'import du module
const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

describe('mailer', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSendMail.mockReset();
  });

  describe('sendPasswordResetEmail (sans SMTP configuré)', () => {
    it('devrait retourner une erreur si SMTP non configuré', async () => {
      // Sans SMTP_HOST ni SMTP_USER, le transporter est null
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;

      const { sendPasswordResetEmail } = await import('../../../server/utils/mailer');

      const result = await sendPasswordResetEmail('test@test.com', 'Test User', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service email non configuré');
    });
  });

  describe('sendPasswordResetEmail (avec SMTP configuré)', () => {
    it('devrait envoyer un email avec succès', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password';
      process.env.SMTP_FROM = 'noreply@test.com';
      process.env.APP_NAME = 'Test Poker';
      process.env.APP_URL = 'https://poker.test.com';

      mockSendMail.mockResolvedValueOnce({ messageId: 'test-id' });

      const { sendPasswordResetEmail } = await import('../../../server/utils/mailer');

      const result = await sendPasswordResetEmail('recipient@test.com', 'Alice', '654321');

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('recipient@test.com');
      expect(callArgs.subject).toContain('Réinitialisation');
      expect(callArgs.html).toContain('654321');
      expect(callArgs.html).toContain('Alice');
      expect(callArgs.text).toContain('654321');
    });

    it('devrait échapper le HTML dans le nom utilisateur', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';

      mockSendMail.mockResolvedValueOnce({ messageId: 'test-id-2' });

      const { sendPasswordResetEmail } = await import('../../../server/utils/mailer');

      await sendPasswordResetEmail('recipient@test.com', '<script>alert("xss")</script>', '123456');

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).not.toContain('<script>');
      expect(callArgs.html).toContain('&lt;script&gt;');
    });

    it('devrait gérer les erreurs d\'envoi', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';

      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      const { sendPasswordResetEmail } = await import('../../../server/utils/mailer');

      const result = await sendPasswordResetEmail('recipient@test.com', 'Bob', '111111');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur');
    });
  });
});
