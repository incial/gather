'use client';

import { BellRing, CalendarClock, ClipboardList, FileText, Handshake, Megaphone, MessageSquareText, Radio } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce, useEventFeed, type Item } from '../../components/LiveUpdates';
import { Icon } from '../../components/ui';
import { fmtDateTime, fmtTime } from '../../lib/format';
import { useCol } from '../../lib/live';
import type { NotificationDoc } from '../../lib/meetping';
import { useEventCtx } from './context';

type FeedItem = Omit<Item, 'kind'> & { kind: Item['kind'] | 'now' | 'next' };

const ICON = { poll: Radio, survey: ClipboardList, notice: Megaphone, file: FileText, feedback: MessageSquareText, alert: Handshake, now: Radio, next: CalendarClock };
const GO: Record<FeedItem['kind'], string> = { poll: 'Join', survey: 'Answer', notice: 'View', file: 'Open', feedback: 'Give feedback', alert: 'View', now: 'Schedule', next: 'Schedule' };
const ORDER: Record<FeedItem['kind'], number> = { now: 0, poll: 1, survey: 1, alert: 2, feedback: 2, notice: 3, file: 3, next: 4 };

function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

/**
 * Everything happening at this event right now, newest first: the session on stage and the next one, live polls
 * and surveys, organiser notices, new files and presentations, the feedback prompt and Meet Ping requests here.
 * `limit` shows a short preview (event home) with a link to the full feed.
 */
export function EventLiveFeed({ limit }: { limit?: number }) {
  const { event, me, sessions } = useEventCtx();
  const now = useMinute();
  // The whole event counts as news here (Home only shows the last 48 hours).
  const { items, ready } = useEventFeed(event, me.uid, 45 * 86_400_000);
  const unread = useCol<NotificationDoc>(`users/${me.uid}/notifications`, useMemo<[string, unknown][]>(() => [['read', false], ['eventId', event.id]], [event.id]));
  const announce = useAnnounce();
  const seen = useRef<Set<string> | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported');
  useEffect(() => { if ('Notification' in window) setPerm(Notification.permission); }, []);

  const all = useMemo(() => {
    const onNow = sessions.filter((s) => Date.parse(s.startsAt) <= now && Date.parse(s.endsAt) >= now);
    const next = sessions.find((s) => Date.parse(s.startsAt) > now);
    const sched: FeedItem[] = [
      ...onNow.map((s): FeedItem => ({ key: `s-${s.id}`, kind: 'now', title: s.title, sub: `Happening now${s.room ? ` · ${s.room}` : ''}`, href: `/e/${event.id}/schedule`, at: s.startsAt, eventTitle: `until ${fmtTime(s.endsAt)}` })),
      ...(next ? [{ key: `n-${next.id}`, kind: 'next' as const, title: next.title, sub: `Up next${next.room ? ` · ${next.room}` : ''}`, href: `/e/${event.id}/schedule`, at: next.startsAt, eventTitle: fmtTime(next.startsAt) }] : []),
    ];
    const pings: FeedItem[] = unread.data.map((n) => ({
      key: `a-${n.id}`, kind: 'alert', title: n.type === 'accepted' ? `${n.fromName} accepted your Meet Ping` : `${n.fromName} wants to meet you`,
      sub: 'Meet Ping', href: `/inbox?request=${n.pingId}`, at: n.at ?? '', eventTitle: n.at ? fmtDateTime(n.at) : '',
    }));
    const rest: FeedItem[] = items.map((i) => ({ ...i, eventTitle: i.kind === 'notice' || i.kind === 'file' ? fmtDateTime(i.at) : '' }));
    return [...sched, ...pings, ...rest].sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || (b.at ?? '').localeCompare(a.at ?? ''));
  }, [sessions, now, unread.data, items, event.id]);

  // Pop up polls, notices and files that arrive while the page is open.
  useEffect(() => {
    if (!ready) return;
    if (!seen.current) { seen.current = new Set(items.map((i) => i.key)); return; }
    for (const it of items) if (!seen.current.has(it.key)) { seen.current.add(it.key); announce(it); }
  }, [ready, items, announce]);

  const shown = limit ? all.slice(0, limit) : all;
  return (
    <section className="ev-live" aria-labelledby="ev-live-h">
      <div className="row-between">
        <h2 id="ev-live-h"><span className="live-dot" aria-hidden="true" /> Live feed</h2>
        {limit
          ? <Link href={`/e/${event.id}/live`} className="link">See all</Link>
          : perm === 'default' && <button className="btn btn-ghost btn-sm" onClick={() => Notification.requestPermission().then(setPerm)}><BellRing size={15} /> Notify me</button>}
      </div>
      {!shown.length ? (
        <p className="lu-empty">{ready ? 'Quiet for now. Polls, notices and new files from the organisers show up here the moment they’re shared.' : 'Loading…'}</p>
      ) : (
        <ul className="lu-list">
          {shown.map((it) => {
            const I = ICON[it.kind];
            return (
              <li key={it.key}>
                <Link href={it.href} className={`lu-item k-${it.kind}`}>
                  <span className="lu-ic"><I size={18} aria-hidden="true" /></span>
                  <span className="grow"><small>{it.sub}</small><b>{it.title}</b>{it.eventTitle && <small className="muted">{it.eventTitle}</small>}</span>
                  <span className="lu-go">{GO[it.kind]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {limit && all.length > limit && <Link href={`/e/${event.id}/live`} className="btn btn-ghost btn-block">{all.length - limit} more in the live feed <Icon name="arrow" size={16} /></Link>}
    </section>
  );
}

export function EventLive() {
  const { event } = useEventCtx();
  return (
    <div className="stack-lg">
      <div>
        <h1>Live</h1>
        <p className="muted">What’s happening at {event.title} right now. New polls, notices and files appear the moment they’re shared.</p>
      </div>
      <EventLiveFeed />
    </div>
  );
}
