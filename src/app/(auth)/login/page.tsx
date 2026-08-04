'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Invalid email or password');
      }

      // Success
      router.push('/inbox');
      router.refresh(); // Refresh to ensure layout gets updated state
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <img src="/logo.png" alt="MailHub Logo" className="h-10 w-auto rounded-lg shadow-sm" />
          <span className="text-2xl font-bold tracking-tight text-gray-900">MailHub</span>
        </div>

      <h2 className="app-title text-3xl font-semibold mb-2">Welcome back</h2>
      <p className="text-gray-500 mb-8">Sign in to your account to continue</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center animate-in fade-in zoom-in duration-200">
            <span className="font-medium">{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 outline-none transition-all bg-gray-50/50 focus:bg-white text-gray-900"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <a href="#" className="text-sm text-accent-600 hover:text-accent-700 font-medium">Forgot password?</a>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 outline-none transition-all bg-gray-50/50 focus:bg-white text-gray-900"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent-600 hover:bg-accent-700 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm shadow-accent-600/20"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Sign in <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 text-center text-sm text-gray-500">
        Don't have an account?{' '}
        <Link href="/register" className="font-medium text-accent-600 hover:text-accent-700 transition-colors">
          Create an account
        </Link>
      </div>
    </div>
  );
}
