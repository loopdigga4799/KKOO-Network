'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getNavForRole } from '@/lib/navigation';

export function Sidebar({ roleCode }: { roleCode: string }) {
  const pathname = usePathname();
  const items = getNavForRole(roleCode);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <span className="text-lg font-bold text-brand-700">Kariakoo</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
