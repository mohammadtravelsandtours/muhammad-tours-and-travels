'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CorporateHeader } from '@/components/corporate-header';
import { useAuth } from '@/lib/auth-context';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <main className="min-h-screen">
      <CorporateHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="text-2xl font-semibold text-graphite-900">Welcome, {user.fullName}</h1>
        <p className="mt-2 text-sm text-graphite-500">Your role: {user.roles.join(', ')}.</p>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <Link href="/search" className="rounded-2xl bg-white border border-line shadow-sm p-5 hover:border-indigo transition-colors">
            <p className="font-medium text-graphite-900">Search flights</p>
            <p className="mt-1 text-sm text-graphite-500">Every booking follows your company's travel policy automatically.</p>
          </Link>
          <Link href="/bookings" className="rounded-2xl bg-white border border-line shadow-sm p-5 hover:border-indigo transition-colors">
            <p className="font-medium text-graphite-900">My bookings</p>
            <p className="mt-1 text-sm text-graphite-500">Track status from submitted through ticketed.</p>
          </Link>
          {user.permissions.includes('booking:approve:corporate') && (
            <Link href="/approvals" className="rounded-2xl bg-white border border-line shadow-sm p-5 hover:border-indigo transition-colors">
              <p className="font-medium text-graphite-900">Pending approvals</p>
              <p className="mt-1 text-sm text-graphite-500">Review and decide on your team's booking requests.</p>
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
