'use client';

import { CheckCircle2, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Empty, ErrorNote, Spinner } from '../../components/ui';
import { backend } from '../../lib/backend';
import { friendlyError } from '../../lib/format';
import { markStart, submitSurvey } from '../../lib/pulse/api';
import { cleanAnswer, TYPES, visibleSlides } from '../../lib/pulse/engine';
import type { AnswerValue, PulseSubmission } from '../../lib/pulse/types';
import { SlideHead } from './Builder';
import { ParticipantGate, PulseFrame, type Participant } from './identity';
import { AnswerInput, hasAnswer } from './questions';

/** /pulse/survey/[id] */
export function SurveyTake() {
  const { id } = useParams<{ id: string }>();
  return <ParticipantGate id={id}>{(pt) => <Survey pt={pt} />}</ParticipantGate>;
}

const draftKey = (id: string, uid: string) => `pulse-draft-${id}-${uid}`;

function Survey({ pt }: { pt: Participant }) {
  const { pulse: p, me } = pt;
  const [already, setAlready] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => {
    try { return JSON.parse(localStorage.getItem(draftKey(p.id, me.uid)) ?? '{}'); } catch { return {}; }
  });
  const [step, setStep] = useState(p.survey.welcome ? -1 : 0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    backend.getDoc<PulseSubmission>(`pulse/${p.id}/submissions/${me.uid}`).then((s) => setAlready(!!s)).catch(() => setAlready(false));
  }, [p.id, me.uid]);
  useEffect(() => { if (already === false && p.status === 'published') markStart(p.id, me.uid); }, [already, p.id, p.status, me.uid]);
  // Answers so far are kept on this device, so a refresh or a lost connection doesn't lose them.
  useEffect(() => { try { localStorage.setItem(draftKey(p.id, me.uid), JSON.stringify(answers)); } catch { /* full */ } }, [answers, p.id, me.uid]);

  const questions = useMemo(() => visibleSlides(pt.slides, answers), [pt.slides, answers]);
  const now = Date.now();
  if (already === null) return <PulseFrame title={p.title}><Spinner /></PulseFrame>;
  if (done || already) {
    return <PulseFrame title={p.title}><div className="pl-gate card pl-thanks"><CheckCircle2 size={44} aria-hidden="true" /><h1>{done ? 'Thank you!' : 'You’ve already responded'}</h1><p>{done ? p.survey.thanks || 'Your response has been recorded.' : 'Each person can answer once. Thanks for taking part.'}</p></div></PulseFrame>;
  }
  if (p.status === 'closed') return <PulseFrame title={p.title}><Empty title="This survey is closed">It isn’t accepting responses any more.</Empty></PulseFrame>;
  if (p.status !== 'published') return <PulseFrame title={p.title}><Empty title="Not open yet">This survey hasn’t been published.</Empty></PulseFrame>;
  if (p.survey.opensAt && Date.parse(p.survey.opensAt) > now) return <PulseFrame title={p.title}><Empty title="Opens soon">This survey opens on {new Date(p.survey.opensAt).toLocaleString()}.</Empty></PulseFrame>;
  if (p.survey.closesAt && Date.parse(p.survey.closesAt) <= now) return <PulseFrame title={p.title}><Empty title="This survey has closed">It stopped taking responses on {new Date(p.survey.closesAt).toLocaleString()}.</Empty></PulseFrame>;

  const check = (list: typeof questions) => {
    for (const s of list) {
      if (!TYPES[s.type].interactive) continue;
      const v = answers[s.id];
      if (!hasAnswer(s, v)) { if (s.required) return `“${s.title}” needs an answer.`; continue; }
      const c = cleanAnswer(s, v);
      if ('error' in c) return `${s.title}: ${c.error}`;
    }
    return '';
  };

  async function submit() {
    const problem = check(questions);
    if (problem) { setErr(problem); return; }
    const clean: Record<string, AnswerValue> = {};
    for (const s of questions) {
      if (!TYPES[s.type].interactive) continue;
      const raw = answers[s.id] ?? (s.type === 'ranking' && s.required ? s.options.map((o) => o.id) : undefined);
      if (raw === undefined || !hasAnswer(s, raw)) continue;
      const c = cleanAnswer(s, raw);
      if ('value' in c) clean[s.id] = c.value;
    }
    setBusy(true); setErr('');
    try {
      await submitSurvey(p, me.uid, pt.name, me.guest ? '' : me.email, clean, pt.k);
      try { localStorage.removeItem(draftKey(p.id, me.uid)); } catch { /* fine */ }
      setDone(true);
    } catch (x) {
      setErr(/permission/i.test(String(x)) ? 'This survey isn’t accepting responses now. It may have closed or reached its limit.' : friendlyError(x));
    }
    setBusy(false);
  }

  if (step === -1) {
    return (
      <PulseFrame title={p.title}>
        <div className="pl-gate card">
          <span className="pl-kicker">Survey</span>
          <h1>{p.title}</h1>
          {p.description && <p>{p.description}</p>}
          <p className="pl-welcome">{p.survey.welcome}</p>
          <p className="muted">{questions.filter((q) => TYPES[q.type].interactive).length} questions{p.anonymous ? ' · anonymous' : ''}</p>
          <button className="btn btn-primary btn-block" onClick={() => setStep(0)}>Start <ChevronRight size={17} /></button>
        </div>
      </PulseFrame>
    );
  }

  const field = (s: (typeof questions)[number]) => (
    <section key={s.id} className="pl-survey-q">
      <SlideHead slide={s} />
      {s.required && <small className="pl-req">Required</small>}
      {TYPES[s.type].interactive && <AnswerInput slide={s} value={answers[s.id]} onChange={(v) => setAnswers({ ...answers, [s.id]: v })} disabled={busy} />}
    </section>
  );

  if (!p.survey.oneByOne) {
    return (
      <PulseFrame title={p.title}>
        <div className="pl-survey">
          <h1>{p.title}</h1>
          {p.description && <p className="muted">{p.description}</p>}
          {questions.map(field)}
          <ErrorNote text={err} />
          <button className="btn btn-primary btn-block" disabled={busy} onClick={submit}><Send size={17} /> {busy ? 'Sending…' : 'Submit'}</button>
        </div>
      </PulseFrame>
    );
  }

  const i = Math.min(step, questions.length - 1);
  const s = questions[i];
  const last = i === questions.length - 1;
  const next = () => {
    const problem = check([s]);
    if (problem) { setErr(problem); return; }
    setErr(''); setStep(i + 1);
  };
  return (
    <PulseFrame title={p.title}>
      <div className="pl-survey">
        <div className="pl-progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={i + 1} aria-label="Progress"><i style={{ width: `${((i + 1) / questions.length) * 100}%` }} /></div>
        <small className="muted">Question {i + 1} of {questions.length}</small>
        {field(s)}
        <ErrorNote text={err} />
        <div className="row-between">
          <button className="btn btn-ghost" disabled={i === 0 || busy} onClick={() => { setErr(''); setStep(i - 1); }}><ChevronLeft size={17} /> Back</button>
          {last ? <button className="btn btn-primary" disabled={busy} onClick={submit}><Send size={17} /> {busy ? 'Sending…' : 'Submit'}</button>
            : <button className="btn btn-primary" onClick={next}>{!s.required && !hasAnswer(s, answers[s.id]) && TYPES[s.type].interactive ? 'Skip' : 'Next'} <ChevronRight size={17} /></button>}
        </div>
      </div>
    </PulseFrame>
  );
}
