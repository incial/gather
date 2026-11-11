'use client';

import { BarChart3, ClipboardList, Copy, Pencil, Play, Presentation, Radio, Share2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccountMenu } from '../../components/AccountMenu';
import { DemoBanner, Empty, Spinner, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';
import { fmtDateTime, friendlyError } from '../../lib/format';
import { useCol, useCount } from '../../lib/live';
import { createPulse, deletePulse, P } from '../../lib/pulse/api';
import type { PulseDoc } from '../../lib/pulse/types';
import type { EventDoc } from '../../lib/types';
import { ShareModal } from './share';

/** Header used by the Pulse creator screens. */
export function PulseTop({ children }: { children?: ReactNode }) {
  return (
    <header className="pl-top">
      <Link href="/pulse" className="pl-brand" aria-label="Gather Pulse home"><span className="logo-mark" aria-hidden="true" />gather <b>Pulse</b></Link>
      <div className="row">{children}<AccountMenu /></div>
    </header>
  );
}

/** Creator screens need a Google account. Guests and signed-out visitors go to sign-in and come back. */
export function RequireCreator({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const nav = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (!loading && !user) nav.replace(`/login?next=${encodeURIComponent(pathname + (search.size ? `?${search}` : ''))}`);
  }, [loading, user, nav, pathname, search]);
  if (loading || !user) return <div className="center"><Spinner /></div>;
  return <>{children}</>;
}

export const STATUS_LABEL: Record<PulseDoc['status'], string> = { draft: 'Draft', live: 'Live', published: 'Published', closed: 'Completed' };

type Filter = 'all' | 'presentation' | 'survey' | 'draft' | 'active' | 'closed';

