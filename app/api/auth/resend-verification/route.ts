import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { appBaseUrl, sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!email) {
    return NextResponse.json({ error: 'Enter an email address.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ ok: true, message: 'If an account exists, we will send a link.' });
  }
  if (user.emailVerified) {
    return NextResponse.json({ error: 'This account is already verified — sign in.' }, { status: 400 });
  }

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
    const msg = e instanceof Error ? e.message : 'Send failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const showDevLink = process.env.NODE_ENV === 'development' && !sent;

  return NextResponse.json({
    ok: true,
    message: sent ? 'New verification link sent.' : 'Link below (dev / Resend did not send).',
    devVerificationUrl: showDevLink ? verifyUrl : undefined,
  });
}
