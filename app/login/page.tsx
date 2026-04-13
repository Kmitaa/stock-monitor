import { Suspense } from 'react';
import Link from 'next/link';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full bg-transparent text-white px-4 py-16 flex flex-col items-center justify-start">
      <Suspense
        fallback={
          <div className="text-gray-500 text-sm font-mono">Loading…</div>
        }
      >
        <LoginForm />
      </Suspense>
      <Link href="/" className="mt-10 text-[10px] font-mono uppercase tracking-widest text-gray-600 hover:text-gray-400">
        ← Home
      </Link>
    </main>
  );
}
