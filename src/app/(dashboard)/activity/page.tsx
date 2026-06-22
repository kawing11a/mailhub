'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Activity as ActivityIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function ActivityLogPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: async () => {
      const res = await fetch('/api/activity');
      if (!res.ok) throw new Error('Failed to fetch activity log');
      return res.json();
    },
  });

  // /api/activity returns { logs, pagination }
  const activities = data?.logs || [];

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="p-8 border-b border-gray-200 bg-white shadow-sm z-10">
        <div className="max-w-4xl mx-auto flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
            <ActivityIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
            <p className="text-sm text-gray-500 mt-1">
              Audit trail of actions taken across the organization.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center p-12 bg-white rounded-lg border border-gray-200 shadow-sm">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-gray-200 shadow-sm text-gray-500">
              <ActivityIcon className="w-12 h-12 text-gray-300 mb-4" />
              <p>No activity recorded yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <ul className="divide-y divide-gray-200">
                {activities.map((activity: any) => (
                  <li key={activity.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 text-sm font-medium flex-shrink-0">
                        {activity.user?.name ? activity.user.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">
                          <span className="font-semibold">{activity.user?.name || 'Unknown User'}</span>
                          {' '} performed action: {' '}
                          <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs text-gray-600">
                            {activity.action}
                          </span>
                        </p>
                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            Details: {JSON.stringify(activity.metadata)}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 flex-shrink-0">
                        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
