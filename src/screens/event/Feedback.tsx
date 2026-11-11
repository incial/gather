'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Avatar, confetti, Empty, ErrorNote, Icon, StarRow, Stars } from '../../components/ui';
import { saveFeedback } from '../../lib/api';
import { fmtDate, fmtTime, friendlyError } from '../../lib/format';
import { canRate, KIND_ICON } from '../../lib/session';
import type { SessionDoc } from '../../lib/types';
import { useEventCtx } from './context';
import { RateModal } from './RateModal';

export function Feedback() {
  const { event, sessions, sessionFeedback } = useEventCtx();
  const wantOverall = useSearchParams().get('tab') === 'overall';
  const [tab, setTab] = useState<'sessions' | 'overall'>(wantOverall ? 'overall' : 'sessions');
  const [rateFor, setRateFor] = useState<SessionDoc | null>(null);
  const list = sessions.filter((s) => s.feedbackOn !== false);
  const open = list.filter((s) => canRate(s));
  const later = list.filter((s) => !canRate(s));
  const mine = (id: string) => sessionFeedback.find((f) => f.sessionId === id);
  return (
    <div className="stack-lg">
      <div>
        <h1>Feedback</h1>
        <p className="muted">Rate each session, then tell us about {event.title} overall.</p>
      </div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}>Sessions</button>
        <button role="tab" aria-selected={tab === 'overall'} className={tab === 'overall' ? 'on' : ''} onClick={() => setTab('overall')}>Overall event</button>
      </div>
      {tab === 'overall' ? <OverallFeedback /> : !list.length ? <Empty title="Nothing to rate yet">Sessions with feedback will show here.</Empty> : (
        <div className="stack">
          {open.map((s) => {
            const f = mine(s.id);
            const kind = s.kind ?? 'talk';
            return (
              <button key={s.id} className="rate-row-card card" onClick={() => setRateFor(s)}>
                <span className={`kind-icon kind-${kind}`}><Icon name={KIND_ICON[kind]} size={20} /></span>
                <span className="grow"><b>{s.title}</b><small>{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)}</small></span>
                {f ? <StarRow value={f.rating} /> : <span className="pill">Rate</span>}
              </button>
            );
          })}
          {later.length > 0 && <h2 className="later-head">Opens when the session starts</h2>}
          {later.map((s) => {
            const kind = s.kind ?? 'talk';
            return (
              <div key={s.id} className="rate-row-card card rate-later">
                <span className={`kind-icon kind-${kind}`}><Icon name={KIND_ICON[kind]} size={20} /></span>
                <span className="grow"><b>{s.title}</b><small>{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)}</small></span>
                <Icon name="clock" size={18} />
              </div>
            );
          })}
        </div>
      )}
      {rateFor && <RateModal session={rateFor} onClose={() => setRateFor(null)} />}
    </div>
  );
}

function OverallFeedback() {
  const { event, me, speakers, feedback } = useEventCtx();
  const [answers, setAnswers] = useState<Record<string, string | number>>(feedback?.answers ?? {});
  const [ratings, setRatings] = useState<Record<string, number>>(feedback?.speakerRatings ?? {});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!event.feedbackOpen) {
    return <Empty title={feedback ? 'Thanks for your feedback!' : 'Feedback isn’t open yet'}>{feedback ? 'Feedback has now closed.' : 'The organisers will open it during the event.'}</Empty>;
  }
  if (done) {
    return (
      <div className="thanks">
        <div className="big-stamp">THANK<br />YOU</div>
        <h1>That really helps.</h1>
        <p className="muted">Your feedback stamp is in your passport.</p>
        <Link href={`/e/${event.id}/pass`} className="btn btn-primary">See my passport</Link>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = event.questions.find((q) => q.required && !answers[q.id]);
    if (missing) { setErr(`Please answer: ${missing.label}`); return; }
    setErr(''); setBusy(true);
    try { await saveFeedback(event.id, me, answers, ratings); confetti(); setDone(true); }
    catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }

  return (
    <form className="stack-lg" onSubmit={submit}>
      <p className="muted">The organisers see your name with your answers.</p>
      {event.questions.map((q) => (
        <fieldset key={q.id} className="q-card">
          <legend>{q.label}{q.required && <span className="req" aria-hidden="true"> *</span>}</legend>
          {q.type === 'rating' && <Stars label={q.label} value={Number(answers[q.id] ?? 0)} onChange={(n) => setAnswers({ ...answers, [q.id]: n })} />}
          {q.type === 'text' && <textarea rows={3} aria-label={q.label} value={String(answers[q.id] ?? '')} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
          {q.type === 'choice' && (
            <div className="choices">
              {(q.options ?? []).map((o) => (
                <button type="button" key={o} className={answers[q.id] === o ? 'choice on' : 'choice'} aria-pressed={answers[q.id] === o} onClick={() => setAnswers({ ...answers, [q.id]: o })}>{o}</button>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      {speakers.length > 0 && (
        <fieldset className="q-card">
          <legend>Rate the speakers</legend>
          <div className="stack">
            {speakers.map((s) => (
              <div key={s.id} className="rate-row">
                <Avatar id={s.id} name={s.name} photo={s.photo} size={40} />
                <b>{s.name}</b>
                <Stars label={`Rate ${s.name}`} value={ratings[s.id] ?? 0} onChange={(n) => setRatings({ ...ratings, [s.id]: n })} />
              </div>
            ))}
          </div>
        </fieldset>
      )}
      <ErrorNote text={err} />
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : feedback ? 'Update feedback' : 'Send feedback'}</button>
    </form>
  );
}
