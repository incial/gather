'use client';

import { useState } from 'react';
import { CsvButton, Empty, ErrorNote, Field, Icon, Modal, StarRow, useToast } from '../../components/ui';
import { saveSession, updateEvent } from '../../lib/api';
import { backend } from '../../lib/backend';
import { feedbackSheet, sessionFeedbackSheet } from '../../lib/exports';
import { fmtDate, fmtTime } from '../../lib/format';
import { friendlyError } from '../../lib/format';
import type { Question } from '../../lib/types';
import { loadEventData, useAdmin } from './context';
import { fetchFeedbackSummary, useSummary } from '../../lib/summaries';
import { useCol } from '../../lib/live';
import { feedbackStats, feedbackWriter, setFeedbackStatus } from '../../lib/speakers';
import type { SpeakerFeedbackDoc } from '../../lib/types';
import { fmtDateTime } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';

/** `dist` is how many people gave 1, 2, 3, 4 and 5 stars (counted on the server). */
function RatingBars({ dist }: { dist: number[] }) {
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, c: dist[n - 1] ?? 0 }));
  const max = Math.max(1, ...counts.map((x) => x.c));
  return (
    <div className="bars">
      {counts.map(({ n, c }) => (
        <div key={n} className="bar-row" title={`${c} ${c === 1 ? 'person' : 'people'} rated ${n}`}>
          <span className="bar-star">{n} <Icon name="star" size={12} filled /></span><div className="bar"><i style={{ width: `${(c / max) * 100}%` }} /></div><span>{c}</span>
        </div>
      ))}
    </div>
  );
}

const avg = (a: number | null | undefined) => (a == null ? '–' : a.toFixed(1));

