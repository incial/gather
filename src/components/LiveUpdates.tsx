'use client';

import { BellRing, ClipboardList, FileText, Handshake, Megaphone, MessageSquareText, Radio } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtDateTime } from '../lib/format';
import { useCol, useDoc } from '../lib/live';
import type { NotificationDoc } from '../lib/meetping';
import type { PulseDoc } from '../lib/pulse/types';
import type { EventDoc, FeedbackDoc, MembershipDoc } from '../lib/types';
import { useToast } from './ui';

interface Notice { id: string; text: string; byName: string; at: string }
interface FileItem { id: string; title: string; kind: string; createdAt?: string }
export type Item = { key: string; kind: 'poll' | 'survey' | 'notice' | 'file' | 'feedback' | 'alert'; title: string; sub: string; href: string; at: string; eventTitle: string };

const RECENT_MS = 48 * 3600_000;
const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

/** Shows a device notification (while Gather is open, even in a background tab) and an in-app pop-up. */
export function useAnnounce() {
  const toast = useToast();
  return (it: Item) => {
    toast(`${it.eventTitle}: ${it.title}`);
    if (canNotify() && Notification.permission === 'granted') {
      try { new Notification(it.eventTitle, { body: `${it.kind === 'notice' ? '' : `${it.sub}: `}${it.title}`, icon: '/icon.svg', tag: it.key }); } catch { /* some browsers only allow it from a service worker */ }
    }
  };
}

/**
 * One event's live items: running polls and surveys, organiser notices, new files and the feedback prompt.
 * `sinceMs` is how far back notices and files count as news (Home: 48 hours; the event's own feed: the whole event).
 */
export function useEventFeed(ev: { id: string; title: string }, uid: string, sinceMs = RECENT_MS) {
  const evDoc = useDoc<EventDoc>(`events/${ev.id}`);
  const mine = useDoc<FeedbackDoc>(`events/${ev.id}/feedback/${uid}`);
  const live = useCol<PulseDoc>('pulse', useMemo<[string, unknown][]>(() => [['eventId', ev.id], ['status', 'live']], [ev.id]));
  const open = useCol<PulseDoc>('pulse', useMemo<[string, unknown][]>(() => [['eventId', ev.id], ['status', 'published']], [ev.id]));
  const notices = useCol<Notice>(`events/${ev.id}/announcements`);
  const files = useCol<FileItem>(`events/${ev.id}/assets`);
  const ready = !live.loading && !open.loading && !notices.loading && !files.loading && !evDoc.loading && !mine.loading;

  const items = useMemo(() => {
    const since = Date.now() - sinceMs;
    const out: Item[] = [
      ...[...live.data, ...open.data].map((p): Item => ({
        key: `p-${p.id}`, kind: p.kind === 'survey' ? 'survey' : 'poll', title: p.title,
        sub: p.kind === 'survey' ? 'Survey open' : 'Live poll', href: p.kind === 'survey' ? `/pulse/survey/${p.id}` : `/pulse/live/${p.id}`,
        at: p.updatedAt ?? new Date().toISOString(), eventTitle: ev.title,
      })),
      ...notices.data.filter((n) => Date.parse(n.at) >= since).map((n): Item => ({
        key: `n-${n.id}`, kind: 'notice', title: n.text, sub: `Notice from ${n.byName}`, href: `/e/${ev.id}`, at: n.at, eventTitle: ev.title,
      })),
      ...files.data.filter((f) => f.createdAt && Date.parse(f.createdAt) >= since).map((f): Item => ({
        key: `f-${f.id}`, kind: 'file', title: f.title, sub: f.kind === 'slides' || /present|slide|ppt/i.test(f.title) ? 'New presentation' : 'New file',
        href: `/e/${ev.id}/assets`, at: f.createdAt!, eventTitle: ev.title,
      })),
      // Feedback is open and they haven't sent theirs yet.
      ...(evDoc.data?.feedbackOpen && !mine.data ? [{
        key: `fb-${ev.id}`, kind: 'feedback' as const, title: 'How was the event? Share your feedback', sub: 'Feedback open',
        href: `/e/${ev.id}/feedback`, at: new Date().toISOString(), eventTitle: ev.title,
      }] : []),
    ];
    return out;
  }, [live.data, open.data, notices.data, files.data, evDoc.data, mine.data, ev.id, ev.title, sinceMs]);
  return { items, ready };
}

