'use client';

import { useState, type FormEvent } from 'react';
import { confetti, Empty, ErrorNote, Field, Icon, Modal, SpeakerChip, StarRow, useToast } from '../../components/ui';
import { checkIn } from '../../lib/api';
import { fmtDay, fmtTime, friendlyError } from '../../lib/format';
import { canRate, KIND_ICON, KIND_LABEL } from '../../lib/session';
import type { SessionDoc } from '../../lib/types';
import { useEventCtx } from './context';
import { RateModal } from './RateModal';
import { ScheduleFiles } from '../../components/EventMedia';

export function Schedule() {
  const { event, sessions, speakers, attendance, sessionFeedback } = useEventCtx();
  const [codeFor, setCodeFor] = useState<SessionDoc | null>(null);
  const [rateFor, setRateFor] = useState<SessionDoc | null>(null);
  const attended = new Set(attendance.map((a) => a.sessionId));
  const byDay = new Map<string, SessionDoc[]>();
  for (const s of sessions) {
    const d = fmtDay(s.startsAt);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  if (!sessions.length) return <div className="stack-lg"><h1>Schedule</h1><ScheduleFiles eventId={event.id} /><Empty title="Sessions coming soon">The organisers haven’t added the session list yet.</Empty></div>;
  return (
    <div className="stack-lg">
      <h1>Schedule</h1>
      <ScheduleFiles eventId={event.id} />
      {[...byDay].map(([day, list]) => (
        <section key={day}>
          <h2 className="day-head">{day}</h2>
          <ol className="timeline">
            {list.map((s) => {
              const done = attended.has(s.id);
              const kind = s.kind ?? 'talk';
              const mine = sessionFeedback.find((f) => f.sessionId === s.id);
              return (
                <li key={s.id} className={done ? 'slot slot-done' : 'slot'}>
                  <time>{fmtTime(s.startsAt)}<small>{fmtTime(s.endsAt)}</small></time>
                  <div className="slot-card">
                    <span className={`kind kind-${kind}`}><Icon name={KIND_ICON[kind]} size={14} /> {KIND_LABEL[kind]}</span>
                    <h3>{s.title}</h3>
                    {s.room && <p className="muted">{s.room}</p>}
                    {s.description && <p>{s.description}</p>}
                    <div className="chips">
                      {s.speakerIds.map((id) => speakers.find((x) => x.id === id)).filter((x) => !!x).map((x) => (
                        <SpeakerChip key={x.id} id={x.id} name={x.name} photo={x.photo} href={`/e/${event.id}/speakers/${x.id}`} />
                      ))}
                    </div>
                    <div className="slot-actions">
                      {kind !== 'break' && (done
                        ? <span className="pill pill-done"><Icon name="check" size={13} /> Checked in</span>
                        : <button className="link" onClick={() => setCodeFor(s)}>Can’t scan? Enter the code</button>)}
                      {canRate(s) && (mine
                        ? <button className="rated" onClick={() => setRateFor(s)} aria-label={`Your rating: ${mine.rating} out of 5. Edit`}><StarRow value={mine.rating} /></button>
                        : <button className="btn btn-primary btn-sm" onClick={() => setRateFor(s)}><Icon name="star" size={15} /> Rate session</button>)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {codeFor && <CodeModal session={codeFor} onClose={() => setCodeFor(null)} />}
      {rateFor && <RateModal session={rateFor} onClose={() => setRateFor(null)} />}
    </div>
  );
}

function CodeModal({ session, onClose }: { session: SessionDoc; onClose: () => void }) {
  const { event, me } = useEventCtx();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const r = await checkIn(event.id, session.id, me, code);
      if (r === 'expired') { setErr('That code isn’t valid. Codes change every 30 seconds, so check the screen again.'); return; }
      if (r === 'ok') confetti();
      toast(r === 'ok' ? 'You’re checked in!' : 'You were already checked in.');
      onClose();
    } catch (x) { setErr(friendlyError(x)); }
  }
  return (
    <Modal title="Enter check-in code" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">The code is on the screen in the room, under the QR.</p>
        <Field label={session.title}>
          <input className="mono-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} autoFocus autoCapitalize="characters" autoComplete="off" />
        </Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block" disabled={code.length !== 6}>Check in</button>
      </form>
    </Modal>
  );
}
