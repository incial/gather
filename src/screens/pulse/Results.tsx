'use client';

import { ChevronLeft, Download, Pencil, RefreshCw, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DemoBanner, Empty, Spinner, useToast } from '../../components/ui';
import { downloadCsv, type Row } from '../../lib/csv';
import { slug } from '../../lib/exports';
import { fmtDateTime, friendlyError } from '../../lib/format';
import { formatAnswer, TYPES } from '../../lib/pulse/engine';
import type { PulseQuestion, PulseResponse, PulseSubmission } from '../../lib/pulse/types';
import { ApiError, fetchPulseExport, fetchPulseResults, useSummary } from '../../lib/summaries';
import { PulseTop, STATUS_LABEL } from './PulseHome';
import { Leaderboard, ResultView } from './questions';
import { TypeIcon } from './icons';

export function Results() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  // The server reads the answers and works out every chart, the leaderboard and the totals; this page only
  // receives those. Refreshed on demand, not a live listener on every answer.
  const res = useSummary(`pulse-results|${id}`, () => fetchPulseResults(id));
  const d = res.data;
  const [exporting, setExporting] = useState(false);

  if (res.error && !d) {
    const status = res.error instanceof ApiError ? res.error.status : 0;
    if (status === 403 || status === 404) return <div className="center"><Empty title="Not found">Only the creator can see these results. <Link href="/pulse">Back to Pulse</Link></Empty></div>;
    return <div className="center"><Empty title="Couldn’t load the results">{friendlyError(res.error)} <button className="link" onClick={res.refresh}>Try again</button></Empty></div>;
  }
  if (!d) return <div className="center"><Spinner /></div>;
  const p = d.pulse;
  const survey = p.kind === 'survey';
  const bySlide = new Map(d.slides.map((s) => [s.id, s]));

  // The raw answers are downloaded only here, when someone asks for the spreadsheet.
  async function exportCsv() {
    setExporting(true);
    try {
      const raw = await fetchPulseExport(id);
      const responses = raw.responses as unknown as PulseResponse[];
      const subs = raw.subs as unknown as PulseSubmission[];
      const qa = raw.qa as unknown as PulseQuestion[];
      const qs = p.slides.filter((s) => TYPES[s.type].interactive && s.type !== 'qa');
      const cols = [...(p.anonymous ? [] : ['Name', ...(survey ? ['Email'] : [])]), 'Submitted', ...qs.map((s, i) => `Q${i + 1}. ${s.title}`)];
      let rows: Row[];
      if (survey) {
        rows = subs.map((s) => ({ ...(p.anonymous ? {} : { Name: s.name, Email: s.email }), Submitted: fmtDateTime(s.at), ...Object.fromEntries(qs.map((q, i) => [`Q${i + 1}. ${q.title}`, formatAnswer(q, s.answers?.[q.id])])) }));
      } else {
        // One row per person, one column per question.
        const people = new Map<string, Row>();
        for (const r of responses) {
          const row = people.get(r.uid) ?? { ...(p.anonymous ? {} : { Name: r.name || 'Guest' }), Submitted: fmtDateTime(r.at) };
          const qi = qs.findIndex((q) => q.id === r.slideId);
          if (qi >= 0) row[`Q${qi + 1}. ${qs[qi].title}`] = formatAnswer(qs[qi], r.value);
          people.set(r.uid, row);
        }
        rows = [...people.values()];
      }
      downloadCsv(`${slug(p.title)}-responses.csv`, rows, cols);
      if (qa.length) {
        downloadCsv(`${slug(p.title)}-questions.csv`, qa.map((q) => ({ Question: q.text, Votes: q.votes, Answered: q.answered ? 'Yes' : 'No', Hidden: q.hidden ? 'Yes' : 'No', ...(p.anonymous ? {} : { Name: q.name }), Asked: fmtDateTime(q.at) })), ['Question', 'Votes', 'Answered', 'Hidden', ...(p.anonymous ? [] : ['Name']), 'Asked']);
      }
    } catch (x) { toast(friendlyError(x), 'err'); }
    setExporting(false);
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
            <button className="btn btn-ghost btn-sm" disabled={res.loading} onClick={res.refresh}><RefreshCw size={15} /> {res.loading ? 'Loading…' : 'Refresh'}</button>
            <Link className="btn btn-ghost btn-sm" href={`/pulse/edit/${p.id}`}><Pencil size={15} /> Edit</Link>
            <button className="btn btn-ink btn-sm" disabled={!d.participants || exporting} onClick={exportCsv}><Download size={15} /> {exporting ? 'Preparing…' : 'Export CSV'}</button>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat"><span>Participants</span><b>{d.participants}</b><small>{p.anonymous ? 'anonymous' : 'people who answered'}</small></div>
          <div className="stat"><span>Answers</span><b>{d.answerCount}</b><small>across {d.slides.length} questions</small></div>
          {survey && <div className="stat"><span>Completion</span><b>{d.starts ? `${Math.min(100, Math.round((d.submissions / d.starts) * 100))}%` : '–'}</b><small>{d.submissions} of {d.starts} who opened it</small></div>}
          {d.eligible !== null && <div className="stat"><span>Response rate</span><b>{d.eligible ? `${Math.min(100, Math.round((d.participants / d.eligible) * 100))}%` : '–'}</b><small>of {d.eligible} event attendees</small></div>}
          {survey && p.survey.limit > 0 && <div className="stat"><span>Limit</span><b>{p.survey.limit}</b><small>{Math.max(0, p.survey.limit - d.submissions)} left</small></div>}
        </div>

        {d.board.length > 0 && <section className="panel"><h2><Trophy size={20} aria-hidden="true" /> Quiz leaderboard</h2><Leaderboard rows={d.board} /></section>}

        {p.slides.map((s, i) => {
          const r = bySlide.get(s.id);
          if (!r) return null;
          if ('qa' in r) {
            return (
              <section key={s.id} className="panel pl-result-block">
                <h2><TypeIcon type={s.type} /> {i + 1}. {s.title}</h2>
                <p className="muted">{r.total} questions</p>
                <ul className="pl-qa">{(r.qa ?? []).map((q) => <li key={q.id} className={q.answered ? 'answered' : ''}><span className="pl-vote on"><b>{q.votes}</b></span><div><p>{q.text}</p><small className="muted">{q.hidden ? 'Hidden · ' : ''}{q.answered ? 'Answered · ' : ''}{q.name}</small></div></li>)}</ul>
              </section>
            );
          }
          return (
            <section key={s.id} className="panel pl-result-block">
              <h2><TypeIcon type={s.type} /> {i + 1}. {s.title}</h2>
              <p className="muted">{r.total} {r.total === 1 ? 'response' : 'responses'}{s.condition ? ' · conditional question' : ''}</p>
              <ResultView summary={r.summary} total={r.total} />
              {r.individual.length > 0 && (
                <details className="pl-individual"><summary>Individual answers</summary>
                  <table className="table"><thead><tr><th>Name</th><th>Answer</th></tr></thead>
                    <tbody>{r.individual.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.answer}</td></tr>)}</tbody></table>
                </details>
              )}
            </section>
          );
        })}
        {!d.participants && <Empty title="No responses yet">{survey ? 'Share the survey link to start collecting answers.' : 'Present it and ask your audience to join with the code.'}</Empty>}
      </main>
    </div>
  );
}
