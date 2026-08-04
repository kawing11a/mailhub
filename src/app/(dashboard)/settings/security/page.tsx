'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Loader2, Check } from 'lucide-react';
import { changePasswordSchema } from '@/lib/validation';

// We add a confirm password field on the client side for UX
const securityFormSchema = changePasswordSchema.extend({
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type SecurityFormValues = z.infer<typeof securityFormSchema>;

export default function SecurityPage() {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
  });

  const onSubmit = async (data: SecurityFormValues) => {
    setSuccess(false);
    setError(null);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to update password');
      }

      setSuccess(true);
      reset(); // clear form
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="app-title text-2xl font-semibold">Security</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account security and password.
        </p>
      </div>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
          <Shield className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Change Password</h2>
        </div>
        <div className="p-6">
          {success && (
            <div className="mb-6 p-4 rounded-md bg-green-50 border border-green-200 flex items-center text-green-800">
              <Check className="w-5 h-5 mr-3 text-green-500" />
              <span>Password successfully updated.</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-accent-500 focus:ring-accent-500 text-sm"
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.currentPassword.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-accent-500 focus:ring-accent-500 text-sm"
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-accent-500 focus:ring-accent-500 text-sm"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex justify-center items-center px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Update Password
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
