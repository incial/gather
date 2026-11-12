'use client';

import { CalendarDays, Copy, Crown, Link2, MapPin, Plus, Radio, ScanLine, Search, Settings2, Sparkles, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { CsvButton, DemoBanner, Empty, ErrorNote, Field, Logo, Modal, Spinner, useToast } from '../../components/ui';
import { addOrganiser, createEvent, loadFdpProgramme, removeOrganiser, syncCapacityCounter } from '../../lib/api';
import { AccountMenu } from '../../components/AccountMenu';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, fmtRange, friendlyError } from '../../lib/format';
import { useCol } from '../../lib/live';
import { FDP_EVENT } from '../../lib/programme';
import { eventUrl } from '../../lib/qr';
import type { EventDoc } from '../../lib/types';
import { blankEvent, EventForm, visibilityOf, VISIBILITY_LABEL } from './EventForm';
import { DeleteEventDialog } from './DeleteEvent';

type Phase = 'live' | 'upcoming' | 'past';
const phaseOf = (e: EventDoc, now: number): Phase => (Date.parse(e.endsAt) < now ? 'past' : Date.parse(e.startsAt) <= now ? 'live' : 'upcoming');
type Filter = 'all' | Phase | 'draft';

/** Top bar shared by the organiser home: Events, Pulse, Team and God view. */
export function OrganiserTop({ active, onTeam }: { active: 'events' | 'god'; onTeam?: () => void }) {
  const { isSuper } = useAuth();
  return (
    <header className="admin-top org-top">
      <Logo to="/admin" />
      <nav className="org-nav" aria-label="Organiser">
        <Link href="/admin" className={active === 'events' ? 'on' : ''}><CalendarDays size={16} /> Events</Link>
        <Link href="/pulse"><Sparkles size={16} /> Pulse</Link>
        {onTeam && <button onClick={onTeam}><Users size={16} /> Team</button>}
        {isSuper && <Link href="/god" className={active === 'god' ? 'on' : ''}><Crown size={16} /> God view</Link>}
      </nav>
      <AccountMenu />
    </header>
  );
}

