'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MeetButton, useEventPings } from '../../components/MeetPing';
import { Avatar, Empty, LoadError, Spinner } from '../../components/ui';
import { EmojiAvatar } from '../../components/Fun';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';
import { useCount } from '../../lib/live';
import { CATEGORIES } from '../../lib/speakers';
import type { DirectoryDoc } from '../../lib/types';
import { useEventCtx } from './context';

const PAGE = 30;
type Tab = 'all' | 'speakers' | 'attendees';

/** Who's at the event: speakers first, then attendees a page at a time (30 per page, not everyone at once). */
export function People() {
  const { event, me, speakers } = useEventCtx();
  const { user } = useAuth();
  const path = `events/${event.id}/directory`;
  const total = useCount(path);
  const pings = useEventPings(event.id, me.uid);
  const [rows, setRows] = useState<DirectoryDoc[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const { role } = useEventCtx();
  const myPerson = { uid: me.uid, name: me.name || user?.name || '', photo: user?.photo ?? me.photo, role: role ? 'Speaker' : 'Attendee' };

  const more = useCallback(async (after?: [string, string]) => {
    setBusy(true); setError(false);
    try {
      const page = await backend.getCol<DirectoryDoc>(path, [], { orderBy: 'name', limit: PAGE, after });
      setRows((r) => (after === undefined ? page : [...r, ...page.filter((p) => !r.some((x) => x.id === p.id))]));
      setDone(page.length < PAGE);
    } catch { setError(true); }
    setBusy(false);
  }, [path]);
  useEffect(() => { more(); }, [more]);

  const speakerUids = useMemo(() => new Set(speakers.map((s) => s.uid).filter(Boolean)), [speakers]);
  const match = (t: string) => t.toLowerCase().includes(q.toLowerCase());
  const shownSpeakers = speakers.filter((s) => match(`${s.name} ${s.role} ${s.organisation} ${s.topic}`));
  // Speakers already appear above, so they aren't repeated in the attendee list.
  const shownPeople = rows.filter((p) => !speakerUids.has(p.uid) && match(`${p.name} ${p.institution} ${p.department} ${p.designation}`));

  return (
    <div className="stack-lg">
      <div>
        <h1>People</h1>
        <p className="muted">Speakers and attendees at {event.title}. Tap someone to see their profile, or send a Meet Ping.</p>
      </div>
      <input className="search" aria-label="Search people" placeholder="Search name, college or role" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg people-tabs" role="tablist" aria-label="Show">
        {([['all', 'Everyone'], ['speakers', `Speakers · ${speakers.length}`], ['attendees', `Attendees${total.n !== null ? ` · ${total.n}` : ''}`]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab !== 'attendees' && shownSpeakers.length > 0 && (
        <section className="stack">
          {tab === 'all' && <h2>Speakers</h2>}
          <ul className="people-list">
            {shownSpeakers.map((s) => (
              <li key={s.id} className="person card">
                <Link href={`/e/${event.id}/speakers/${s.id}`} className="person-main" aria-label={`View ${s.name}’s profile`}>
                  <Avatar id={s.uid || s.id} name={s.name} photo={s.photo || undefined} size={52} />
                  <div className="grow">
                    <b>{s.name}{s.uid === me.uid && <span className="you">You</span>}</b>
                    <span className="role-chip speaker">{s.featured ? 'Featured speaker' : s.category && s.category !== 'regular' ? CATEGORIES[s.category] : 'Speaker'}</span>
                    <small>{[s.role, s.organisation].filter(Boolean).join(', ')}</small>
                  </div>
                </Link>
                <div className="person-actions">
                  <Link className="btn btn-ghost btn-sm" href={`/e/${event.id}/speakers/${s.id}`}>View</Link>
                  {s.uid ? <MeetButton event={event} me={myPerson} other={{ uid: s.uid, name: s.name, photo: s.photo, role: 'Speaker' }} pings={pings} compact />
                    : <span className="muted person-note" title="This speaker hasn’t linked a Gather account yet">Not on Gather yet</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab !== 'speakers' && (
        <section className="stack">
          {tab === 'all' && <h2>Attendees</h2>}
          {error && !rows.length ? <LoadError onRetry={() => more()} /> : !rows.length && busy ? <Spinner /> : !rows.length ? <Empty title="Nobody listed yet">People appear here as they join.</Empty> : (
            <>
              {!shownPeople.length ? <Empty title="No matches in the people loaded so far">{!done && 'Load more to search further.'}</Empty> : (
                <ul className="people-list">
                  {shownPeople.map((p) => (
                    <li key={p.id} className="person card">
                      <Link href={`/e/${event.id}/people/${p.uid}`} className="person-main" aria-label={`View ${p.name}’s profile`}>
                        <EmojiAvatar id={p.uid || p.id} photo={p.photo || undefined} size={52} />
                        <div className="grow">
                          <b>{p.name}{p.uid === me.uid && <span className="you">You</span>}</b>
                          <span className="role-chip">Attendee</span>
                          <small>{[p.designation, p.institution].filter(Boolean).join(', ')}</small>
                        </div>
                      </Link>
                      <div className="person-actions">
                        <Link className="btn btn-ghost btn-sm" href={`/e/${event.id}/people/${p.uid}`}>View</Link>
                        <MeetButton event={event} me={myPerson} other={{ uid: p.uid, name: p.name, photo: p.photo, role: 'Attendee' }} pings={pings} compact />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!done && <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => { const l = rows[rows.length - 1]; more(l ? [l.name, l.id] : undefined); }}>{busy ? 'Loading…' : `Show more (${rows.length}${total.n ? ` of ${total.n}` : ''})`}</button>}
              {error && rows.length > 0 && <p className="error">Couldn’t load more. Check your connection and try again.</p>}
            </>
          )}
        </section>
      )}
      {me.listed === false && <p className="muted">You’re hidden from the attendee list, but you can still send Meet Pings. Change it in My pass, under Edit my details.</p>}
    </div>
  );
}
