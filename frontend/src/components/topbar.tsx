'use client';

import { logout } from '@/lib/auth';

export function Topbar({ roleCode }: { roleCode: string }) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <span className="text-sm font-medium capitalize text-gray-700">
        {roleCode.replace('_', ' ')}
      </span>
      <button
        type="button"
        onClick={logout}
        className="text-sm font-medium text-gray-600 transition hover:text-gray-900"
      >
        Sign out
      </button>
    </header>
  );
}
