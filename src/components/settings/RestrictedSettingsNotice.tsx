import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export function RestrictedSettingsNotice({
  sectionName,
}: {
  sectionName: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-100 p-2 text-amber-700">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Admin access required
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Only administrators can access {sectionName}. You can still manage
              your email accounts, label assignment, signatures, preferences, and
              security settings.
            </p>
          </div>
          <Link
            href="/settings/accounts"
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-accent-700 shadow-sm ring-1 ring-inset ring-accent-200 transition-colors hover:bg-accent-50"
          >
            Go to Email Accounts
          </Link>
        </div>
      </div>
    </div>
  );
}