/** Feeds one event into Home's Live updates and pops up anything new. */
function EventSource({ ev, uid, onItems }: { ev: MembershipDoc; uid: string; onItems: (id: string, items: Item[]) => void }) {
  const { items, ready } = useEventFeed(ev, uid);
  const announce = useAnnounce();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!ready) return;
    // The first load is what's already there; anything that arrives after it is news.
    if (!seen.current) { seen.current = new Set(items.map((i) => i.key)); onItems(ev.id, items); return; }
    for (const it of items) if (!seen.current.has(it.key)) { seen.current.add(it.key); announce(it); }
    onItems(ev.id, items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items]);
  return null;
}

/**
 * Live updates on Home, from the events you're attending now (or within a day): live polls, open
 * surveys, organiser notices and new files such as presentations. New ones pop up as they arrive.
 */
export function LiveUpdates({ events, uid, children }: { events: MembershipDoc[]; uid: string; children?: ReactNode }) {
  const [byEvent, setByEvent] = useState<Record<string, Item[]>>({});
  // Unread notifications (Meet Ping requests and replies), so nothing important hides in Alerts.
  const unread = useCol<NotificationDoc>(`users/${uid}/notifications`, useMemo<[string, unknown][]>(() => [['read', false]], []));
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported');
  useEffect(() => { if (canNotify()) setPerm(Notification.permission); }, []);
  const now = Date.now();
  const active = useMemo(() => events.filter((m) => {
    const start = Date.parse(m.startsAt), end = Date.parse(m.endsAt ?? m.startsAt);
    return start - 86_400_000 <= now && end + 86_400_000 >= now;
  }).slice(0, 3), [events, now]);
  const onItems = useMemo(() => (id: string, items: Item[]) => setByEvent((x) => ({ ...x, [id]: items })), []);
  const alerts: Item[] = unread.data.map((n) => ({
    key: `a-${n.id}`, kind: 'alert', title: n.type === 'accepted' ? `${n.fromName} accepted your Meet Ping` : `${n.fromName} wants to meet you`,
    sub: 'Notification', href: `/inbox?request=${n.pingId}`, at: n.at ?? '', eventTitle: n.eventTitle,
  }));
  const hasCards = Array.isArray(children) ? children.length > 0 : !!children;
  if (!active.length && !alerts.length && !hasCards) return null;
  const order = { poll: 0, survey: 1, feedback: 2, alert: 3, notice: 4, file: 5 };
  const all = [...alerts, ...Object.entries(byEvent).filter(([id]) => active.some((a) => a.id === id)).flatMap(([, v]) => v)]
    .sort((a, b) => (Math.min(order[a.kind], 2) - Math.min(order[b.kind], 2)) || (b.at ?? '').localeCompare(a.at ?? ''));
  const Ico = { poll: Radio, survey: ClipboardList, notice: Megaphone, file: FileText, feedback: MessageSquareText, alert: Handshake };

  return (
    <section className="lu" aria-labelledby="lu-h">
      {active.map((ev) => <EventSource key={ev.id} ev={ev} uid={uid} onItems={onItems} />)}
      <div className="row-between">
        <h2 id="lu-h"><span className="live-dot" aria-hidden="true" /> Live updates</h2>
        {perm === 'default' && (
          <button className="btn btn-ghost btn-sm" onClick={() => Notification.requestPermission().then(setPerm)}><BellRing size={15} /> Notify me</button>
        )}
      </div>
      {children}
      {!all.length ? <p className="lu-empty">{active.length ? 'Nothing new yet. Polls, notices and files from your event appear here the moment they’re shared.' : 'Join an event to see its live polls, notices and updates here.'}</p> : (
        <ul className="lu-list">
          {all.slice(0, 8).map((it) => {
            const I = Ico[it.kind];
            return (
              <li key={it.key}>
                <Link href={it.href} className={`lu-item k-${it.kind}`}>
                  <span className="lu-ic"><I size={18} aria-hidden="true" /></span>
                  <span className="grow"><small>{it.sub} · {it.eventTitle}</small><b>{it.title}</b>{(it.kind === 'notice' || it.kind === 'file' || it.kind === 'alert') && <small className="muted">{fmtDateTime(it.at)}</small>}</span>
                  <span className="lu-go">{it.kind === 'poll' ? 'Join' : it.kind === 'survey' ? 'Answer' : it.kind === 'file' ? 'Open' : it.kind === 'feedback' ? 'Give feedback' : 'View'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
