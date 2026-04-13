'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setDevUrl(null);
    if (password !== password2) {
      setError('Passwords must match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const raw = await res.text();
      let data: { error?: string; message?: string; devVerificationUrl?: string };
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        setError(
          'Server returned non-JSON (check the `npm run dev` terminal — often missing DATABASE_URL or Prisma migrations).'
        );
        return;
      }
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Registration failed.');
        return;
      }
      setSuccess(typeof data.message === 'string' ? data.message : 'Account created.');
      if (typeof data.devVerificationUrl === 'string') {
        setDevUrl(data.devVerificationUrl);
      }
    } catch {
      setError('Network error — make sure `npm run dev` is running and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-transparent text-white px-4 py-16 flex flex-col items-center">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase text-amber-500">Register</h1>
          <p className="mt-2 text-sm text-gray-500 font-mono">Password min. 8 chars · email verification</p>
        </div>

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
              className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50"
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label htmlFor="password2" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Confirm password
            </label>
            <input
              id="password2"
              name="password2"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50"
            />
          </div>
          {error ? <p className="text-sm text-rose-400/90">{error}</p> : null}
          {success ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 space-y-2">
              <p>{success}</p>
              {devUrl ? (
                <p className="text-[11px] font-mono break-all text-gray-400">
                  Dev (no RESEND): <a className="text-amber-400 underline" href={devUrl}>{devUrl}</a>
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full rounded-full bg-white py-3 text-xs font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-amber-500 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      <Link href="/" className="mt-10 text-[10px] font-mono uppercase tracking-widest text-gray-600 hover:text-gray-400">
        ← Home
      </Link>
    </main>
  );
}