export function FeedbackAdmin() {
  const base = useAdmin();
  const { event, speakers, sessions, prefix } = base;
  const sortedSessions = [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  // Averages, star counts, option counts and the comments shown, worked out on the server in one request.
  const sessionIds = sortedSessions.map((s) => s.id);
  const speakerIds = speakers.map((s) => s.id);
  const summary = useSummary(`feedback|${event.id}|${sessionIds.join(',')}|${speakerIds.join(',')}|${event.questions.map((q) => q.id).join(',')}`,
    () => fetchFeedbackSummary(event.id, sessionIds, speakerIds));
  const fb = summary.data;
  const total = fb?.total ?? 0;
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const open = (v: boolean) => updateEvent(event.id, { feedbackOpen: v }).then(() => toast(v ? 'Feedback is open' : 'Feedback closed')).catch((x) => toast(friendlyError(x), 'err'));

  return (
    <div className="stack-lg">
      <SpeakerFeedbackAdmin />
      <div className="row-between">
        <h1>Feedback <small className="muted">{fb ? `${total} responses` : summary.error ? '' : '…'}</small></h1>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={summary.refresh} disabled={summary.loading}>Refresh</button>
          <CsvButton load={async () => feedbackSheet(await loadEventData(base))} prefix={prefix} />
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit questions</button>
          <button className="btn btn-primary btn-sm" onClick={() => open(!event.feedbackOpen)}>{event.feedbackOpen ? 'Close feedback' : 'Open feedback'}</button>
        </div>
      </div>
      <section className="stack">
        <div className="row-between">
          <h2>By session</h2>
          <CsvButton load={async () => sessionFeedbackSheet(await loadEventData(base))} prefix={prefix} />
        </div>
        {summary.error && !fb ? <ErrorNote text="Couldn’t load the feedback summary. Try Refresh." /> : null}
        {!sessions.length && <Empty title="No sessions yet">Add sessions in Schedule. Each one can collect its own feedback.</Empty>}
        <div className="fb-grid">
          {sortedSessions.map((s) => {
            const st = fb?.sessions[s.id];
            const on = s.feedbackOn !== false;
            return (
              <section key={s.id} className="panel">
                <div className="row-between">
                  <h3>{s.title}</h3>
                  <button className="link" onClick={() => saveSession(event.id, { ...s, feedbackOn: !on }).then(() => toast(on ? 'Feedback off for this session' : 'Feedback on for this session')).catch((x) => toast(friendlyError(x), 'err'))}>{on ? 'Turn off' : 'Turn on'}</button>
                </div>
                <p className="muted">{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)}</p>
                {!on ? <p className="muted">Feedback is off for this session.</p> : !st ? <p className="muted">{summary.error ? '–' : 'Loading…'}</p> : !st.n ? <p className="muted">No ratings yet.</p> : <>
                  <p className="big-count"><b>{avg(st.avg)}</b> <StarRow value={Math.round(st.avg ?? 0)} /> <span className="muted">from {st.n}</span></p>
                  <RatingBars dist={st.dist} />
                  {st.comments.length > 0 && <ul className="quotes">{st.comments.map((c, i) => <li key={i}>{c}</li>)}</ul>}
                </>}
              </section>
            );
          })}
        </div>
      </section>
      <h2>Overall event</h2>
      {fb && !total && <Empty title="No responses yet">{event.feedbackOpen ? 'Attendees can send feedback from the app now.' : 'Open feedback when you’re ready for responses.'}</Empty>}
      {fb && total > 0 && (
        <div className="fb-grid">
          {event.questions.map((q) => {
            const r = fb.questions.find((x) => x.id === q.id);
            if (!r) return null;
            if ('dist' in r) {
              return <section key={q.id} className="panel"><h3>{q.label}</h3><p className="big-count"><b>{avg(r.avg)}</b> average from {r.n}</p><RatingBars dist={r.dist} /></section>;
            }
            if ('options' in r) {
              return (
                <section key={q.id} className="panel"><h3>{q.label}</h3>
                  <div className="bars">
                    {(r.options ?? []).map(({ option, n: c }) => (
                      <div key={option} className="bar-row bar-row-wide"><span>{option}</span><div className="bar"><i style={{ width: `${r.n ? (c / r.n) * 100 : 0}%` }} /></div><span>{c}</span></div>
                    ))}
                  </div>
                </section>
              );
            }
            return (
              <section key={q.id} className="panel"><h3>{q.label}</h3>
                <ul className="quotes">{r.answers.map((a, i) => <li key={i}>{a}</li>)}</ul>
                {r.n > r.answers.length && <p className="muted">Showing {r.answers.length} of {r.n}. Download the CSV for all of them.</p>}
              </section>
            );
          })}
          {speakers.length > 0 && (
            <section className="panel"><h3>Speaker ratings</h3>
              <ul className="plain-list">
                {speakers.map((s) => {
                  const v = fb.speakers[s.id];
                  return <li key={s.id} className="row-between"><span>{s.name}</span><span><b>{avg(v?.avg)}</b> <small className="muted">({v?.n ?? 0})</small></span></li>;
                })}
              </ul>
            </section>
          )}
        </div>
      )}
      {editing && <QuestionEditor initial={event.questions} onClose={() => setEditing(false)} onSave={(questions) => updateEvent(event.id, { questions })} />}
    </div>
  );
}

