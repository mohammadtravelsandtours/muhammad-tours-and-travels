'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return null;

  const isPending = user.roles.includes('B2B_AGENT') && !user.roles.includes('B2B_AGENCY_ADMIN');

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user.fullName}</h1>
      {isPending && (
        <div className="mt-4 rounded-lg border border-teal/30 bg-teal/5 px-4 py-3 text-sm text-slate-700">
          Your account is pending admin approval before wallet, search, and
          booking become available — this matches the onboarding flow in
          docs/ARCHITECTURE.md § B2B.
        </div>
      )}
      <p className="mt-6 text-sm">
        <Link href="/search" className="text-teal-dim">Search flights →</Link>
      </p>
      {user.permissions.includes('wallet:read:own') && (
        <p className="mt-2 text-sm">
          <Link href="/wallet" className="text-teal-dim">View your agency wallet →</Link>
        </p>
      )}
      <p className="mt-2 text-sm">
        <Link href="/bookings" className="text-teal-dim">My bookings →</Link>
      </p>
      <button onClick={logout} className="mt-8 text-sm text-teal-dim">Sign out</button>
    </main>
  );
}
