'use client';

import { CheckCircle2, ChevronUp, Clock, Radio, Send, Trophy } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Empty, ErrorNote, Spinner } from '../../components/ui';
import { backend } from '../../lib/backend';
import { friendlyError } from '../../lib/format';
import { useCol, useDoc } from '../../lib/live';
import { ask, findPulseByCode, submitAnswer, upvote } from '../../lib/pulse/api';
import { cleanAnswer, TYPES } from '../../lib/pulse/engine';
import type { AnswerValue, PulseLiveResults, PulseQuestion, PulseResponse, PulseState } from '../../lib/pulse/types';
import { SlideHead } from './Builder';
import { ParticipantGate, PulseFrame, type Participant } from './identity';
import { AnswerInput, hasAnswer, Leaderboard, ResultView } from './questions';

/** /pulse/join and /pulse/join/[code] */
export function PulseJoin() {
  const params = useParams<{ code?: string }>();
  const nav = useRouter();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(c: string) {
    setBusy(true); setErr('');
    try {
      const pid = await findPulseByCode(c);
      if (!pid) { setErr('No presentation or survey has that code. Check it and try again.'); setBusy(false); return; }
      const p = await backend.getDoc<{ kind: string }>(`pulse/${pid}`).catch(() => null);
      nav.replace(p?.kind === 'survey' ? `/pulse/survey/${pid}` : `/pulse/live/${pid}`);
    } catch (x) { setErr(friendlyError(x)); setBusy(false); }
  }
  useEffect(() => { if (params.code) go(params.code); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.code]);

  return (
    <PulseFrame>
      <form className="pl-gate card" onSubmit={(e: FormEvent) => { e.preventDefault(); go(code); }}>
        <span className="pl-kicker">Gather Pulse</span>
        <h1>Join with a code</h1>
        <p className="muted">Type the code on the screen, or scan its QR code with your camera.</p>
        <input className="pl-code-input" value={code} maxLength={8} autoFocus autoCapitalize="characters" autoComplete="off" inputMode="text" aria-label="Code" placeholder="ABC123"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block" disabled={busy || code.length < 6}>{busy ? 'Joining…' : 'Join'}</button>
      </form>
    </PulseFrame>
  );
}

/** /pulse/live/[id]: the audience view of a live presentation. */
export function PulseLive() {
  const { id } = useParams<{ id: string }>();
  return <ParticipantGate id={id}>{(pt) => <LiveView pt={pt} />}</ParticipantGate>;
}

function LiveView({ pt }: { pt: Participant }) {
  const { pulse: p, me, slides } = pt;
  const state = useDoc<PulseState>(`pulse/${p.id}/live/state`);
  const st = state.data;
  const slide = slides.find((s) => s.id === st?.slideId);
  const mine = useDoc<PulseResponse>(slide && TYPES[slide.type].interactive && slide.type !== 'qa' ? `pulse/${p.id}/responses/${slide.id}_${me.uid}` : null);
  const results = useDoc<PulseLiveResults>(st?.showResults && p.audienceResults ? `pulse/${p.id}/live/results` : null);

  if (state.loading) return <PulseFrame title={p.title}><Spinner /></PulseFrame>;
  if (!st || p.status === 'closed' || st.ended) {
    return <PulseFrame title={p.title}><Empty title={st?.ended || p.status === 'closed' ? 'That’s a wrap' : 'Waiting to start'}>{st?.ended || p.status === 'closed' ? 'This presentation has ended. Thanks for taking part!' : 'The presenter hasn’t started yet. This page updates by itself.'}</Empty></PulseFrame>;
  }
  if (!slide) return <PulseFrame title={p.title}><Empty title="Hang on">The presenter is moving to the next slide…</Empty></PulseFrame>;

  const showRes = st.showResults && p.audienceResults && results.data?.slideId === slide.id;
  return (
    <PulseFrame title={p.title}>
      <div className="pl-live" aria-live="polite">
        <div className="pl-live-meta"><span className="pill pl-status-live"><Radio size={13} aria-hidden="true" /> Live</span><span className="muted">{st.index + 1} / {slides.length}</span></div>
        <SlideHead slide={slide} />
        {slide.type === 'qa' ? <QaAudience pt={pt} slideId={slide.id} open={st.open && !st.paused} />
          : !TYPES[slide.type].interactive ? null
            : <Answering key={slide.id} pt={pt} slideId={slide.id} st={st} mine={mine.data} loading={mine.loading} />}
        {showRes && results.data && results.data.summary.kind !== 'none' && (
          <section className="pl-live-results" aria-label="Results">
            <h3>Results</h3>
            <ResultView summary={results.data.summary} total={results.data.total} />
            {slide.type === 'quiz' && st.reveal.length > 0 && <QuizVerdict mine={mine.data} reveal={st.reveal} />}
            {slide.type === 'quiz' && results.data.leaderboard.length > 0 && <><h3><Trophy size={18} aria-hidden="true" /> Leaderboard</h3><Leaderboard rows={results.data.leaderboard} /></>}
          </section>
        )}
      </div>
    </PulseFrame>
  );
}

function QuizVerdict({ mine, reveal }: { mine: PulseResponse | null; reveal: string[] }) {
  if (!mine) return <p className="pl-verdict">You didn’t answer this one.</p>;
  const picked = Array.isArray(mine.value) ? mine.value.map(String) : [];
  const right = picked.length === reveal.length && picked.every((x) => reveal.includes(x));
  return <p className={`pl-verdict ${right ? 'right' : 'wrong'}`}>{right ? 'Correct! Nice one.' : 'Not this time.'}</p>;
}