export function AdminHome() {
  const { user } = useAuth();
  const nav = useRouter();
  const events = useCol<EventDoc>('events');
  const organisers = useCol<{ id: string; addedAt?: string }>('organisers');
  const [creating, setCreating] = useState(false);
  const [team, setTeam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const toast = useToast();
  const now = Date.now();
  const fdpMissing = !events.loading && !events.data.some((e) => e.title === FDP_EVENT.title);
  async function loadFdp() {
    setLoading(true);
    try { nav.push(`/admin/e/${await loadFdpProgramme()}`); }
    catch (x) { toast(friendlyError(x), 'err'); setLoading(false); }
  }
  const sorted = useMemo(() => {
    // Live first, then upcoming (soonest first), then past (latest first).
    const rank = { live: 0, upcoming: 1, past: 2 };
    return [...events.data].sort((a, b) => rank[phaseOf(a, now)] - rank[phaseOf(b, now)] || (phaseOf(a, now) === 'past' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
  }, [events.data, now]);
  const shown = sorted.filter((e) => {
    if (q && !`${e.title} ${e.venue} ${e.organiser} ${e.joinCode}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'all') return true;
    if (filter === 'draft') return visibilityOf(e) === 'draft';
    return phaseOf(e, now) === filter;
  });
  const count = (f: (e: EventDoc) => boolean) => events.data.filter(f).length;
  const sheet = useMemo(() => ({
    name: 'events',
    columns: ['Title', 'Tagline', 'Organiser', 'Venue', 'Starts', 'Ends', 'Join code', 'Visibility', 'Private link'],
    rows: sorted.map((e) => ({ Title: e.title, Tagline: e.tagline, Organiser: e.organiser, Venue: e.venue, Starts: fmtDateTime(e.startsAt), Ends: fmtDateTime(e.endsAt), 'Join code': e.joinCode, Visibility: VISIBILITY_LABEL[visibilityOf(e)], 'Private link': eventUrl(e.id) })),
  }), [sorted]);

  return (
    <div className="admin">
      <DemoBanner />
      <OrganiserTop active="events" onTeam={() => setTeam(true)} />
      <main className="admin-main org-main">
        <section className="org-hero">
          <div>
            <span className="kicker">Organiser</span>
            <h1>Hi{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Here are your events.</h1>
            <p>Create an event, share its link, run check-in and see everything as it happens.</p>
          </div>
          <div className="row">
            <button className="btn btn-lime" onClick={() => setCreating(true)}><Plus size={18} /> Create event</button>
            <Link className="btn btn-glass" href="/pulse"><Sparkles size={16} /> Gather Pulse</Link>
          </div>
        </section>

        <div className="stat-row">
          <div className="stat"><span>All events</span><b>{events.loading ? '…' : events.data.length}</b><small>{count((e) => visibilityOf(e) === 'public')} public · {count((e) => visibilityOf(e) === 'private')} private</small></div>
          <div className="stat"><span>Live now</span><b>{count((e) => phaseOf(e, now) === 'live')}</b><small>happening today</small></div>
          <div className="stat"><span>Upcoming</span><b>{count((e) => phaseOf(e, now) === 'upcoming')}</b><small>scheduled</small></div>
          <div className="stat"><span>Drafts</span><b>{count((e) => visibilityOf(e) === 'draft')}</b><small>not visible yet</small></div>
        </div>

        {fdpMissing && (
          <button className="nudge card" disabled={loading} onClick={loadFdp}>
            <span><b>{loading ? 'Loading…' : 'Load the I&E FDP programme'}</b> Adds 16–18 Nov with all sessions and speakers, as a draft.</span>
          </button>
        )}

        <div className="org-toolbar">
          <label className="org-search"><Search size={17} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, venues or codes" aria-label="Search events" /></label>
          <div className="seg org-filter" role="tablist" aria-label="Filter events">
            {([['all', 'All'], ['live', 'Live'], ['upcoming', 'Upcoming'], ['past', 'Past'], ['draft', 'Drafts']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <CsvButton sheet={sheet} prefix="gather" />
        </div>

        {events.loading ? <Spinner /> : shown.length === 0 ? (
          <Empty title={events.data.length ? 'No events match' : 'No events yet'}>{events.data.length ? 'Try another search or filter.' : 'Create your first event. It takes a couple of minutes.'}</Empty>
        ) : (
          <div className="org-grid">
            {shown.map((e) => <OrgEventCard key={e.id} e={e} phase={phaseOf(e, now)} />)}
          </div>
        )}
      </main>
      {creating && (
        <Modal title="Create event" onClose={() => setCreating(false)}>
          <EventForm initial={blankEvent()} submitLabel="Create event" onSubmit={async (d) => { const id = await createEvent(d); if (d.capacity) await syncCapacityCounter(id); return id; }} onDone={(id) => nav.push(`/admin/e/${id}`)} />
        </Modal>
      )}
      {team && <TeamModal list={organisers.data} onClose={() => setTeam(false)} me={user?.email ?? ''} />}
    </div>
  );
}

function OrgEventCard({ e, phase }: { e: EventDoc; phase: Phase }) {
  const toast = useToast();
  const vis = visibilityOf(e);
  const [deleting, setDeleting] = useState(false);
  return (
    <article className={`org-card a-${e.color}`}>
      <Link href={`/admin/e/${e.id}`} className="org-card-cover" aria-label={`Manage ${e.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {e.bannerThumb ? <img src={e.bannerThumb} alt="" /> : <span className="org-card-initial">{e.title.slice(0, 1)}</span>}
        <div className="org-pills">
          {phase === 'live' && <span className="pill pill-live"><Radio size={12} aria-hidden="true" /> Live</span>}
          <span className={`pill org-vis-${vis}`}>{VISIBILITY_LABEL[vis]}</span>
          {e.deleting && <span className="pill pill-warn">Delete didn’t finish</span>}
        </div>
      </Link>
      <div className="org-card-body">
        <h3><Link href={`/admin/e/${e.id}`}>{e.title}</Link></h3>
        <p className="muted"><CalendarDays size={14} aria-hidden="true" /> {fmtRange(e.startsAt, e.endsAt)}</p>
        <p className="muted"><MapPin size={14} aria-hidden="true" /> {e.venue || '—'}</p>
        <div className="org-card-actions">
          <Link className="btn btn-primary btn-sm" href={`/admin/e/${e.id}`}><Settings2 size={15} /> Manage</Link>
          <Link className="btn btn-ghost btn-sm" href={`/admin/e/${e.id}/attendance`}><ScanLine size={15} /> Check-in</Link>
          <Link className="btn btn-ghost btn-sm" href={`/admin/e/${e.id}/activities`}><Sparkles size={15} /> Activities</Link>
          <button className="btn btn-ghost btn-sm" title="Copy the private link" onClick={() => navigator.clipboard.writeText(eventUrl(e.id)).then(() => toast(vis === 'draft' ? 'Link copied. It opens once the event is public or private.' : 'Private link copied'))}><Link2 size={15} /> Link</button>
          <button className="btn btn-ghost btn-sm danger" onClick={() => setDeleting(true)} aria-label={`Delete ${e.title}`}><Trash2 size={15} /> Delete</button>
        </div>
        {deleting && <DeleteEventDialog event={e} onClose={() => setDeleting(false)} onDeleted={() => setDeleting(false)} />}
        <small className="muted">Code {e.joinCode} <button className="link" onClick={() => navigator.clipboard.writeText(e.joinCode).then(() => toast('Code copied'))} aria-label="Copy join code"><Copy size={12} /></button></small>
      </div>
    </article>
  );
}

function TeamModal({ list, me, onClose }: { list: { id: string }[]; me: string; onClose: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try { await addOrganiser(email); setEmail(''); toast('Organiser added'); }
    catch (x) { setErr(friendlyError(x)); }
  }
  return (
    <Modal title="Organiser team" onClose={onClose}>
      <ul className="plain-list">
        {list.map((o) => (
          <li key={o.id} className="row-between">
            <span>{o.id}</span>
            {o.id !== me && <button className="link danger" onClick={() => removeOrganiser(o.id).catch((x) => setErr(friendlyError(x)))}>Remove</button>}
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <Field label="Add by email"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <button className="btn btn-primary btn-sm">Add</button>
      </form>
      <p className="muted">They sign in on the Organiser login page with this Google account.</p>
      <ErrorNote text={err} />
    </Modal>
  );
}