function QuestionEditor({ initial, onSave, onClose }: { initial: Question[]; onSave: (q: Question[]) => Promise<void>; onClose: () => void }) {
  const [qs, setQs] = useState(initial);
  const [err, setErr] = useState('');
  const patch = (i: number, p: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  async function save() {
    const clean = qs.filter((q) => q.label.trim()).map((q): Question => {
      const { options, ...rest } = q;
      return q.type === 'choice' ? { ...rest, options: (options ?? []).map((o) => o.trim()).filter(Boolean) } : rest;
    });
    if (clean.some((q) => q.type === 'choice' && !q.options?.length)) { setErr('Multiple choice questions need at least one option.'); return; }
    try { await onSave(clean); onClose(); } catch (x) { setErr(friendlyError(x)); }
  }
  return (
    <Modal title="Feedback questions" onClose={onClose}>
      <div className="stack">
        {qs.map((q, i) => (
          <div key={q.id} className="q-edit">
            <Field label={`Question ${i + 1}`}><input value={q.label} onChange={(e) => patch(i, { label: e.target.value })} /></Field>
            <div className="row">
              <select aria-label="Answer type" value={q.type} onChange={(e) => patch(i, { type: e.target.value as Question['type'] })}>
                <option value="rating">Star rating</option><option value="text">Written answer</option><option value="choice">Multiple choice</option>
              </select>
              <label className="check"><input type="checkbox" checked={!!q.required} onChange={(e) => patch(i, { required: e.target.checked })} /> Required</label>
              <button className="link danger" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remove</button>
            </div>
            {q.type === 'choice' && <Field label="Options, comma separated"><input value={(q.options ?? []).join(', ')} onChange={(e) => patch(i, { options: e.target.value.split(',').map((x) => x.trimStart()) })} /></Field>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setQs([...qs, { id: backend.newId(), type: 'rating', label: '' }])}>+ Add question</button>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block" onClick={save}>Save questions</button>
      </div>
    </Modal>
  );
}

/** Attendee → speaker feedback: per-speaker averages, and moderation (hide, restore, review reports). */
function SpeakerFeedbackAdmin() {
  const { event, speakers } = useAdmin();
  const toast = useToast();
  const all = useCol<SpeakerFeedbackDoc>(`events/${event.id}/speakerFeedback`);
  const [filter, setFilter] = useState<'all' | 'reported' | 'hidden'>('all');
  const name = (sid: string) => speakers.find((s) => s.id === sid)?.name ?? 'Removed speaker';
  const list = [...all.data].filter((f) => filter === 'all' || f.status === filter).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  async function reveal(f: SpeakerFeedbackDoc) {
    if (!confirm('Reveal who sent this anonymous feedback? Do this only to deal with abuse. The speaker never sees it.')) return;
    const a = await feedbackWriter(event.id, f.id).catch(() => null);
    alert(a ? `Sent by ${a.name} (${a.email})` : 'The sender couldn’t be found. They may have left the event.');
  }
  const exportCsv = () => downloadCsv(`${event.title}-speaker-feedback.csv`, all.data.map((f) => ({
    Speaker: name(f.speakerId), Rating: f.rating, Feedback: f.text, From: f.anonymous ? 'Anonymous' : f.name, Status: f.status, Sent: fmtDateTime(f.at),
  })), ['Speaker', 'Rating', 'Feedback', 'From', 'Status', 'Sent']);
  return (
    <section className="panel">
      <div className="row-between">
        <h2>Speaker feedback <small className="muted">{all.data.length}</small></h2>
        <div className="row">
          <div className="seg" role="tablist" aria-label="Filter speaker feedback">
            {(['all', 'reported', 'hidden'] as const).map((k) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : k === 'reported' ? `Reported (${all.data.filter((f) => f.status === 'reported').length})` : 'Hidden'}</button>)}
          </div>
          <button className="btn btn-ghost btn-sm" disabled={!all.data.length} onClick={exportCsv}><Icon name="download" size={15} /> CSV</button>
        </div>
      </div>
      <div className="sfa-speakers">
        {speakers.map((s) => {
          const st = feedbackStats(all.data.filter((f) => f.speakerId === s.id && f.status !== 'hidden'));
          return <div key={s.id}><b>{s.name}</b><span>{st.average ?? '–'} ★ · {st.n}</span></div>;
        })}
      </div>
      {!list.length ? <p className="muted">{all.data.length ? 'Nothing in this filter.' : 'No speaker feedback yet. Attendees send it from each speaker’s profile.'}</p> : (
        <ul className="sp-feedback">
          {list.map((f) => (
            <li key={f.id} className={f.status === 'hidden' ? 'is-hidden' : ''}>
              <div>
                <div className="row-between"><b>{name(f.speakerId)} · {f.anonymous ? 'Anonymous' : f.name}</b><StarRow value={f.rating} /></div>
                {f.text && <p>{f.text}</p>}
                <small className="muted">{fmtDateTime(f.at)} · {f.status === 'reported' ? 'Reported by the speaker' : f.status === 'hidden' ? 'Hidden from the speaker' : 'Visible to the speaker'}</small>
              </div>
              <div className="row">
                {f.status !== 'hidden'
                  ? <button className="btn btn-ghost btn-sm" onClick={() => setFeedbackStatus(event.id, f.id, 'hidden').then(() => toast('Hidden from the speaker')).catch((x) => toast(friendlyError(x), 'err'))}>Hide</button>
                  : <button className="btn btn-ghost btn-sm" onClick={() => setFeedbackStatus(event.id, f.id, 'visible').then(() => toast('Visible again')).catch((x) => toast(friendlyError(x), 'err'))}>Restore</button>}
                {f.status === 'reported' && <button className="btn btn-ghost btn-sm" onClick={() => setFeedbackStatus(event.id, f.id, 'visible').then(() => toast('Report dismissed'))}>Keep</button>}
                {f.anonymous && <button className="link" onClick={() => reveal(f)}>Who sent this?</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
