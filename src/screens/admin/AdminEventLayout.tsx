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
import { isDeletedEvent } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { isEventOwner, isOnTeam } from '../../lib/team';

const TABS = [
  ['', 'Overview'], ['details', 'Details'], ['agenda', 'Schedule'], ['speakers', 'Speakers'],
  ['people', 'People'], ['team', 'Team'], ['attendance', 'Attendance'], ['updates', 'Updates'], ['activities', 'Activities'], ['feedback', 'Feedback'], ['assets', 'Assets'], ['certificates', 'Certificates'], ['data', 'Data & CSV'],
];

export function AdminEventLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `events/${id}`;
  const { user, isSuper } = useAuth();
  const event = useDoc<EventDoc>(base);
  // The event's owner (who created it), anyone on its team, or the Master Admin manages it. The rules enforce this too.
  const isOwner = !!event.data && (isSuper || isEventOwner(event.data, user));
  const owns = !!event.data && (isOwner || isOnTeam(event.data, user));
  const info = useDoc<EventInfoDoc>(owns ? `${base}/private/info` : null);
  const sessions = useCol<SessionDoc>(owns ? `${base}/sessions` : null);
  const speakers = useCol<SpeakerDoc>(owns ? `${base}/speakers` : null);

  if (event.loading) return <div className="center"><Spinner /></div>;
  if (!event.data || (!isSuper && isDeletedEvent(event.data))) return <div className="center"><Empty title="Event not found"><Link href="/admin">Back to events</Link></Empty></div>;
  if (!owns) return <div className="center"><Empty title="You don’t manage this event">Only its organiser and the team they added can manage it. If you’re on the team, sign in with the email they added. <Link href="/admin">Back to your events</Link></Empty></div>;

  return (
    <AdminCtx.Provider value={{ event: event.data, info: info.data, sessions: sessions.data, speakers: speakers.data, isOwner }}>
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
        {isDeletedEvent(event.data) && (
          <p className="deleted-banner" role="status">
            {event.data.deleted
              ? <>Deleted{event.data.deletedByEmail ? ` by ${event.data.deletedByEmail}` : ''}{event.data.deletedAt ? ` on ${fmtDateTime(event.data.deletedAt)}` : ''}. Only super admins can see this event.</>
              : <>A permanent delete of this event didn’t finish. Only super admins can see it.</>}
          </p>
        )}
        <main className="admin-main">{children}</main>
      </div>
    </AdminCtx.Provider>
  );
}
