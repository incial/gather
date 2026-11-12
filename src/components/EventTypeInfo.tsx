'use client';

import { shownDetails, typeInfo } from '../lib/eventTypes';
import type { EventDoc } from '../lib/types';

/** "🛠️ Workshop" chip for an event, or nothing for older events without a type. */
export function TypeChip({ event }: { event: Pick<EventDoc, 'eventType'> }) {
  const t = typeInfo(event.eventType);
  return t ? <span className="type-chip"><span aria-hidden="true">{t.emoji}</span> {t.label}</span> : null;
}

/** The answers to the event type's questions (trainer, prizes, team size…), only those filled in. */
export function TypeDetails({ event, className = '' }: { event: Pick<EventDoc, 'eventType' | 'typeDetails'>; className?: string }) {
  const t = typeInfo(event.eventType);
  const rows = shownDetails(event.eventType, event.typeDetails);
  if (!t || !rows.length) return null;
  return (
    <section className={`card type-card ${className}`}>
      <h2><span aria-hidden="true">{t.emoji}</span> {t.label} details</h2>
      <dl className="type-details">{rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
    </section>
  );
}
