'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const NAV_TABS = [
  { href: '/', label: 'Home' },
  { href: '/search', label: 'Flights' },
  { href: '/hotels', label: 'Hotels' },
  { href: '/hajj-umrah', label: 'Hajj & Umrah' },
  { href: '/packages', label: 'Tour Packages' },
  { href: '/visas', label: 'Visa Service' },
  { href: '/manpower', label: 'Manpower' },
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-[60] border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-3" onClick={() => setMobileOpen(false)} aria-label="Muhammad Tours and Travels home">
          <Image src="/logo-mark.png" alt="" width={42} height={42} className="h-9 w-9 sm:h-10 sm:w-10" priority />
          <span className="leading-none">
            <span className="block font-display text-sm font-bold tracking-wide text-dusk-900 sm:text-base">MUHAMMAD</span>
            <span className="mt-1 block text-[8px] font-bold tracking-[0.22em] text-dusk-500 sm:text-[9px]">TOURS AND TRAVELS</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {NAV_TABS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                isActive(item.href) ? 'bg-slate-100 text-dusk-900' : 'text-dusk-600 hover:bg-slate-50 hover:text-dusk-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {!loading && user ? (
            <>
              <Link href="/account" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-dusk-700 hover:bg-slate-50">
                {user.fullName.split(' ')[0]}
              </Link>
              <button type="button" onClick={logout} className="px-2 py-2 text-sm font-semibold text-orange-600 hover:text-orange-500">
                Sign out
              </button>
            </>
          ) : !loading ? (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-dusk-700 hover:bg-slate-50">Login</Link>
              <Link href="/register" className="rounded-lg bg-dusk-900 px-4 py-2 text-sm font-bold text-white hover:bg-dusk-700">Register</Link>
            </>
          ) : null}
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-dusk-900 lg:hidden"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className="text-xl">{mobileOpen ? '×' : '☰'}</span>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-100 bg-white px-5 pb-5 lg:hidden">
          <nav className="grid gap-1 pt-3" aria-label="Mobile navigation">
            {NAV_TABS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-xl px-4 py-3 text-sm font-semibold ${isActive(item.href) ? 'bg-slate-100 text-dusk-900' : 'text-dusk-600 hover:bg-slate-50'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            {!loading && user ? (
              <>
                <Link href="/account" onClick={() => setMobileOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold">My account</Link>
                <button type="button" onClick={() => { logout(); setMobileOpen(false); }} className="flex-1 rounded-xl bg-dusk-900 px-4 py-3 text-sm font-semibold text-white">Sign out</button>
              </>
            ) : !loading ? (
              <>
                <Link href="/login" onClick={() => setMobileOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold">Login</Link>
                <Link href="/register" onClick={() => setMobileOpen(false)} className="flex-1 rounded-xl bg-dusk-900 px-4 py-3 text-center text-sm font-semibold text-white">Register</Link>
              </>
            ) : null}
          </div>
        </div>
      )}
    </header>
  );
}
