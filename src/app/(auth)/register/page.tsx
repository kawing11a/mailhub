'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, Mail } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, organizationName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create account');
      }

      // Automatically log the user in after successful registration
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) {
        throw new Error('Account created but failed to log in automatically. Please log in.');
      }

      router.push('/inbox');
      router.refresh();
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

      <h2 className="app-title text-3xl font-semibold mb-2">Create an account</h2>
      <p className="text-gray-500 mb-8">Get started with your unified command center</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center animate-in fade-in zoom-in duration-200">
            <span className="font-medium">{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Full Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 outline-none transition-all bg-gray-50/50 focus:bg-white text-gray-900"
            placeholder="John Doe"
          />
        </div>

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
          <label className="text-sm font-medium text-gray-700">Organization Name</label>
          <input
            type="text"
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 outline-none transition-all bg-gray-50/50 focus:bg-white text-gray-900"
            placeholder="Acme Corp"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 outline-none transition-all bg-gray-50/50 focus:bg-white text-gray-900"
            placeholder="At least 8 characters"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent-600 hover:bg-accent-700 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed shadow-sm shadow-accent-600/20 mt-2"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Create account <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent-600 hover:text-accent-700 transition-colors">
          Sign in instead
        </Link>
      </div>
    </div>
  );
}
