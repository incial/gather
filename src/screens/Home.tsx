'use client';

import { LiveUpdates } from '../components/LiveUpdates';
import { useMyEvents } from '../lib/myEvents';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountMenu } from '../components/AccountMenu';
import { HostingEvents } from '../components/HostingEvents';
import { DemoBanner, GlobalNav, Icon, LoadError, Logo, Spinner } from '../components/ui';
import { useMode } from '../lib/mode';
import { useAuth } from '../lib/auth';
import { fmtRange, fmtTime } from '../lib/format';
import type { MembershipDoc } from '../lib/types';
import { Site } from './Site';

export function Home() {
  const { user, loading } = useAuth();
  // While sign-in is starting, the website is already on screen for visitors (it is in the page's HTML).
  // Someone signed in last time gets a loader instead (CSS, from a hint set before the first paint).
  if (loading) return <><div className="center boot-spin"><Spinner /></div><Site deferData /></>;
  return user ? <MyEvents /> : <Site />;
}

/** Shown once per sign-in session, for a moment, before My events. */
function WelcomeSplash({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 650); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="splash bleed-lime" role="status">
      <h1>Welcome,<br />{name}</h1>
      <span className="ring" aria-hidden="true" />
    </div>
  );
}

function MyEvents() {
  const { user } = useAuth();
  const { mode, canOrganise } = useMode();
  const nav = useRouter();
  useEffect(() => { if (mode === 'organiser') nav.replace('/admin'); }, [mode, nav]);
  const [splash, setSplash] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const mine = useMyEvents(user!.uid);
  const first = (user!.name || 'there').replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').split(' ')[0];
  const [now] = useState(() => Date.now());
  const sorted = useMemo(() => {
    // Upcoming and live first (soonest first), then past events (latest first).
    const end = (m: MembershipDoc) => Date.parse(m.endsAt ?? m.startsAt);
    const upcoming = mine.data.filter((m) => end(m) >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = mine.data.filter((m) => end(m) < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return { upcoming, past };
  }, [mine.data, now]);

  useEffect(() => {
    try {
      if (!sessionStorage.getItem('gather-welcomed')) { sessionStorage.setItem('gather-welcomed', '1'); setSplash(true); }
    } catch { /* private mode: skip the splash */ }
  }, []);
  if (mode === 'organiser') return <div className="center"><Spinner /></div>;
  if (splash) return <WelcomeSplash name={first} onDone={() => setSplash(false)} />;

  const live = sorted.upcoming.filter((m) => Date.parse(m.startsAt) <= now);
  const next = sorted.upcoming.filter((m) => Date.parse(m.startsAt) > now);
  const card = (m: MembershipDoc, past = false) => (
    <Link key={m.id} href={`/e/${m.id}`} className={`event-card a-${m.color}${past ? ' is-past' : ''}`}>
      <span className="tag">{past ? 'Ended' : 'Joined'}</span>
      <h3>{m.title}</h3>
      <p>{m.venue}</p>
      <small>{fmtRange(m.startsAt, m.endsAt)}</small>
    </Link>
  );

  return (
    <div className="dash">
      <DemoBanner />
      <header className="top">
        <Logo />
        <AccountMenu />
      </header>
      <main className="dash-main home-main">
        <h1 className="hello">Hello, <span className="grad-text">{first}</span></h1>

        {/* 0. Events you run, first, each with Check In and Manage. */}
        {canOrganise && <HostingEvents user={user!} />}

        {/* 1. The two main actions, first. */}
        <div className="home-actions">
          <Link href="/join" className="home-action a-blue"><span className="home-action-ic"><Icon name="scan" size={24} /></span><b>Join an event</b><small>Scan the event’s QR code or type its 6-digit number</small></Link>
          <Link href="/explore" className="home-action a-lime"><span className="home-action-ic"><Icon name="compass" size={24} /></span><b>Explore events</b><small>Find what’s coming up</small></Link>
        </div>

        {/* 2. Live updates: events happening now, then polls, notices, files, feedback and notifications. */}
        <LiveUpdates events={mine.data} uid={user!.uid}>
          {live.map((m) => (
            <article key={m.id} className={`live-card a-${m.color}`}>
              <div className="grow">
                <span className="tag"><span className="live-dot" aria-hidden="true" /> Happening now</span>
                <h3>{m.title}</h3>
                <p>{m.venue} · until {fmtTime(m.endsAt ?? m.startsAt)}</p>
              </div>
              <div className="live-card-actions">
                <Link className="btn btn-white btn-sm" href={`/e/${m.id}`}>Open event</Link>
                <Link className="btn btn-glass btn-sm" href={`/e/${m.id}/pass`}><Icon name="ticket" size={15} /> My pass</Link>
                <Link className="btn btn-glass btn-sm" href={`/e/${m.id}/schedule`}><Icon name="calendar" size={15} /> Schedule</Link>
              </div>
            </article>
          ))}
        </LiveUpdates>

        <div className="section-head">
          <h2>My events</h2>
          <div className="seg seg-sm" role="tablist" aria-label="Which events">
            {(['upcoming', 'past'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {k === 'upcoming' ? 'Upcoming' : `Past${sorted.past.length ? ` (${sorted.past.length})` : ''}`}
              </button>
            ))}
          </div>
        </div>
        {mine.error ? <LoadError /> : mine.loading ? <Spinner /> : mine.data.length === 0 ? (
          <div className="empty">
            <strong>No events yet</strong>
            <div>Tap Join an event to scan its QR code or type its number, or find one in Explore.</div>
          </div>
        ) : tab === 'upcoming' ? (
          next.length > 0 ? <div className="event-grid">{next.map((m) => card(m))}</div> : <p className="muted">{live.length ? 'Nothing else coming up. Your live events are above.' : 'Nothing coming up right now.'}</p>
        ) : (
          sorted.past.length > 0 ? <div className="event-grid">{sorted.past.map((m) => card(m, true))}</div> : <p className="muted">No past events yet.</p>
        )}
      </main>
      <GlobalNav />
    </div>
  );
}
