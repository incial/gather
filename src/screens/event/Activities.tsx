'use client';

import { ClipboardList, Radio, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Empty } from '../../components/ui';
import { useCol } from '../../lib/live';
import type { PulseDoc } from '../../lib/pulse/types';
import { useEventCtx } from './context';

/** Live and open Pulse activities for this event. Two small queries: live presentations and open surveys. */
export function useEventActivities(eventId: string) {
  const live = useMemo<[string, unknown][]>(() => [['eventId', eventId], ['status', 'live']], [eventId]);
  const open = useMemo<[string, unknown][]>(() => [['eventId', eventId], ['status', 'published']], [eventId]);
  const a = useCol<PulseDoc>('pulse', live);
  const b = useCol<PulseDoc>('pulse', open);
  return { list: [...a.data, ...b.data], loading: a.loading || b.loading };
}

export function ActivityList({ list }: { list: PulseDoc[] }) {
  return (
    <ul className="ev-activities">
      {list.map((p) => (
        <li key={p.id}>
          <span className={`ev-act-ic ${p.kind}`}>{p.kind === 'survey' ? <ClipboardList size={20} aria-hidden="true" /> : <Radio size={20} aria-hidden="true" />}</span>
          <div><b>{p.title}</b><small className="muted">{p.kind === 'survey' ? 'Survey · answer any time' : 'Live now · follow along on your phone'}</small></div>
          <Link className="btn btn-primary btn-sm" href={p.kind === 'survey' ? `/pulse/survey/${p.id}` : `/pulse/live/${p.id}`}>{p.kind === 'survey' ? 'Answer' : 'Join'}</Link>
        </li>
      ))}
    </ul>
  );
}

/** Card on the event home. Hidden when nothing is running. */
export function ActivitiesCard() {
  const { event } = useEventCtx();
  const { list } = useEventActivities(event.id);
  if (!list.length) return null;
  return (
    <section className="card span-2 ev-act-card">
      <div className="row-between"><h2><Sparkles size={20} aria-hidden="true" /> Happening now</h2><Link className="link" href={`/e/${event.id}/activities`}>All activities</Link></div>
      <ActivityList list={list} />
    </section>
  );
}

export function EventActivities() {
  const { event } = useEventCtx();
  const { list, loading } = useEventActivities(event.id);
  return (
    <div className="stack-lg">
      <h1>Activities</h1>
      <p className="muted">Polls, quizzes, Q&A and surveys from the organisers. Join with one tap, or use the code on the screen at <Link href="/pulse/join">Pulse join</Link>.</p>
      {!loading && !list.length ? <Empty title="Nothing running right now">When the organisers start a poll or open a survey, it appears here.</Empty> : <ActivityList list={list} />}
    </div>
  );
}
