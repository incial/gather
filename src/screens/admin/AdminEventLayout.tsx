'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { DemoBanner, Empty, Icon, Logo, Spinner } from '../../components/ui';
import { useCol, useDoc } from '../../lib/live';
import type { EventDoc, EventInfoDoc, SessionDoc, SpeakerDoc } from '../../lib/types';
import { AdminCtx } from './context';
import { AccountMenu } from '../../components/AccountMenu';
import { useAuth } from '../../lib/auth';

const TABS = [
  ['', 'Overview'], ['details', 'Details'], ['agenda', 'Schedule'], ['speakers', 'Speakers'],
  ['people', 'People'], ['attendance', 'Attendance'], ['activities', 'Activities'], ['feedback', 'Feedback'], ['assets', 'Assets'], ['certificates', 'Certificates'], ['data', 'Data & CSV'],
];

export function AdminEventLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `events/${id}`;
  const { user, isSuper } = useAuth();
  const event = useDoc<EventDoc>(base);
  // Only the event's owner (who created it) or the Master Admin manages it. The rules enforce this too.
  const owns = !!event.data && (isSuper || (!!user && event.data.ownerUid === user.uid));
  const info = useDoc<EventInfoDoc>(owns ? `${base}/private/info` : null);
  const sessions = useCol<SessionDoc>(owns ? `${base}/sessions` : null);
  const speakers = useCol<SpeakerDoc>(owns ? `${base}/speakers` : null);

  if (event.loading) return <div className="center"><Spinner /></div>;
  if (!event.data) return <div className="center"><Empty title="Event not found"><Link href="/admin">Back to events</Link></Empty></div>;
  if (!owns) return <div className="center"><Empty title="You don’t manage this event">Only the organiser who created it can manage it. <Link href="/admin">Back to your events</Link></Empty></div>;

  return (
    <AdminCtx.Provider value={{ event: event.data, info: info.data, sessions: sessions.data, speakers: speakers.data }}>
      <div className={`admin a-${event.data.color}`}>
        <DemoBanner />
        <header className="admin-top">
          <Logo to="/admin" />
          <span className="admin-title">{event.data.title}</span>
          <Link className="btn btn-ghost btn-sm hide-sm" href={`/e/${id}`} target="_blank">Attendee view <Icon name="external" size={15} /></Link>
          <AccountMenu />
        </header>
        <nav className="admin-tabs" aria-label="Event sections">
          {TABS.map(([to, label]) => {
            const href = `/admin/e/${id}${to ? `/${to}` : ''}`;
            return <Link key={to} href={href} className={pathname === href ? 'active' : ''} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>;
          })}
        </nav>
        <main className="admin-main">{children}</main>
      </div>
    </AdminCtx.Provider>
  );
}
