'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

// The agent-portal flow this header ties together — search, my bookings,
// and the wallet the agency's bookings settle against. Kept to exactly
// what apps/b2b implements rather than padding it out with tabs (Manage
// booking, Reports, …) this portal doesn't have yet.
const NAV_LINKS = [
  { href: '/search', label: 'Search flights' },
  { href: '/bookings', label: 'My bookings' },
  { href: '/wallet', label: 'Wallet' },
];

export function B2bHeader() {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-4xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Link href="/dashboard" className="text-sm font-semibold text-slate-900 shrink-0">
          Muhammad Tours and Travels <span className="font-normal text-slate-500">Agent Portal</span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6 text-sm flex-wrap">
          {NAV_LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link key={l.href} href={l.href} className={active ? 'text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-900'}>
                {l.label}
              </Link>
            );
          })}
          {!loading && user && (
            <button onClick={logout} className="text-teal-dim">
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
