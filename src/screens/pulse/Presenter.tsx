'use client';

import { BarChart3, Check, ChevronLeft, ChevronRight, CircleStop, EyeOff, Lock, Maximize, Pause, Play, Square, Trophy, Unlock, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, QrImage, Spinner, useToast } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { useCol, useDoc } from '../../lib/live';
import { answersFor, endLive, goLive, hideResponse, loadForOwner, moderateQuestion, patchState, publishResults, showSlide, type PulseKey } from '../../lib/pulse/api';
import { leaderboard, summarize, TYPES } from '../../lib/pulse/engine';
import type { PulseDoc, PulseQuestion, PulseResponse, PulseState } from '../../lib/pulse/types';
import { problems, SlideHead } from './Builder';
import { Leaderboard, ResultView } from './questions';
import { pulseJoinUrl } from './share';

export function Presenter() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const nav = useRouter();
  const [p, setP] = useState<PulseDoc | null>(null);
  const [key, setKey] = useState<PulseKey | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState(false);
  const state = useDoc<PulseState>(p ? `pulse/${id}/live/state` : null);
  const st = state.data;
  const live = p?.status === 'live' && st && !st.ended;
  const hasQuiz = !!p?.slides.some((s) => s.type === 'quiz');
  const slide = p && st ? p.slides.find((s) => s.id === st.slideId) : undefined;

  // Quizzes need every answer for the leaderboard; otherwise only the current slide's answers are read.
  const respWhere = useMemo<[string, unknown][]>(() => (hasQuiz ? [] : [['slideId', st?.slideId ?? '']]), [hasQuiz, st?.slideId]);
  const responses = useCol<PulseResponse>(live && slide && TYPES[slide.type].interactive ? `pulse/${id}/responses` : null, respWhere);
  const qaWhere = useMemo<[string, unknown][]>(() => [['slideId', st?.slideId ?? '']], [st?.slideId]);
  const qa = useCol<PulseQuestion>(live && slide?.type === 'qa' ? `pulse/${id}/qa` : null, qaWhere);

  useEffect(() => {
    loadForOwner(id).then((r) => { if (!r) { setMissing(true); return; } setP(r.pulse); setKey(r.key); }).catch(() => setMissing(true));
  }, [id]);

  const current = useMemo(() => (slide ? answersFor(slide.id, responses.data) : []), [slide, responses.data]);
  const summary = useMemo(() => (slide ? summarize(slide, current, st?.reveal ?? []) : { kind: 'none' as const }), [slide, current, st?.reveal]);
  const participants = useMemo(() => new Set(responses.data.map((r) => r.uid)).size, [responses.data]);
  const board10 = useMemo(() => {
    if (!hasQuiz || !p || !key) return [];
    const limits = Object.fromEntries(p.slides.map((s) => [s.id, s.timeLimit]));
    return leaderboard(responses.data.filter((r) => key.answers[r.slideId]), key.answers, key.openedAt, limits, p.anonymous);
  }, [hasQuiz, p, key, responses.data]);

  // Share a summary with phones a little after answers change (one document for everyone to read).
  const last = useRef('');
  useEffect(() => {
    if (!p || !st || !slide || !p.audienceResults || !st.showResults) return;
    const payload = { slideId: slide.id, total: current.length, summary, leaderboard: st.reveal.length ? board10.slice(0, 10).map(({ name, score }) => ({ name, score })) : [] };
    const sig = JSON.stringify(payload);
    if (sig === last.current) return;
    const t = setTimeout(() => { last.current = sig; publishResults(p.id, payload).catch(() => {}); }, 1200);
    return () => clearTimeout(t);
  }, [p, st, slide, current.length, summary, board10]);

  const run = useCallback(async (f: () => Promise<unknown>) => {
    setBusy(true);
    try { await f(); } catch (x) { toast(friendlyError(x), 'err'); }
    setBusy(false);
  }, [toast]);

  const go = useCallback((i: number) => {
    if (!p || !key || i < 0 || i >= p.slides.length) return;
    setBoard(false);
    run(async () => setKey(await showSlide(p, key, i)));
  }, [p, key, run]);

  // Keyboard: arrows move, R results, P pause, F full screen.
  useEffect(() => {
    if (!live || !st) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(st.index + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(st.index - 1);
      if (e.key.toLowerCase() === 'r') run(() => patchState(id, { showResults: !st.showResults }));
      if (e.key.toLowerCase() === 'p') run(() => patchState(id, { paused: !st.paused }));
      if (e.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [live, st, go, run, id]);

  // Quiz: close answers when the timer runs out.
  useEffect(() => {
    if (!st?.closesAt || !st.open) return;
    const ms = Date.parse(st.closesAt) - Date.now();
    const t = setTimeout(() => patchState(id, { open: false }).catch(() => {}), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [st?.closesAt, st?.open, id]);

  if (missing) return <div className="center"><Empty title="Not found">You can only present your own presentations. <Link href="/pulse">Back to Pulse</Link></Empty></div>;
  if (!p || !key || state.loading) return <div className="center"><Spinner /></div>;
  const url = pulseJoinUrl(p.code);
  const host = url.replace(/^https?:\/\//, '').replace(/\/pulse\/join\/.*/, '/pulse/join');

  if (!live) {
    const issues = problems(p);
    return (
      <div className="pl-present pl-present-start">
        <div className="pl-start-card">
          <span className="pl-kicker">Ready to present</span>
          <h1>{p.title}</h1>
          <p>{p.slides.length} slides · {p.access === 'public' ? 'anyone with the code can join' : p.access === 'event' ? 'event attendees only' : 'Google sign-in required'}{p.anonymous ? ' · anonymous' : ''}</p>
          {issues.length > 0 && <p className="error">{issues[0]} <Link href={`/pulse/edit/${p.id}`}>Fix it</Link></p>}
          <div className="row-center">
            <button className="btn btn-lime" disabled={busy || issues.length > 0} onClick={() => run(async () => { setKey(await goLive(p, key)); setP({ ...p, status: 'live' }); })}><Play size={18} /> {st?.ended ? 'Start again' : 'Start presentation'}</button>
            <Link className="btn btn-glass" href={`/pulse/edit/${p.id}`}>Back to editor</Link>
          </div>
          {st?.ended && <p className="muted-light">Starting again keeps all earlier answers.</p>}
        </div>
      </div>
    );
  }
  if (!slide || !st) return <div className="center"><Spinner /></div>;
  const quiz = slide.type === 'quiz';
  const interactive = TYPES[slide.type].interactive;

  return (
    <div className="pl-present">
      <header className="pl-present-top">
        <div className="pl-join-strip">Join at <b>{host}</b> with code <b className="pl-code">{p.code}</b></div>
        <div className="pl-present-qr"><QrImage text={url} size={84} label="QR code to join" /></div>
      </header>

      <main className="pl-present-main">
        <SlideHead slide={slide} big />
        {board ? <div className="pl-present-results"><h2 className="pl-board-title"><Trophy size={26} aria-hidden="true" /> Leaderboard</h2><Leaderboard rows={board10} /></div>
          : slide.type === 'qa' ? <QaPresenter pid={p.id} qs={qa.data} />
            : interactive && st.showResults ? <div className="pl-present-results"><ResultView summary={summary} total={current.length} big />{slide.type === 'open' && <OpenModeration pid={p.id} rows={responses.data.filter((r) => r.slideId === slide.id)} />}</div>
              : interactive ? <div className="pl-count-big"><b>{current.length}</b><span>{current.length === 1 ? 'response' : 'responses'}</span>{st.closesAt && st.open && <Timer until={st.closesAt} />}</div>
                : null}
      </main>

      <footer className="pl-controls" aria-label="Presenter controls">
        <div className="row">
          <button className="pl-ctl" disabled={busy || st.index === 0} onClick={() => go(st.index - 1)} aria-label="Previous slide"><ChevronLeft size={20} /></button>
          <span className="pl-ctl-pos">{st.index + 1} / {p.slides.length}</span>
          <button className="pl-ctl" disabled={busy || st.index === p.slides.length - 1} onClick={() => go(st.index + 1)} aria-label="Next slide"><ChevronRight size={20} /></button>
        </div>
        {interactive && (
          <div className="row">
            <span className="pl-ctl-stat"><Users size={16} aria-hidden="true" /> {slide.type === 'qa' ? qa.data.length : current.length}{hasQuiz ? ` · ${participants} playing` : ''}</span>
            <button className="pl-ctl" disabled={busy} onClick={() => run(() => patchState(id, { open: !st.open, paused: false }))}>{st.open ? <><Lock size={16} /> Close</> : <><Unlock size={16} /> Open</>}</button>
            {st.open && <button className="pl-ctl" disabled={busy} onClick={() => run(() => patchState(id, { paused: !st.paused }))}>{st.paused ? <><Play size={16} /> Resume</> : <><Pause size={16} /> Pause</>}</button>}
            {slide.type !== 'qa' && <button className="pl-ctl" disabled={busy} onClick={() => run(() => patchState(id, { showResults: !st.showResults }))}>{st.showResults ? <><EyeOff size={16} /> Hide results</> : <><BarChart3 size={16} /> Show results</>}</button>}
            {quiz && !st.reveal.length && <button className="pl-ctl pl-ctl-lime" disabled={busy} onClick={() => run(() => patchState(id, { reveal: key.answers[slide.id] ?? [], showResults: true, open: false }))}><Check size={16} /> Reveal answer</button>}
            {hasQuiz && <button className={`pl-ctl${board ? ' on' : ''}`} onClick={() => setBoard(!board)}><Trophy size={16} /> Leaderboard</button>}
          </div>
        )}
        <div className="row">
          <button className="pl-ctl" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} aria-label="Full screen"><Maximize size={16} /></button>
          <button className="pl-ctl pl-ctl-end" disabled={busy} onClick={() => { if (confirm('End the presentation? Answers are kept and you can see them in Results.')) run(async () => { await endLive(id); nav.push(`/pulse/results/${id}`); }); }}><CircleStop size={16} /> End</button>
        </div>
      </footer>
      {st.paused && <div className="pl-paused-flag"><Square size={14} aria-hidden="true" /> Answers paused</div>}
    </div>
  );
}

function Timer({ until }: { until: string }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const f = () => setLeft(Math.max(0, Math.ceil((Date.parse(until) - Date.now() - 1500) / 1000)));
    f();
    const t = setInterval(f, 250);
    return () => clearInterval(t);
  }, [until]);
  return <span className={`pl-timer big${left <= 5 ? ' low' : ''}`} role="timer">{left}s</span>;
}

function QaPresenter({ pid, qs }: { pid: string; qs: PulseQuestion[] }) {
  const sorted = [...qs].filter((q) => !q.hidden).sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes);
  if (!sorted.length) return <p className="pl-waiting">Questions from the audience appear here.</p>;
  return (
    <ul className="pl-qa big">
      {sorted.map((q) => (
        <li key={q.id} className={q.answered ? 'answered' : ''}>
          <span className="pl-vote on"><b>{q.votes}</b></span>
          <div><p>{q.text}</p><small>{q.name || 'Anonymous'}</small></div>
          <div className="pl-mod">
            <button className="pl-ctl" onClick={() => moderateQuestion(pid, q.id, { answered: !q.answered })}><Check size={15} /> {q.answered ? 'Unmark' : 'Answered'}</button>
            <button className="pl-ctl" onClick={() => moderateQuestion(pid, q.id, { hidden: true })} aria-label="Hide question"><X size={15} /></button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OpenModeration({ pid, rows }: { pid: string; rows: PulseResponse[] }) {
  const hidden = rows.filter((r) => r.hidden);
  const [open, setOpen] = useState(false);
  return (
    <details className="pl-moderate" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Moderate answers ({rows.length}{hidden.length ? `, ${hidden.length} hidden` : ''})</summary>
      <ul>
        {rows.map((r) => (
          <li key={r.id}><span>{String(r.value)}</span><button className="pl-ctl" onClick={() => hideResponse(pid, r.id, !r.hidden)}>{r.hidden ? 'Show' : 'Hide'}</button></li>
        ))}
      </ul>
    </details>
  );
}
