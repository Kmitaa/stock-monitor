/**
 * Verification emails via Resend (https://resend.com).
 * Without RESEND_API_KEY the link only appears in logs / devVerificationUrl in API responses.
 */

// Default Resend sandbox sender; recipient rules still apply.
export const DEFAULT_EMAIL_FROM = 'Market Monitor AI <onboarding@resend.dev>';

function appBaseUrl(): string {
  const u = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL;
  if (u && u.startsWith('http')) return u.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function verificationEmailBody(verifyUrl: string): { html: string; text: string } {
  const safeUrl = escapeHtml(verifyUrl);
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#141414;border:1px solid #262626;border-radius:12px;padding:28px;">
    <tr><td>
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#737373;">Market Monitor AI</p>
      <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#fafafa;">Confirm your email</h1>
      <p style="margin:0 0 20px;line-height:1.5;color:#a3a3a3;font-size:14px;">Use the button below to activate your account. The link expires in <strong>24 hours</strong>.</p>
      <a href="${safeUrl}" style="display:inline-block;background:#fafafa;color:#0a0a0a;text-decoration:none;font-weight:600;font-size:13px;padding:12px 20px;border-radius:9999px;">Confirm email</a>
      <p style="margin:24px 0 0;font-size:11px;color:#525252;word-break:break-all;">If the button fails, paste this URL into your browser:<br/>${safeUrl}</p>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Market Monitor AI — email confirmation\n\nOpen this link (valid 24h):\n${verifyUrl}\n`;
  return { html, text };
}

// Unverified Resend domain: can only hit your account email, else 403.
function isResendTestRecipientRestriction(status: number, body: string): boolean {
  return (
    status === 403 &&
    (body.includes('only send testing emails') || body.includes('verify a domain'))
  );
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;

  if (key) {
    const { html, text } = verificationEmailBody(verifyUrl);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: 'Confirm your email — Market Monitor AI',
        html,
        text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[email] Resend error:', res.status, errText);

      if (isResendTestRecipientRestriction(res.status, errText) && process.env.NODE_ENV === 'development') {
        console.warn(
          '[email] Resend test mode: only the account email. Returning link in API response (dev).'
        );
        return { sent: false };
      }

      if (isResendTestRecipientRestriction(res.status, errText)) {
        throw new Error(
          'Resend (no verified domain) only sends to your Resend account email. Use that email at signup, or add a domain at resend.com/domains and set EMAIL_FROM.'
        );
      }

      throw new Error('Failed to send email (Resend).');
    }
    return { sent: true };
  }

  console.log(`[email] (no RESEND_API_KEY) verification link for ${to}:\n${verifyUrl}`);
  return { sent: false };
}

export { appBaseUrl };
