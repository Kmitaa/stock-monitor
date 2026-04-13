import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { appBaseUrl, sendVerificationEmail } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.emailVerified) {
    return NextResponse.json({ error: 'Account already exists — sign in.' }, { status: 409 });
  }

  if (existing && !existing.emailVerified) {
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  const verifyUrl = `${appBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  let sent = false;
  try {
    const r = await sendVerificationEmail(email, verifyUrl);
    sent = r.sent;
  } catch (e) {
    await prisma.user.delete({ where: { email } });
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    const msg = e instanceof Error ? e.message : 'Failed to send email.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const showDevLink =
    process.env.NODE_ENV === 'development' && !sent;

  return NextResponse.json({
    ok: true,
    message: sent
      ? 'Check your inbox and confirm your email (link valid 24h).'
      : 'Account created. In dev the verification link is below (or Resend did not send — see terminal).',
    devVerificationUrl: showDevLink ? verifyUrl : undefined,
  });
}
