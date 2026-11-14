'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { fmtTime } from '../lib/format';
import { useCount } from '../lib/live';
import { useManagedEvents } from '../lib/team';
import type { AppUser, EventDoc } from '../lib/types';
import { Icon } from './ui';

const dayKey = (iso: string) => new Date(iso).toDateString();

/** "Today" / "Tomorrow" / "Saturday" with the date underneath, like a calendar's day column. */
function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (diff <= 0) return { main: 'Today', sub: weekday };
  if (diff === 1) return { main: 'Tomorrow', sub: weekday };
  return { main: date, sub: weekday };
}

function HostCard({ e, now }: { e: EventDoc; now: number }) {
  // One count read per card (1 read per 1,000 guests), not the guest list itself.
  const guests = useCount(`events/${e.id}/attendees`);
  const live = Date.parse(e.startsAt) <= now;
  const n = guests.n;
  return (
    <article className={`host-card a-${e.color}`}>
      <div className="host-card-body">
        <span className="host-time">{live ? <><span className="live-dot" aria-hidden="true" /> Happening now · until {fmtTime(e.endsAt)}</> : fmtTime(e.startsAt)}</span>
        <h3><Link href={`/admin/e/${e.id}`}>{e.title}</Link></h3>
        {e.venue
          ? <p className="host-meta"><Icon name="pin" size={16} /> {e.venue}</p>
          : <p className="host-meta host-warn"><Icon name="pin" size={16} /> Location missing</p>}
        <p className="host-meta"><Icon name="people" size={16} /> {n === null ? (guests.error ? 'Guests' : '…') : n === 0 ? 'No guests yet' : `${n} guest${n === 1 ? '' : 's'}`}</p>
        <div className="host-actions">
          <Link className="btn btn-ink btn-sm" href={`/admin/e/${e.id}/attendance`}><Icon name="scan" size={16} /> Check In</Link>
          <Link className="btn btn-ghost btn-sm" href={`/admin/e/${e.id}`}>Manage <Icon name="arrow" size={16} /></Link>
        </div>
      </div>
      <Link href={`/admin/e/${e.id}`} className="host-cover" aria-label={`Manage ${e.title}`} tabIndex={-1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {e.bannerThumb ? <img src={e.bannerThumb} alt="" /> : <span>{e.title.slice(0, 1)}</span>}
      </Link>
    </article>
  );
}

/**
 * Events this person runs (created or co-organises), at the top of Home: upcoming and live ones in a
 * day-by-day timeline, each with Check In and Manage. Deleted events never show here, super admins
 * included: this is "my events", not the God view.
 */
export function HostingEvents({ user }: { user: AppUser }) {
  const managed = useManagedEvents(user, false);
  const [now] = useState(() => Date.now());
  const upcoming = useMemo(
    () => managed.data.filter((e) => Date.parse(e.endsAt) >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [managed.data, now],
  );
  if (managed.loading || !upcoming.length) return null;
  const days: { key: string; first: string; list: EventDoc[] }[] = [];
  for (const e of upcoming) {
    // Live events sit under Today even if they started on an earlier day.
    const k = Date.parse(e.startsAt) <= now ? dayKey(new Date(now).toISOString()) : dayKey(e.startsAt);
    const d = days.find((x) => x.key === k);
    if (d) d.list.push(e); else days.push({ key: k, first: Date.parse(e.startsAt) <= now ? new Date(now).toISOString() : e.startsAt, list: [e] });
  }
  return (
    <section className="hosting" aria-labelledby="hosting-h">
      <div className="section-head">
        <h2 id="hosting-h">Hosting</h2>
        <Link className="btn btn-ghost btn-sm" href="/admin">All my events <Icon name="arrow" size={16} /></Link>
      </div>
      <ol className="host-timeline">
        {days.map((d) => {
          const l = dayLabel(d.first, now);
          return (
            <li key={d.key} className="host-day">
              <div className="host-date"><b>{l.main}</b><span>{l.sub}</span></div>
              <div className="host-list">{d.list.map((e) => <HostCard key={e.id} e={e} now={now} />)}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
