'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, isLoggedIn, CurrentUser } from '@/lib/auth';
import { shouldUsePosLanding } from '@/lib/navigation';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login');
      return;
    }
    const currentUser = getCurrentUser();
    if (currentUser && shouldUsePosLanding(currentUser.roleCode)) {
      router.replace('/pos');
      return;
    }
    setUser(currentUser);
    setChecked(true);
  }, [router]);

  if (!checked || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Loading...</div>;
  }

  return (
    <div className="flex">
      <Sidebar roleCode={user.roleCode} />
      <div className="flex-1">
        <Topbar roleCode={user.roleCode} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
