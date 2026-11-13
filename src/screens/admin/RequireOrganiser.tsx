'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Empty, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useMode } from '../../lib/mode';
import { backend } from '../../lib/backend';

export function RequireOrganiser({ children }: { children: ReactNode }) {
  const { user, loading, isOrganiser } = useAuth();
  const { setMode } = useMode();
  useEffect(() => { if (isOrganiser) setMode('organiser'); }, [isOrganiser, setMode]);
  const nav = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user) nav.replace(`/organiser/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, nav, pathname]);
  if (loading || !user) return <div className="center"><Spinner /></div>;
  if (!isOrganiser) {
    return (
      <div className="center">
        <Empty title="Sign in with Google to organise">
          Organising needs a verified Google account. Guest sessions can only take part in events.
          <div className="row-center">
            <Link className="btn btn-primary btn-sm" href="/">Go to my events</Link>
            <button className="btn btn-ghost btn-sm" onClick={() => backend.signOut()}>Sign out</button>
          </div>
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}