export function PulseHome() {
  const { user } = useAuth();
  const mine = useCol<PulseDoc>(user ? 'pulse' : null, [['ownerUid', user?.uid]]);
  const [filter, setFilter] = useState<Filter>('all');
  const [share, setShare] = useState<PulseDoc | null>(null);
  const list = useMemo(() => [...mine.data].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')), [mine.data]);
  const shown = list.filter((p) => filter === 'all' || p.kind === filter || p.status === filter || (filter === 'active' && (p.status === 'live' || p.status === 'published')));
  const n = (f: (p: PulseDoc) => boolean) => list.filter(f).length;

  return (
    <div className="pl">
      <DemoBanner />
      <PulseTop><Link className="btn btn-ghost btn-sm hide-sm" href="/pulse/join">Join with a code</Link></PulseTop>
      <main className="pl-main">
        <section className="pl-hero">
          <div>
            <span className="pl-kicker">Gather Pulse</span>
            <h1>Every voice matters.<br />Every response counts.</h1>
            <p>Live polls, word clouds, quizzes and Q&A for your audience, or a survey you share with a link. No app for anyone to install.</p>
          </div>
          <div className="pl-create">
            <Link href="/pulse/create?kind=presentation" className="pl-create-card pres"><Presentation size={26} aria-hidden="true" /><b>Create presentation</b><span>Ask questions live, show results on the big screen</span></Link>
            <Link href="/pulse/create?kind=survey" className="pl-create-card survey"><ClipboardList size={26} aria-hidden="true" /><b>Create survey</b><span>Share a link, collect answers in people’s own time</span></Link>
          </div>
        </section>

        <div className="stat-row">
          <div className="stat"><span>Presentations</span><b>{n((p) => p.kind === 'presentation')}</b><small>{n((p) => p.kind === 'presentation' && p.status === 'draft')} drafts</small></div>
          <div className="stat"><span>Surveys</span><b>{n((p) => p.kind === 'survey')}</b><small>{n((p) => p.kind === 'survey' && p.status === 'published')} collecting now</small></div>
          <div className="stat"><span>Active sessions</span><b>{n((p) => p.status === 'live' || p.status === 'published')}</b><small>live or open</small></div>
          <div className="stat"><span>Completed</span><b>{n((p) => p.status === 'closed')}</b><small>results kept</small></div>
        </div>

        <div className="row-between">
          <h2>Your activities</h2>
          <div className="seg pl-filter" role="tablist" aria-label="Filter">
            {([['all', 'All'], ['presentation', 'Presentations'], ['survey', 'Surveys'], ['draft', 'Drafts'], ['active', 'Active'], ['closed', 'Completed']] as [Filter, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
        </div>

        {mine.loading ? <Spinner /> : mine.error ? <p className="error">Couldn’t load your activities. {friendlyError(mine.error)}</p> : shown.length === 0 ? (
          <Empty title={list.length ? 'Nothing here' : 'No presentations or surveys yet'}>{list.length ? 'Try another filter.' : 'Create your first one above. It takes a minute.'}</Empty>
        ) : (
          <div className="pl-list">{shown.map((p) => <PulseCard key={p.id} p={p} onShare={() => setShare(p)} />)}</div>
        )}
      </main>
      {share && <ShareModal p={share} onClose={() => setShare(null)} />}
    </div>
  );
}

function PulseCard({ p, onShare }: { p: PulseDoc; onShare: () => void }) {
  const toast = useToast();
  const answers = useCount(`${P(p.id)}/${p.kind === 'survey' ? 'submissions' : 'responses'}`);
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(`Delete “${p.title}” and all its responses? This can’t be undone.`)) return;
    setBusy(true);
    try { await deletePulse(p); toast('Deleted'); } catch (x) { toast(friendlyError(x), 'err'); setBusy(false); }
  }
  return (
    <article className={`pl-card ${p.kind}`}>
      <div className="pl-card-head">
        <span className={`pill pl-status-${p.status}`}>{p.status === 'live' && <Radio size={13} aria-hidden="true" />} {STATUS_LABEL[p.status]}</span>
        <span className="muted">{p.kind === 'survey' ? 'Survey' : 'Presentation'}{p.eventTitle ? ` · ${p.eventTitle}` : ''}</span>
      </div>
      <h3><Link href={`/pulse/edit/${p.id}`}>{p.title}</Link></h3>
      <p className="muted">{p.locked ? 'Password protected · ' : ''}{p.slides.length || '–'} {p.kind === 'survey' ? 'questions' : 'slides'} · {answers.n ?? '…'} {p.kind === 'survey' ? 'responses' : 'answers'} · code {p.code}</p>
      <small className="muted">Updated {fmtDateTime(p.updatedAt)}</small>
      <div className="pl-card-actions">
        <Link className="btn btn-ghost btn-sm" href={`/pulse/edit/${p.id}`}><Pencil size={15} /> Edit</Link>
        {p.kind === 'presentation'
          ? <Link className="btn btn-primary btn-sm" href={`/pulse/presentation/${p.id}`}><Play size={15} /> {p.status === 'live' ? 'Resume' : 'Present'}</Link>
          : <button className="btn btn-primary btn-sm" onClick={onShare} disabled={p.status === 'draft'} title={p.status === 'draft' ? 'Publish the survey first' : ''}><Share2 size={15} /> Share</button>}
        <Link className="btn btn-ghost btn-sm" href={`/pulse/results/${p.id}`}><BarChart3 size={15} /> Results</Link>
        <button className="icon-btn" aria-label={`Delete ${p.title}`} disabled={busy} onClick={remove}><Trash2 size={17} /></button>
      </div>
    </article>
  );
}

/** /pulse/create?kind=…&event=… makes a draft and opens the builder. */
export function PulseCreate() {
  const { user } = useAuth();
  const nav = useRouter();
  const search = useSearchParams();
  const [err, setErr] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    const kind = search.get('kind') === 'survey' ? 'survey' : 'presentation';
    const eventId = search.get('event');
    (async () => {
      const ev = eventId ? await backend.getDoc<EventDoc>(`events/${eventId}`) : null;
      const id = await createPulse(kind, user, ev ? { id: ev.id, title: ev.title } : undefined);
      nav.replace(`/pulse/edit/${id}`);
    })().catch((x) => setErr(friendlyError(x)));
  }, [user, search, nav]);
  return (
    <div className="center">
      {err ? <Empty title="Couldn’t create it">{err} <Link href="/pulse">Back to Pulse</Link></Empty> : <Spinner label="Creating" />}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const toast = useToast();
  return <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Couldn’t copy. Select the text and copy it.', 'err'))}><Copy size={15} /> {label}</button>;
}
