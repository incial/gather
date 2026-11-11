'use client';

import { BarChart3, CalendarDays, Crown, ExternalLink, Settings2, Shield, Sparkles, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CsvButton, DemoBanner, Empty, ErrorNote, Field, Spinner, useToast } from '../components/ui';
import { addOrganiser, removeOrganiser } from '../lib/api';
import { useAuth } from '../lib/auth';
import { backend } from '../lib/backend';
import { fmtDateTime, fmtRange, friendlyError } from '../lib/format';
import { useCol, useCount } from '../lib/live';
import type { PulseDoc } from '../lib/pulse/types';
import { eventUrl } from '../lib/qr';
import type { EventDoc } from '../lib/types';
import { OrganiserTop } from './admin/AdminHome';
import { visibilityOf, VISIBILITY_LABEL } from './admin/EventForm';
import { STATUS_LABEL } from './pulse/PulseHome';

interface UserRow { id: string; name?: string; email?: string; photo?: string; lastSignIn?: string }
type Tab = 'events' | 'people' | 'pulse' | 'team';
const PAGE = 50;

/** God view: the super admin's view of the whole platform. Only people in superAdmins can open it. */
export function God() {
  const { user, loading, isSuper } = useAuth();
  const nav = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>('events');
  useEffect(() => { if (!loading && !user) nav.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [loading, user, nav, pathname]);
  if (loading || !user) return <div className="center"><Spinner /></div>;
  if (!isSuper) return <div className="center"><Empty title="Super admins only">{user.email} doesn’t have God view access. <Link href="/">Back to Gather</Link></Empty></div>;
  return (
    <div className="admin">
      <DemoBanner />
      <OrganiserTop active="god" />
      <main className="admin-main org-main">
        <section className="org-hero god-hero">
          <div>
            <span className="kicker"><Crown size={14} aria-hidden="true" /> God view</span>
            <h1>Everything on Gather</h1>
            <p>Every event, person and Pulse activity across the platform. Changes here affect everyone, so take care.</p>
          </div>
        </section>
        <PlatformStats />
        <div className="seg god-tabs" role="tablist" aria-label="Sections">
          {([['events', 'Events', CalendarDays], ['people', 'People', Users], ['pulse', 'Pulse', Sparkles], ['team', 'Admins', Shield]] as const).map(([k, l, Ico]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ico size={16} /> {l}</button>
          ))}
        </div>
        {tab === 'events' && <AllEvents />}
        {tab === 'people' && <AllPeople />}
        {tab === 'pulse' && <AllPulse />}
        {tab === 'team' && <Admins me={user.email} />}
      </main>
    </div>
  );
}

function PlatformStats() {
  // Counts cost one read per 1,000 documents, so these stay cheap however big Gather gets.
  const events = useCount('events');
  const people = useCount('users');
  const pulse = useCount('pulse');
  const organisers = useCount('organisers');
  const certs = useCount('certificates');
  const n = (c: { n: number | null; error: boolean }) => (c.error ? '–' : c.n ?? '…');
  return (
    <div className="stat-row">
      <div className="stat"><span>Events</span><b>{n(events)}</b><small>all organisers</small></div>
      <div className="stat"><span>People</span><b>{n(people)}</b><small>signed-in accounts</small></div>
      <div className="stat"><span>Pulse activities</span><b>{n(pulse)}</b><small>presentations and surveys</small></div>
      <div className="stat"><span>Organisers</span><b>{n(organisers)}</b><small>with access</small></div>
      <div className="stat"><span>Certificates</span><b>{n(certs)}</b><small>issued</small></div>
    </div>
  );
}

function AllEvents() {
  const events = useCol<EventDoc>('events');
  const [q, setQ] = useState('');
  const list = useMemo(() => [...events.data].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).filter((e) => !q || `${e.title} ${e.organiser} ${e.venue}`.toLowerCase().includes(q.toLowerCase())), [events.data, q]);
  const sheet = { name: 'all-events', columns: ['Title', 'Organiser', 'Venue', 'Starts', 'Ends', 'Visibility', 'Join code', 'Link'], rows: list.map((e) => ({ Title: e.title, Organiser: e.organiser, Venue: e.venue, Starts: fmtDateTime(e.startsAt), Ends: fmtDateTime(e.endsAt), Visibility: VISIBILITY_LABEL[visibilityOf(e)], 'Join code': e.joinCode, Link: eventUrl(e.id) })) };
  if (events.loading) return <Spinner />;
  return (
    <section className="stack">
      <div className="row-between"><input className="god-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" aria-label="Search events" /><CsvButton sheet={sheet} prefix="gather" /></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Event</th><th>When</th><th>Visibility</th><th>Joined</th><th></th></tr></thead>
          <tbody>{list.map((e) => <EventRow key={e.id} e={e} />)}</tbody>
        </table>
      </div>
      {!list.length && <Empty title="No events">Nothing matches.</Empty>}
    </section>
  );
}

function EventRow({ e }: { e: EventDoc }) {
  const joined = useCount(`events/${e.id}/attendees`);
  return (
    <tr>
      <td><b>{e.title}</b><br /><small className="muted">{e.organiser || '—'} · {e.venue}</small></td>
      <td><small>{fmtRange(e.startsAt, e.endsAt)}</small></td>
      <td><span className={`pill org-vis-${visibilityOf(e)}`}>{VISIBILITY_LABEL[visibilityOf(e)]}</span></td>
      <td>{joined.n ?? '…'}</td>
      <td className="god-actions"><Link className="btn btn-ghost btn-sm" href={`/admin/e/${e.id}`}><Settings2 size={14} /> Manage</Link><Link className="icon-btn" href={`/e/${e.id}`} target="_blank" aria-label="Open attendee view"><ExternalLink size={15} /></Link></td>
    </tr>
  );
}

