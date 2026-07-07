'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { CreateUserModal } from '@/components/settings/CreateUserModal';
import { ManageAccountAccessModal } from '@/components/settings/ManageAccountAccessModal';

export default function MembersPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accessModalMember, setAccessModalMember] = useState<any | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await fetch('/api/org/members');
      if (!res.ok) throw new Error('Failed to fetch members');
      return res.json();
    },
  });

  const members = Array.isArray(data) ? data : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage who has access to your organization's inbox.
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center space-x-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Create User</span>
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members.map((member: any) => (
                <tr key={member.userId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-accent-100 flex items-center justify-center text-accent-700 font-medium">
                        {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{member.name || 'Unknown'}</div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap">
                    <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-accent-100 text-accent-800 capitalize">
                      {member.role}
                    </span>
                  </td>
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(member.joinedAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => setAccessModalMember(member)}
                      className="text-accent-600 hover:text-accent-900 transition-colors mr-4"
                    >
                      Manage Access
                    </button>
                    <button className="text-gray-400 hover:text-gray-900 transition-colors">
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <ManageAccountAccessModal
        isOpen={!!accessModalMember}
        onClose={() => setAccessModalMember(null)}
        member={accessModalMember}
      />
    </div>
  );
}
