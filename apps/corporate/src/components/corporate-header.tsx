'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

/**
 * Shared nav across every signed-in corporate page. Every page here
 * requires sign-in (there's no guest browsing in this app, unlike
 * apps/web), so this never has to render a logged-out state.
 */
export function CorporateHeader() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="max-w-3xl mx-auto px-6 pt-8 flex items-center justify-between">
      <Link href="/dashboard" className="text-lg font-semibold text-graphite-900">
        Muhammad Tours and Travels <span className="text-indigo-dim font-normal">Corporate</span>
      </Link>
      <nav className="flex items-center gap-5 text-sm">
        <Link href="/search" className="text-graphite-700 hover:text-graphite-900">Search flights</Link>
        <Link href="/bookings" className="text-graphite-700 hover:text-graphite-900">My bookings</Link>
        {user.permissions.includes('booking:approve:corporate') && (
          <Link href="/approvals" className="text-graphite-700 hover:text-graphite-900">Approvals</Link>
        )}
        <button onClick={logout} className="text-indigo-dim">Sign out</button>
      </nav>
    </header>
  );
}
