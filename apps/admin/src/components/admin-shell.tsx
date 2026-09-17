'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouped by function rather than one flat list of 11 links — makes the
// sidebar scannable and gives the mobile drawer natural section breaks.
// "Security" (2FA/sessions) deliberately isn't here — it's a personal
// account setting, reached from the profile menu in the top bar instead
// of sitting alongside operational modules.
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Overview' },
      { href: '/analytics', label: 'Analytics' },
    ],
  },
  {
    label: 'Bookings & Catalog',
    items: [
      { href: '/hajj-umrah', label: 'Hajj & Umrah' },
      { href: '/manpower', label: 'Manpower' },
      { href: '/suppliers', label: 'Suppliers' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/wallets', label: 'Wallets' },
      { href: '/pricing', label: 'Pricing & Markup' },
    ],
  },
  {
    label: 'Access & People',
    items: [
      { href: '/agencies', label: 'Agencies' },
      { href: '/corporates', label: 'Corporates' },
      { href: '/rbac', label: 'Roles & Access' },
      { href: '/audit', label: 'Audit Log' },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Shared chrome for every authenticated admin screen. Phase 14 rebuild:
 * the sidebar is now a slide-out drawer below the `lg` breakpoint
 * (previously a fixed two-column grid that simply broke on phone/tablet
 * widths), nav links are grouped under headings instead of one flat
 * list, and a top bar adds a quick nav-search box and an account/
 * profile menu (previously just a bare "Sign out" text link at the
 * bottom of the sidebar).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Close the mobile drawer automatically whenever navigation happens —
  // otherwise it stays open over the new page after a link tap.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  if (loading || !user) return null;

  function goTo(href: string) {
    setQuery('');
    router.push(href);
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto border-r border-ink-700 bg-ink-950 p-6 transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <div className="h-2 w-8 bg-signal rounded-full" aria-hidden />
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="text-paper-500 hover:text-paper-100 lg:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-6 text-sm">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[11px] uppercase tracking-wide text-paper-500/80 font-medium">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-md px-3 py-2 ${
                      pathname === item.href ? 'bg-ink-800 text-paper-100' : 'text-paper-300 hover:bg-ink-800 hover:text-paper-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-4 py-3 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="text-paper-300 hover:text-paper-100 lg:hidden"
          >
            <span aria-hidden className="text-lg leading-none">☰</span>
          </button>

          <div className="relative flex-1 max-w-sm">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) goTo(matches[0].href);
              }}
              placeholder="Jump to a module…"
              aria-label="Jump to a module"
              className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-1.5 text-sm text-paper-100 placeholder:text-paper-500 focus:border-signal focus:ring-0"
            />
            {matches.length > 0 && (
              <div className="absolute z-30 mt-1 w-full rounded-md border border-ink-700 bg-ink-900 shadow-lg overflow-hidden">
                {matches.map((m) => (
                  <button
                    key={m.href}
                    onClick={() => goTo(m.href)}
                    className="block w-full text-left px-3 py-2 text-sm text-paper-300 hover:bg-ink-800 hover:text-paper-100"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative ml-auto" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ink-800"
              aria-haspopup="true"
              aria-expanded={profileOpen}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal text-ink-950 text-xs font-semibold shrink-0">
                {user.fullName.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:block text-sm text-paper-100">{user.fullName.split(' ')[0]}</span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 z-30 mt-2 w-56 rounded-md border border-ink-700 bg-ink-900 shadow-lg overflow-hidden text-sm">
                <div className="px-3 py-3 border-b border-ink-700">
                  <p className="text-paper-100 font-medium truncate">{user.fullName}</p>
                  <p className="text-xs text-paper-500 mt-0.5">{user.roles.join(', ')}</p>
                </div>
                <Link
                  href="/security"
                  onClick={() => setProfileOpen(false)}
                  className="block px-3 py-2 text-paper-300 hover:bg-ink-800 hover:text-paper-100"
                >
                  Security
                </Link>
                <button
                  onClick={logout}
                  className="block w-full text-left px-3 py-2 text-danger hover:bg-ink-800"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
