'use client';

import { ChevronLeft, Download, Pencil, RefreshCw, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DemoBanner, Empty, Spinner, useToast } from '../../components/ui';
import { backend } from '../../lib/backend';
import { downloadCsv, type Row } from '../../lib/csv';
import { slug } from '../../lib/exports';
import { fmtDateTime, friendlyError } from '../../lib/format';
import { answersFor, loadForOwner, surveyAnswers, type PulseKey } from '../../lib/pulse/api';
import { formatAnswer, leaderboard, summarize, TYPES } from '../../lib/pulse/engine';
import type { PulseDoc, PulseQuestion, PulseResponse, PulseSubmission } from '../../lib/pulse/types';
import { PulseTop, STATUS_LABEL } from './PulseHome';
import { Leaderboard, ResultView } from './questions';
import { TypeIcon } from './icons';

interface Data { responses: PulseResponse[]; subs: PulseSubmission[]; qa: PulseQuestion[]; starts: number; eligible: number | null }

export function Results() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [p, setP] = useState<PulseDoc | null>(null);
  const [key, setKey] = useState<PulseKey | null>(null);
  const [d, setD] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Results are read once and refreshed on demand, instead of a live listener on every answer.
  const load = useCallback(async (pulse: PulseDoc) => {
    setLoading(true);
    try {
      const base = `pulse/${pulse.id}`;
      const survey = pulse.kind === 'survey';
      const [responses, subs, qa, starts, eligible] = await Promise.all([
        survey ? Promise.resolve([]) : backend.getCol<PulseResponse>(`${base}/responses`),
        survey ? backend.getCol<PulseSubmission>(`${base}/submissions`) : Promise.resolve([]),
        pulse.slides.some((s) => s.type === 'qa') ? backend.getCol<PulseQuestion>(`${base}/qa`) : Promise.resolve([]),
        survey ? backend.count(`${base}/starts`) : Promise.resolve(0),
        pulse.eventId ? backend.count(`events/${pulse.eventId}/attendees`).catch(() => null) : Promise.resolve(null),
      ]);
      setD({ responses, subs, qa, starts, eligible });
    } catch (x) { toast(friendlyError(x), 'err'); }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadForOwner(id).then((r) => { if (!r) { setMissing(true); return; } setP(r.pulse); setKey(r.key); load(r.pulse); }).catch(() => setMissing(true));
  }, [id, load]);

  const survey = p?.kind === 'survey';
  const participants = useMemo(() => (!d ? 0 : survey ? d.subs.length : new Set([...d.responses.map((r) => r.uid), ...d.qa.map((q) => q.uid)]).size), [d, survey]);
  const answerCount = d ? (survey ? d.subs.reduce((a, s) => a + Object.keys(s.answers ?? {}).length, 0) : d.responses.length + d.qa.length) : 0;
  const board = useMemo(() => {
    if (!p || !key || !d || !p.slides.some((s) => s.type === 'quiz')) return [];
    return leaderboard(d.responses.filter((r) => key.answers[r.slideId]), key.answers, key.openedAt, Object.fromEntries(p.slides.map((s) => [s.id, s.timeLimit])), p.anonymous);
  }, [p, key, d]);

  if (missing) return <div className="center"><Empty title="Not found">Only the creator can see these results. <Link href="/pulse">Back to Pulse</Link></Empty></div>;
  if (!p || !key) return <div className="center"><Spinner /></div>;

  function exportCsv() {
    if (!p || !d) return;
    const qs = p.slides.filter((s) => TYPES[s.type].interactive && s.type !== 'qa');
    const cols = [...(p.anonymous ? [] : ['Name', ...(survey ? ['Email'] : [])]), 'Submitted', ...qs.map((s, i) => `Q${i + 1}. ${s.title}`)];
    let rows: Row[];
    if (survey) {
      rows = d.subs.map((s) => ({ ...(p.anonymous ? {} : { Name: s.name, Email: s.email }), Submitted: fmtDateTime(s.at), ...Object.fromEntries(qs.map((q, i) => [`Q${i + 1}. ${q.title}`, formatAnswer(q, s.answers?.[q.id])])) }));
    } else {
      // One row per person, one column per question.
      const people = new Map<string, Row>();
      for (const r of d.responses) {
        const row = people.get(r.uid) ?? { ...(p.anonymous ? {} : { Name: r.name || 'Guest' }), Submitted: fmtDateTime(r.at) };
        const qi = qs.findIndex((q) => q.id === r.slideId);
        if (qi >= 0) row[`Q${qi + 1}. ${qs[qi].title}`] = formatAnswer(qs[qi], r.value);
        people.set(r.uid, row);
      }
      rows = [...people.values()];
    }
    downloadCsv(`${slug(p.title)}-responses.csv`, rows, cols);
    if (d.qa.length) {
      downloadCsv(`${slug(p.title)}-questions.csv`, d.qa.map((q) => ({ Question: q.text, Votes: q.votes, Answered: q.answered ? 'Yes' : 'No', Hidden: q.hidden ? 'Yes' : 'No', ...(p.anonymous ? {} : { Name: q.name }), Asked: fmtDateTime(q.at) })), ['Question', 'Votes', 'Answered', 'Hidden', ...(p.anonymous ? [] : ['Name']), 'Asked']);
    }
  }

  return (
    <div className="pl">
      <DemoBanner />
      <PulseTop />
      <main className="pl-main">
        <div className="row-between">
          <div>
            <Link href="/pulse" className="pl-back"><ChevronLeft size={16} /> All activities</Link>
            <h1>{p.title}</h1>
            <p className="muted">{survey ? 'Survey' : 'Presentation'} · {STATUS_LABEL[p.status]}{p.eventTitle ? ` · ${p.eventTitle}` : ''}{p.anonymous ? ' · anonymous' : ''}</p>
          </div>
          <div className="row">
            <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => load(p)}><RefreshCw size={15} /> {loading ? 'Loading…' : 'Refresh'}</button>
            <Link className="btn btn-ghost btn-sm" href={`/pulse/edit/${p.id}`}><Pencil size={15} /> Edit</Link>
            <button className="btn btn-ink btn-sm" disabled={!d || !participants} onClick={exportCsv}><Download size={15} /> Export CSV</button>
          </div>
        </div>

        {!d ? <Spinner /> : (
          <>
            <div className="stat-row">
              <div className="stat"><span>Participants</span><b>{participants}</b><small>{p.anonymous ? 'anonymous' : 'people who answered'}</small></div>
              <div className="stat"><span>Answers</span><b>{answerCount}</b><small>across {p.slides.filter((s) => TYPES[s.type].interactive).length} questions</small></div>
              {survey && <div className="stat"><span>Completion</span><b>{d.starts ? `${Math.min(100, Math.round((d.subs.length / d.starts) * 100))}%` : '–'}</b><small>{d.subs.length} of {d.starts} who opened it</small></div>}
              {d.eligible !== null && <div className="stat"><span>Response rate</span><b>{d.eligible ? `${Math.min(100, Math.round((participants / d.eligible) * 100))}%` : '–'}</b><small>of {d.eligible} event attendees</small></div>}
              {survey && p.survey.limit > 0 && <div className="stat"><span>Limit</span><b>{p.survey.limit}</b><small>{Math.max(0, p.survey.limit - d.subs.length)} left</small></div>}
            </div>

            {board.length > 0 && <section className="panel"><h2><Trophy size={20} aria-hidden="true" /> Quiz leaderboard</h2><Leaderboard rows={board} /></section>}

            {p.slides.map((s, i) => {
              if (!TYPES[s.type].interactive) return null;
              if (s.type === 'qa') {
                const qs = d.qa.filter((q) => q.slideId === s.id).sort((a, b) => b.votes - a.votes);
                return (
                  <section key={s.id} className="panel pl-result-block">
                    <h2><TypeIcon type={s.type} /> {i + 1}. {s.title}</h2>
                    <p className="muted">{qs.length} questions</p>
                    <ul className="pl-qa">{qs.map((q) => <li key={q.id} className={q.answered ? 'answered' : ''}><span className="pl-vote on"><b>{q.votes}</b></span><div><p>{q.text}</p><small className="muted">{q.hidden ? 'Hidden · ' : ''}{q.answered ? 'Answered · ' : ''}{p.anonymous ? '' : q.name || 'Guest'}</small></div></li>)}</ul>
                  </section>
                );
              }
              const answers = survey ? surveyAnswers(s.id, d.subs) : answersFor(s.id, d.responses);
              const summary = summarize(s, answers, s.type === 'quiz' ? key.answers[s.id] ?? [] : []);
              return (
                <section key={s.id} className="panel pl-result-block">
                  <h2><TypeIcon type={s.type} /> {i + 1}. {s.title}</h2>
                  <p className="muted">{answers.length} {answers.length === 1 ? 'response' : 'responses'}{s.condition ? ' · conditional question' : ''}</p>
                  <ResultView summary={summary} total={answers.length} />
                  {!p.anonymous && answers.length > 0 && s.type !== 'open' && (
                    <details className="pl-individual"><summary>Individual answers</summary>
                      <table className="table"><thead><tr><th>Name</th><th>Answer</th></tr></thead>
                        <tbody>{answers.map((a) => <tr key={a.id}><td>{a.name || 'Guest'}</td><td>{formatAnswer(s, a.value)}</td></tr>)}</tbody></table>
                    </details>
                  )}
                </section>
              );
            })}
            {!participants && <Empty title="No responses yet">{survey ? 'Share the survey link to start collecting answers.' : 'Present it and ask your audience to join with the code.'}</Empty>}
          </>
        )}
      </main>
    </div>
  );
}