function AllPeople() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const orgs = useCol<{ id: string }>('organisers');
  const supers = useCol<{ id: string }>('superAdmins');
  async function more(reset = false) {
    setBusy(true); setErr('');
    try {
      const last = reset ? undefined : rows[rows.length - 1];
      const page = await backend.getCol<UserRow>('users', [], { orderBy: 'email', limit: PAGE, ...(last ? { after: [last.email ?? '', last.id] as [string, string] } : {}) });
      setRows(reset ? page : [...rows, ...page]);
      setDone(page.length < PAGE);
    } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { more(true); }, []);
  const role = (email?: string) => (email && supers.data.some((s) => s.id === email) ? 'Super admin' : email && orgs.data.some((o) => o.id === email) ? 'Organiser' : 'Attendee');
  const shown = rows.filter((r) => !q || `${r.name} ${r.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="stack">
      <div className="row-between"><input className="god-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter loaded people by name or email" aria-label="Filter people" />
        <CsvButton sheet={{ name: 'people', columns: ['Name', 'Email', 'Role', 'Last sign-in'], rows: shown.map((r) => ({ Name: r.name ?? '', Email: r.email ?? '', Role: role(r.email), 'Last sign-in': fmtDateTime(r.lastSignIn) })) }} prefix="gather" /></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th></tr></thead>
          <tbody>{shown.map((r) => <tr key={r.id}><td>{r.name || '—'}</td><td>{r.email}</td><td><span className="pill">{role(r.email)}</span></td><td><small>{fmtDateTime(r.lastSignIn)}</small></td></tr>)}</tbody>
        </table>
      </div>
      <ErrorNote text={err} />
      {!done && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => more()}>{busy ? 'Loading…' : `Load ${PAGE} more`}</button>}
      <p className="muted">Phone numbers and other private details aren’t shown here.</p>
    </section>
  );
}

function AllPulse() {
  const [rows, setRows] = useState<PulseDoc[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    backend.getCol<PulseDoc>('pulse', [], { orderBy: 'title', limit: 200 }).then(setRows).catch((x) => setErr(friendlyError(x))).finally(() => setBusy(false));
  }, []);
  if (busy) return <Spinner />;
  return (
    <section className="stack">
      <ErrorNote text={err} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Title</th><th>Type</th><th>Owner</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td><b>{p.title}</b><br /><small className="muted">{p.eventTitle || 'Standalone'} · code {p.code}</small></td><td>{p.kind === 'survey' ? 'Survey' : 'Presentation'}</td><td>{p.ownerName || '—'}</td><td><span className={`pill pl-status-${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
              <td className="god-actions"><Link className="btn btn-ghost btn-sm" href={`/pulse/results/${p.id}`}><BarChart3 size={14} /> Results</Link></td></tr>
          ))}</tbody>
        </table>
      </div>
      {!rows.length && <Empty title="No Pulse activities yet" />}
    </section>
  );
}

function Admins({ me }: { me: string }) {
  const orgs = useCol<{ id: string }>('organisers');
  const supers = useCol<{ id: string }>('superAdmins');
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<'organiser' | 'super'>('organiser');
  const [err, setErr] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('');
    const v = email.trim().toLowerCase();
    try {
      if (kind === 'super') await backend.write([{ type: 'set', path: `superAdmins/${v}`, data: { addedAt: backend.now(), addedBy: me } }]);
      else await addOrganiser(v);
      setEmail(''); toast(kind === 'super' ? 'Super admin added' : 'Organiser added');
    } catch (x) { setErr(friendlyError(x)); }
  }
  const removeSuper = (id: string) => {
    if (id === me) { toast('You can’t remove yourself.', 'err'); return; }
    if (!confirm(`Remove ${id} as super admin?`)) return;
    backend.write([{ type: 'delete', path: `superAdmins/${id}` }]).catch((x) => setErr(friendlyError(x)));
  };
  return (
    <section className="admin-split">
      <div className="panel">
        <h2><Crown size={18} aria-hidden="true" /> Super admins</h2>
        <ul className="plain-list">{supers.data.map((s) => <li key={s.id} className="row-between"><span>{s.id}{s.id === me ? ' (you)' : ''}</span>{s.id !== me && <button className="icon-btn" aria-label={`Remove ${s.id}`} onClick={() => removeSuper(s.id)}><Trash2 size={15} /></button>}</li>)}</ul>
        <h2><Shield size={18} aria-hidden="true" /> Organisers</h2>
        <ul className="plain-list">{orgs.data.map((o) => <li key={o.id} className="row-between"><span>{o.id}</span>{o.id !== me && <button className="icon-btn" aria-label={`Remove ${o.id}`} onClick={() => removeOrganiser(o.id).catch((x) => setErr(friendlyError(x)))}><Trash2 size={15} /></button>}</li>)}</ul>
      </div>
      <form className="panel" onSubmit={add}>
        <h2>Give access</h2>
        <Field label="Google email"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'organiser' | 'super')}>
            <option value="organiser">Organiser: creates and runs events</option>
            <option value="super">Super admin: God view over everything</option>
          </select>
        </Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary">Add</button>
        <p className="muted">They sign in with this Google account. Super admins can also manage every organiser.</p>
      </form>
    </section>
  );
}
