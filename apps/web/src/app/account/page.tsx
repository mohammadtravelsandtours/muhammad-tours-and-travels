'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl text-dusk-900">Hi, {user.fullName.split(' ')[0]}</h1>
      <p className="mt-2 text-sm text-dusk-500">
        <Link href="/search" className="text-tangerine-dim">Search flights</Link>,{' '}
        <Link href="/hotels" className="text-tangerine-dim">search hotels</Link>, or{' '}
        <Link href="/visas" className="text-tangerine-dim">apply for a visa</Link>.
      </p>

      <div className="mt-6 grid gap-2 text-sm">
        <Link href="/bookings" className="text-tangerine-dim">View your flight bookings</Link>
        <Link href="/hotels/bookings" className="text-tangerine-dim">View your hotel bookings</Link>
        <Link href="/visas/applications" className="text-tangerine-dim">View your visa applications</Link>
        <Link href="/packages" className="text-tangerine-dim">Build or view your packages</Link>
      </div>

      <button onClick={logout} className="mt-8 text-sm text-tangerine-dim">
        Sign out
      </button>
    </main>
  );
}
