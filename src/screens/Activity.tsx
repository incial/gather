'use client';

import { useManagedEvents } from '../lib/team';
import { useMyEvents } from '../lib/myEvents';
import { Bell, ClipboardList, Megaphone, Radio, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AccountMenu } from '../components/AccountMenu';
import { Reveal } from '../components/Fun';
import { DemoBanner, Empty, ErrorNote, GlobalNav, Icon, Logo, Spinner, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { backend } from '../lib/backend';
import { fmtDateTime, fmtTime, friendlyError } from '../lib/format';
import { useCol } from '../lib/live';
import type { NotificationDoc } from '../lib/meetping';
import { useMode } from '../lib/mode';
import type { PulseDoc } from '../lib/pulse/types';
import type { MembershipDoc, SessionDoc, SpeakingDoc } from '../lib/types';

interface Announcement { id: string; text: string; by: string; byName: string; at: string }

/** Live first, then upcoming (soonest first), then past (latest first). */
function pickEvent(list: MembershipDoc[], now: number) {
  const end = (m: MembershipDoc) => Date.parse(m.endsAt ?? m.startsAt);
  const live = list.find((m) => Date.parse(m.startsAt) <= now && end(m) >= now);
  if (live) return live.id;
  const next = list.filter((m) => Date.parse(m.startsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (next) return next.id;
  return [...list].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]?.id ?? '';
}

/**
 * /activity: the live home feed of an event. Live Pulse sessions and surveys, announcements,
 * what's on now and next, and your notifications, with extra controls for organisers and speakers.
 */
export function Activity() {
  const { user, loading, isSuper } = useAuth();
  const { canOrganise } = useMode();
  const nav = useRouter();
  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/activity'); }, [loading, user, nav]);
  const mine = useMyEvents(user?.uid);
  const speaking = useCol<SpeakingDoc>(user ? `users/${user.uid}/speaking` : null);
  const notes = useCol<NotificationDoc>(user ? `users/${user.uid}/notifications` : null);
  const [now] = useState(() => Date.now());
  const [chosen, setChosen] = useState('');
  // Organisers also see the events they run (created, or on the team), even ones they haven't joined as an attendee.
  const managed = useManagedEvents(canOrganise ? user : null, isSuper);
  const run = useMemo<MembershipDoc[]>(() => managed.data.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, venue: e.venue, color: e.color })), [managed.data]);
  const runIds = useMemo(() => new Set(run.map((r) => r.id)), [run]);
  const events = useMemo(() => {
    const all = [...mine.data, ...run.filter((r) => !mine.data.some((m) => m.id === r.id))];
    return all.filter((m) => Date.parse(m.endsAt ?? m.startsAt) > now - 30 * 86_400_000).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [mine.data, run, now]);
  const eventId = chosen || pickEvent(events, now);
  const ev = events.find((m) => m.id === eventId);
  const amSpeaker = speaking.data.some((s) => s.eventId === eventId);

  if (loading || !user) return <div className="center"><Spinner /></div>;
  const recentNotes = [...notes.data].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 4);

  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu /></header>
      <main className="dash-main act">
        <div>
          <span className="kicker">Activity</span>
          <h1>What’s happening</h1>
        </div>

        {mine.loading ? <Spinner /> : !events.length ? (
          <Empty title="No events yet">Join an event and everything happening in it appears here: live polls, surveys, announcements and what’s on next.
            <div className="row-center"><Link className="btn btn-primary btn-sm" href="/join">Join an event</Link><Link className="btn btn-ghost btn-sm" href="/explore">Explore</Link></div>
          </Empty>
        ) : <>
          {events.length > 1 && (
            <div className="act-events" role="tablist" aria-label="Event">
              {events.map((m) => (
                <button key={m.id} role="tab" aria-selected={m.id === eventId} className={`act-ev a-${m.color}${m.id === eventId ? ' on' : ''}`} onClick={() => setChosen(m.id)}>{m.title}</button>
              ))}
            </div>
          )}
          {/* Organiser tools only for events this person actually runs (the rules would refuse them anyway). */}
          {ev && <EventFeed key={ev.id} ev={ev} organiser={isSuper || runIds.has(ev.id)} speaker={amSpeaker} />}
        </>}

        <JoinWithCode />

        <section className="stack">
          <div className="row-between"><h2><Bell size={19} aria-hidden="true" /> Notifications</h2><Link className="link" href="/inbox">All</Link></div>
          {notes.loading ? <Spinner /> : !recentNotes.length ? <p className="muted">Nothing yet. Meet Ping requests and replies show up here.</p> : (
            <ul className="act-list">
              {recentNotes.map((n) => (
                <li key={n.id} className={n.read ? '' : 'unread'}>
                  <span className="act-ic" aria-hidden="true">{n.type === 'accepted' ? '🤝' : '👋'}</span>
                  <div className="grow"><b>{n.type === 'accepted' ? `${n.fromName} accepted your Meet Ping` : `${n.fromName} wants to meet you`}</b><small className="muted">{n.eventTitle} · {fmtDateTime(n.at)}</small></div>
                  <Link className="btn btn-ghost btn-sm" href={`/inbox?request=${n.pingId}`}>Open</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <GlobalNav />
    </div>
  );
}

function EventFeed({ ev, organiser, speaker }: { ev: MembershipDoc; organiser: boolean; speaker: boolean }) {
  const live = useCol<PulseDoc>('pulse', useMemo<[string, unknown][]>(() => [['eventId', ev.id], ['status', 'live']], [ev.id]));
  const open = useCol<PulseDoc>('pulse', useMemo<[string, unknown][]>(() => [['eventId', ev.id], ['status', 'published']], [ev.id]));
  const sessions = useCol<SessionDoc>(`events/${ev.id}/sessions`);
  const ann = useCol<Announcement>(`events/${ev.id}/announcements`);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const pulses = [...live.data, ...open.data];
  const sorted = useMemo(() => [...sessions.data].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions.data]);
  const onNow = sorted.filter((s) => Date.parse(s.startsAt) <= now && Date.parse(s.endsAt) > now);
  const next = sorted.filter((s) => Date.parse(s.startsAt) > now).slice(0, 3);
  const done = sorted.filter((s) => Date.parse(s.endsAt) <= now).slice(-3).reverse();
  const anns = [...ann.data].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 5);
  const loadingLive = live.loading || open.loading;

  return (
    <div className="stack-lg">
      <Reveal as="section" className="act-live">
        <div className="row-between">
          <h2><span className="live-dot" aria-hidden="true" /> Live now</h2>
          <Link className="link" href={`/e/${ev.id}`}>Open event</Link>
        </div>
        {loadingLive ? <Spinner /> : !pulses.length ? <p className="act-empty">No live polls or surveys right now. When an organiser or speaker starts one, it appears here straight away.</p> : (
          <ul className="act-list">
            {pulses.map((p) => (
              <li key={p.id}>
                <span className={`act-ic ${p.kind}`}>{p.kind === 'survey' ? <ClipboardList size={19} aria-hidden="true" /> : <Radio size={19} aria-hidden="true" />}</span>
                <div className="grow"><b>{p.title}</b><small className="muted">{p.kind === 'survey' ? 'Survey · open now' : 'Live presentation · follow along on your phone'}</small></div>
                <Link className="btn btn-primary btn-sm" href={p.kind === 'survey' ? `/pulse/survey/${p.id}` : `/pulse/live/${p.id}`}>{p.kind === 'survey' ? 'Answer' : 'Join'}</Link>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      {(organiser || speaker) && <RolePanel ev={ev} organiser={organiser} speaker={speaker} />}

      <section className="stack">
        <h2><Megaphone size={19} aria-hidden="true" /> Announcements</h2>
        {ann.loading ? <Spinner /> : !anns.length ? <p className="muted">No announcements yet.</p> : (
          <ul className="act-list">
            {anns.map((a) => (
              <li key={a.id}>
                <span className="act-ic" aria-hidden="true">📣</span>
                <div className="grow"><p className="prose">{a.text}</p><small className="muted">{a.byName} · {fmtDateTime(a.at)}</small></div>
                {organiser && <button className="icon-btn" aria-label="Delete announcement" onClick={() => { if (confirm('Delete this announcement?')) backend.write([{ type: 'delete', path: `events/${ev.id}/announcements/${a.id}` }]).catch(() => {}); }}><Trash2 size={16} /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2><Icon name="calendar" size={19} /> Schedule</h2>
        {sessions.loading ? <Spinner /> : !sorted.length ? <p className="muted">The schedule isn’t up yet.</p> : (
          <div className="act-sched">
            {onNow.length > 0 && <SessionGroup label="On now" tone="live" list={onNow} eventId={ev.id} />}
            {next.length > 0 && <SessionGroup label="Up next" tone="next" list={next} eventId={ev.id} />}
            {done.length > 0 && <SessionGroup label="Finished" tone="done" list={done} eventId={ev.id} />}
          </div>
        )}
      </section>
    </div>
  );
}

function SessionGroup({ label, tone, list, eventId }: { label: string; tone: 'live' | 'next' | 'done'; list: SessionDoc[]; eventId: string }) {
  return (
    <div className={`act-group ${tone}`}>
      <span className="act-group-label">{label}</span>
      <ul className="act-list">
        {list.map((s) => (
          <li key={s.id}>
            <span className="act-time">{fmtTime(s.startsAt)}</span>
            <div className="grow"><b>{s.title}</b><small className="muted">{[s.room, `until ${fmtTime(s.endsAt)}`].filter(Boolean).join(' · ')}</small></div>
            {tone !== 'done' && <Link className="btn btn-ghost btn-sm" href={`/e/${eventId}/schedule`}>Details</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Extra controls: organisers post announcements and run things; speakers start Pulse sessions. */
function RolePanel({ ev, organiser, speaker }: { ev: MembershipDoc; organiser: boolean; speaker: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function post(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr('');
    try {
      await backend.write([{ type: 'set', path: `events/${ev.id}/announcements/${backend.newId()}`, data: { text: text.trim().slice(0, 500), by: user!.uid, byName: (user!.name || user!.email).slice(0, 80), at: backend.now() } }]);
      setText(''); toast('Announcement posted');
    } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }
  return (
    <section className="act-role">
      <div className="row-between"><h2>{organiser ? '🛠️ Organiser' : '🎤 Speaker'}</h2>{organiser && speaker && <span className="pill">Speaker too</span>}</div>
      <div className="row">
        {organiser && <Link className="btn btn-white btn-sm" href={`/admin/e/${ev.id}`}>Manage event</Link>}
        {organiser && <Link className="btn btn-white btn-sm" href={`/admin/e/${ev.id}/attendance`}>Check-in</Link>}
        <Link className="btn btn-white btn-sm" href={`/pulse/create?kind=presentation&event=${ev.id}`}>Start a live poll</Link>
        <Link className="btn btn-white btn-sm" href={`/pulse/create?kind=survey&event=${ev.id}`}>New survey</Link>
        {speaker && <Link className="btn btn-white btn-sm" href="/speaker">My feedback</Link>}
      </div>
      {organiser && (
        <form className="stack" onSubmit={post}>
          <label className="field"><span className="field-label">Post an announcement</span>
            <textarea rows={2} maxLength={500} value={text} placeholder="e.g. Lunch is served in Hall B" onChange={(e) => setText(e.target.value)} /></label>
          <ErrorNote text={err} />
          <button className="btn btn-lime btn-sm" disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Post to everyone'}</button>
        </form>
      )}
    </section>
  );
}

function JoinWithCode() {
  const nav = useRouter();
  const [code, setCode] = useState('');
  return (
    <form className="act-code" onSubmit={(e) => { e.preventDefault(); if (code.length >= 6) nav.push(`/pulse/join/${code}`); }}>
      <div className="grow"><b>Got a code on the screen?</b><small className="muted">Join a live poll or survey</small></div>
      <input value={code} maxLength={8} placeholder="ABC123" aria-label="Pulse code" autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      <button className="btn btn-primary btn-sm" disabled={code.length < 6}>Join</button>
    </form>
  );
}