function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((Date.parse(until) - Date.now() - 1500) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((Date.parse(until) - Date.now() - 1500) / 1000))), 250);
    return () => clearInterval(t);
  }, [until]);
  return <span className={`pl-timer${left <= 5 ? ' low' : ''}`} role="timer"><Clock size={16} aria-hidden="true" /> {left}s</span>;
}

function Answering({ pt, slideId, st, mine, loading }: { pt: Participant; slideId: string; st: PulseState; mine: PulseResponse | null; loading: boolean }) {
  const slide = pt.slides.find((s) => s.id === slideId)!;
  const [value, setValue] = useState<AnswerValue | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  useEffect(() => {
    if (!st.closesAt) { setTimeUp(false); return; }
    const ms = Date.parse(st.closesAt) - Date.now() - 1500;
    if (ms <= 0) { setTimeUp(true); return; }
    const t = setTimeout(() => setTimeUp(true), ms);
    return () => clearTimeout(t);
  }, [st.closesAt]);
  const accepting = st.open && !st.paused && !timeUp;
  const quiz = slide.type === 'quiz';

  async function send() {
    const c = cleanAnswer(slide, value ?? (slide.type === 'ranking' ? slide.options.map((o) => o.id) : undefined));
    if ('error' in c) { setErr(c.error); return; }
    setBusy(true); setErr('');
    try { await submitAnswer(pt.pulse, slide.id, pt.me.uid, pt.name, c.value, pt.k); setEditing(false); }
    catch (x) { setErr(/permission/i.test(String(x)) ? 'Answers for this question have closed.' : friendlyError(x)); }
    setBusy(false);
  }

  if (loading) return <Spinner />;
  if (mine && !editing) {
    return (
      <div className="pl-done">
        <CheckCircle2 size={34} aria-hidden="true" />
        <b>Answer sent</b>
        <span className="muted">Watch the screen for results.</span>
        {accepting && !quiz && <button className="link" onClick={() => { setValue(mine.value); setEditing(true); }}>Change my answer</button>}
      </div>
    );
  }
  if (!accepting) return <div className="pl-done muted"><b>{st.paused ? 'Answers are paused' : timeUp ? 'Time’s up' : 'Answers are closed'}</b><span>{st.paused ? 'The presenter will resume in a moment.' : 'Wait for the next question.'}</span></div>;
  return (
    <div className="stack">
      {quiz && st.closesAt && <Countdown until={st.closesAt} />}
      <AnswerInput slide={slide} value={value} onChange={setValue} disabled={busy} />
      <ErrorNote text={err} />
      <button className="btn btn-primary btn-block" disabled={busy || !hasAnswer(slide, value)} onClick={send}><Send size={17} /> {busy ? 'Sending…' : 'Send'}</button>
    </div>
  );
}

function QaAudience({ pt, slideId, open }: { pt: Participant; slideId: string; open: boolean }) {
  const where = useMemo<[string, unknown][]>(() => [['slideId', slideId], ['hidden', false]], [slideId]);
  const qs = useCol<PulseQuestion>(`pulse/${pt.pulse.id}/qa`, where);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mineCount = qs.data.filter((q) => q.uid === pt.me.uid).length;
  const sorted = [...qs.data].sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || (a.at ?? '').localeCompare(b.at ?? ''));

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (mineCount >= 5) { setErr('You can ask up to 5 questions.'); return; }
    setBusy(true); setErr('');
    // Find a free slot: each person has 5 question slots.
    const used = new Set(qs.data.filter((q) => q.uid === pt.me.uid).map((q) => q.id));
    const n = [1, 2, 3, 4, 5].find((i) => !used.has(`${pt.me.uid}_${i}`)) ?? 5;
    try { await ask(pt.pulse, slideId, pt.me.uid, pt.name, text, n, pt.k); setText(''); }
    catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }
  return (
    <div className="stack">
      {open ? (
        <form className="stack" onSubmit={send}>
          <textarea rows={3} maxLength={280} value={text} placeholder="Ask a question" aria-label="Your question" onChange={(e) => setText(e.target.value)} />
          <ErrorNote text={err} />
          <button className="btn btn-primary btn-block" disabled={busy || !text.trim()}><Send size={17} /> {busy ? 'Sending…' : 'Send question'}</button>
        </form>
      ) : <p className="muted">Questions are closed right now.</p>}
      <ul className="pl-qa">
        {sorted.map((q) => {
          const voted = q.voters.includes(pt.me.uid) || q.uid === pt.me.uid;
          return (
            <li key={q.id} className={q.answered ? 'answered' : ''}>
              <button className={`pl-vote${voted ? ' on' : ''}`} disabled={voted} aria-label={`Upvote: ${q.text}`} onClick={() => upvote(pt.pulse.id, q.id, pt.me.uid).catch(() => {})}><ChevronUp size={18} /><b>{q.votes}</b></button>
              <div><p>{q.text}</p><small className="muted">{q.answered ? 'Answered' : q.name || 'Anonymous'}</small></div>
            </li>
          );
        })}
        {!sorted.length && <li className="muted">No questions yet. Be the first!</li>}
      </ul>
    </div>
  );
}
