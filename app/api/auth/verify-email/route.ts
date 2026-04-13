import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { appBaseUrl } from '@/lib/email';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const base = appBaseUrl();

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', base));
  }

  const row = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!row || row.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { token } });
    return NextResponse.redirect(new URL('/login?error=expired_token', base));
  }

  await prisma.user.update({
    where: { email: row.identifier },
    data: { emailVerified: new Date() },
  });
  await prisma.verificationToken.delete({ where: { token } });

  return NextResponse.redirect(new URL('/login?verified=1', base));
}
