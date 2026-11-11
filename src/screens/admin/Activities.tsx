'use client';

import { BarChart3, ClipboardList, Pencil, Play, Presentation, Radio, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Empty, Spinner } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { useCol } from '../../lib/live';
import type { PulseDoc } from '../../lib/pulse/types';
import { STATUS_LABEL } from '../pulse/PulseHome';
import { ShareModal } from '../pulse/share';
import { useAdmin } from './context';

/** The event's Gather Pulse presentations and surveys. Same builder and live tools as standalone Pulse. */
export function Activities() {
  const { event } = useAdmin();
  const where = useMemo<[string, unknown][]>(() => [['eventId', event.id]], [event.id]);
  const list = useCol<PulseDoc>('pulse', where);
  const [share, setShare] = useState<PulseDoc | null>(null);
  const sorted = [...list.data].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h1>Activities</h1>
          <p className="muted">Live polls, quizzes, Q&A and surveys for {event.title}. Attendees find them on their event home.</p>
        </div>
        <div className="row">
          <Link className="btn btn-primary btn-sm" href={`/pulse/create?kind=presentation&event=${event.id}`}><Presentation size={16} /> New presentation</Link>
          <Link className="btn btn-ghost btn-sm" href={`/pulse/create?kind=survey&event=${event.id}`}><ClipboardList size={16} /> New survey</Link>
        </div>
      </div>
      {list.loading ? <Spinner /> : !sorted.length ? (
        <Empty title="No activities yet">Start with a word cloud to open the day, a quiz after a session or a feedback survey at the end.</Empty>
      ) : (
        <div className="pl-list">
          {sorted.map((p) => (
            <article key={p.id} className={`pl-card ${p.kind}`}>
              <div className="pl-card-head"><span className={`pill pl-status-${p.status}`}>{p.status === 'live' && <Radio size={13} aria-hidden="true" />} {STATUS_LABEL[p.status]}</span><span className="muted">{p.kind === 'survey' ? 'Survey' : 'Presentation'} · code {p.code}</span></div>
              <h3>{p.title}</h3>
              <small className="muted">{p.slides.length} {p.kind === 'survey' ? 'questions' : 'slides'} · {p.access === 'event' ? 'attendees only' : p.access === 'public' ? 'anyone with the link' : 'Google sign-in'} · updated {fmtDateTime(p.updatedAt)}</small>
              <div className="pl-card-actions">
                <Link className="btn btn-ghost btn-sm" href={`/pulse/edit/${p.id}`}><Pencil size={15} /> Edit</Link>
                {p.kind === 'presentation'
                  ? <Link className="btn btn-primary btn-sm" href={`/pulse/presentation/${p.id}`}><Play size={15} /> {p.status === 'live' ? 'Resume' : 'Present'}</Link>
                  : <button className="btn btn-primary btn-sm" disabled={p.status === 'draft'} onClick={() => setShare(p)}><Share2 size={15} /> Share</button>}
                <Link className="btn btn-ghost btn-sm" href={`/pulse/results/${p.id}`}><BarChart3 size={15} /> Results</Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {share && <ShareModal p={share} onClose={() => setShare(null)} />}
    </div>
  );
}
