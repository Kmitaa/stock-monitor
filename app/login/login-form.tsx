'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const verified = searchParams.get('verified') === '1';
  const errParam = searchParams.get('error');

  let banner: string | null = null;
  if (verified) banner = 'Email verified — you can sign in.';
  if (errParam === 'invalid_token' || errParam === 'expired_token') {
    banner = 'Verification link is invalid or expired — request a new one below.';
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError('Invalid credentials or email not verified yet.');
        setLoading(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Connection error.');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-black italic tracking-tighter uppercase text-emerald-500">Sign in</h1>
        <p className="mt-2 text-sm text-gray-500 font-mono">Account after email verification</p>
      </div>

      {banner ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200/90">
          {banner}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"
          />
        </div>
        {error ? <p className="text-sm text-rose-400/90">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-white py-3 text-xs font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500">
        No account?{' '}
        <Link href="/register" className="font-semibold text-emerald-500 hover:underline">
          Register
        </Link>
      </p>

      <div className="border-t border-gray-800 pt-6">
        <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Didn&apos;t get the email?</p>
        <ResendBlock />
      </div>
    </div>
  );
}

function ResendBlock() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(typeof data.error === 'string' ? data.error : 'Error.');
        setLoading(false);
        return;
      }
      setMsg(typeof data.message === 'string' ? data.message : 'Sent.');
      if (data.devVerificationUrl && typeof data.devVerificationUrl === 'string') {
        setMsg((m) => `${m} Link (dev): ${data.devVerificationUrl}`);
      }
    } catch {
      setErr('Connection error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={resend} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 rounded-xl border border-gray-800 bg-black px-3 py-2 text-xs text-white outline-none focus:border-gray-600"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-full border border-gray-700 px-4 py-2 text-[10px] font-bold uppercase text-gray-300 hover:bg-gray-900 disabled:opacity-50"
      >
        {loading ? '…' : 'Resend link'}
      </button>
      {msg ? <p className="text-xs text-emerald-400/90 sm:col-span-2 break-all">{msg}</p> : null}
      {err ? <p className="text-xs text-rose-400/90">{err}</p> : null}
    </form>
  );
}
