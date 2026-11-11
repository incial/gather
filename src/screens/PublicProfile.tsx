'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProfileCard } from '../components/ProfileCard';
import { DemoBanner, Empty, GlobalNav, LoadError, Logo, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { findProfile, type PublicProfile as P } from '../lib/profile';

/** A shared profile link: /p/<profile ID>. Signed-in people only, and only visible profiles. */
export function PublicProfile() {
  const { pid } = useParams<{ pid: string }>();
  const { user, loading } = useAuth();
  const nav = useRouter();
  const [p, setP] = useState<P | null | undefined>(undefined);
  const [err, setErr] = useState(false);
  useEffect(() => { if (!loading && !user) nav.replace(`/login?next=${encodeURIComponent(`/p/${pid}`)}`); }, [loading, user, nav, pid]);
  useEffect(() => {
    if (!user) return;
    findProfile(pid).then(setP).catch(() => setErr(true));
  }, [user, pid]);

  if (loading || !user || (p === undefined && !err)) return <div className="center"><Spinner /></div>;
  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /></header>
      <main className="dash-main">
        {err ? <LoadError /> : !p ? <Empty title="Profile not found">It may be hidden, or the link is wrong. <Link className="link" href="/">Go to my events</Link></Empty> : <ProfileCard p={p} />}
      </main>
      <GlobalNav />
    </div>
  );
}
