'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Avatar, DemoBanner, Empty, Icon, LoadError, Logo, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useCol, useDoc } from '../../lib/live';
import type { AttendanceDoc, AttendeeDoc, ConnectionDoc, EventDoc, EventInfoDoc, FeedbackDoc, RoleDoc, SessionDoc, SessionFeedbackDoc, SpeakerDoc } from '../../lib/types';
import { sortSpeakers } from '../../lib/speakers';
import { EventCtx } from './context';
import { FeedbackPrompt } from './FeedbackPrompt';
import { Landing } from './Landing';
import { NotificationBell } from '../../components/NotificationBell';

const TABS = [
  { to: '', label: 'Home', icon: 'home', end: true },
  { to: 'speakers', label: 'Speakers', icon: 'speakers' },
  { to: 'scan', label: 'Scan', icon: 'scan', scan: true },
  { to: 'people', label: 'People', icon: 'people' },
  { to: 'feedback', label: 'Feedback', icon: 'feedback' },
] as const;

const SIDE = [
  { to: '', label: 'Home', icon: 'home' }, { to: 'schedule', label: 'Schedule', icon: 'calendar' },
  { to: 'speakers', label: 'Speakers', icon: 'speakers' }, { to: 'people', label: 'People', icon: 'people' },
  { to: 'feedback', label: 'Feedback', icon: 'feedback' }, { to: 'activities', label: 'Activities', icon: 'sparkle' },
  { to: 'assets', label: 'Assets', icon: 'download' },
  { to: 'pass', label: 'My pass', icon: 'ticket' },
  { to: 'scan', label: 'Scan', icon: 'scan' },
] as const;

/** Everything under /e/:id. Anyone who hasn't joined sees the landing page at the same URL, so QR links survive sign-up. */
export function EventLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const base = `events/${id}`;
  const event = useDoc<EventDoc>(base);
  const me = useDoc<AttendeeDoc>(user ? `${base}/attendees/${user.uid}` : null);
  const joined = !!me.data;
  const mine: [string, unknown][] = useMemo(() => [['uid', user?.uid]], [user?.uid]);
  const sessions = useCol<SessionDoc>(`${base}/sessions`);
  const speakers = useCol<SpeakerDoc>(joined ? `${base}/speakers` : null);
  const attendance = useCol<AttendanceDoc>(joined ? `${base}/attendance` : null, mine);
  const connections = useCol<ConnectionDoc>(joined ? `${base}/connections` : null, mine);
  const feedback = useDoc<FeedbackDoc>(joined ? `${base}/feedback/${user!.uid}` : null);

  const info = useDoc<EventInfoDoc>(joined ? `${base}/private/info` : null);
  const sessionFeedback = useCol<SessionFeedbackDoc>(joined ? `${base}/sessionFeedback` : null, mine);
  const role = useDoc<RoleDoc>(joined ? `${base}/roles/${user!.uid}` : null);
  const orderedSpeakers = useMemo(() => sortSpeakers(speakers.data), [speakers.data]);

  const sorted = useMemo(() => [...sessions.data].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions.data]);

  if (authLoading || event.loading || me.loading) return <div className="center"><Spinner /></div>;
  if (event.error && !event.data && navigator.onLine === false) return <div className="center"><LoadError /></div>;
  if (!event.data) {
    return <div className="center"><Empty title="This event isn’t available">It may not be published yet. <Link href="/">Back to home</Link></Empty></div>;
  }
  const accent = `a-${event.data.color}`;
  if (!me.data) return <div className={accent}><Landing event={event.data} /></div>;

  return (
    <EventCtx.Provider value={{
      event: event.data, me: me.data, sessions: sorted, speakers: orderedSpeakers, role: role.data?.active ? role.data : null,
      attendance: attendance.data, connections: connections.data, feedback: feedback.data,
      info: info.data, sessionFeedback: sessionFeedback.data,
    }}>
      <div className={`app ${accent}`}>
        <DemoBanner />
        <aside className="side">
          <Logo />
          <Link href="/" className="side-back"><Icon name="back" size={16} /> All events</Link>
          <Link href="/inbox" className="side-back">Meet Pings inbox</Link>
          <div className="side-event"><b>{event.data.title}</b><small>{event.data.venue}</small></div>
          <nav aria-label="Event sections">
            {SIDE.map((t) => {
              const href = `/e/${id}${t.to ? `/${t.to}` : ''}`;
              const active = t.to ? pathname.startsWith(href) : pathname === href;
              return <Link key={t.to} href={href} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}><Icon name={t.icon} size={20} />{t.label}</Link>;
            })}
          </nav>
        </aside>
        <header className="app-top">
          <Link href="/" className="icon-btn" aria-label="Back to my events"><Icon name="back" size={20} /></Link>
          <Link className="app-top-event" href={`/e/${id}`}>{event.data.title}</Link>
          <NotificationBell />
          <Link href={`/e/${id}/pass`} aria-label="My pass" className="app-top-me"><Avatar id={me.data.uid} name={me.data.name} photo={me.data.photo || undefined} size={40} /></Link>
        </header>
        <main className="app-main">{children}</main>
        <FeedbackPrompt />
        <nav className="tabbar" aria-label="Event">
          {TABS.map((t) => {
            const href = `/e/${id}${t.to ? `/${t.to}` : ''}`;
            const active = 'end' in t ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={t.to} href={href} aria-current={active ? 'page' : undefined} className={`tab${'scan' in t ? ' tab-scan' : ''}${active ? ' active' : ''}`}>
                <span className={'scan' in t ? 'scan-btn' : 'tab-icon'}><Icon name={t.icon} size={'scan' in t ? 26 : 22} /></span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </EventCtx.Provider>
  );
}
