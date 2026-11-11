'use client';

import { useState } from 'react';
import { CsvButton, Empty, ErrorNote, Field, Icon, Modal, StarRow, useToast } from '../../components/ui';
import { saveSession, updateEvent } from '../../lib/api';
import { backend } from '../../lib/backend';
import { feedbackSheet, sessionFeedbackSheet } from '../../lib/exports';
import { fmtDate, fmtTime } from '../../lib/format';
import { friendlyError } from '../../lib/format';
import type { Question } from '../../lib/types';
import { loadEventData, useAdmin, useAdminCol } from './context';
import { useCol } from '../../lib/live';
import { feedbackStats, feedbackWriter, setFeedbackStatus } from '../../lib/speakers';
import type { SpeakerFeedbackDoc } from '../../lib/types';
import { fmtDateTime } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';

function RatingBars({ values }: { values: number[] }) {
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, c: values.filter((v) => v === n).length }));
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

const avg = (v: number[]) => (v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–');

export function FeedbackAdmin() {
  const base = useAdmin();
  const { event, speakers, sessions, prefix } = base;
  const feedback = useAdminCol('feedback').data;
  const sessionFeedback = useAdminCol('sessionFeedback').data;
  const sortedSessions = [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const open = (v: boolean) => updateEvent(event.id, { feedbackOpen: v }).then(() => toast(v ? 'Feedback is open' : 'Feedback closed')).catch((x) => toast(friendlyError(x), 'err'));

  return (
    <div className="stack-lg">
      <SpeakerFeedbackAdmin />
      <div className="row-between">
        <h1>Feedback <small className="muted">{feedback.length} responses</small></h1>
        <div className="row">
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
        {!sessions.length && <Empty title="No sessions yet">Add sessions in Schedule. Each one can collect its own feedback.</Empty>}
        <div className="fb-grid">
          {sortedSessions.map((s) => {
            const list = sessionFeedback.filter((f) => f.sessionId === s.id);
            const nums = list.map((f) => f.rating);
            const on = s.feedbackOn !== false;
            const comments = list.filter((f) => f.comment);
            return (
              <section key={s.id} className="panel">
                <div className="row-between">
                  <h3>{s.title}</h3>
                  <button className="link" onClick={() => saveSession(event.id, { ...s, feedbackOn: !on }).then(() => toast(on ? 'Feedback off for this session' : 'Feedback on for this session')).catch((x) => toast(friendlyError(x), 'err'))}>{on ? 'Turn off' : 'Turn on'}</button>
                </div>
                <p className="muted">{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)}</p>
                {!on ? <p className="muted">Feedback is off for this session.</p> : !list.length ? <p className="muted">No ratings yet.</p> : <>
                  <p className="big-count"><b>{avg(nums)}</b> <StarRow value={Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)} /> <span className="muted">from {nums.length}</span></p>
                  <RatingBars values={nums} />
                  {comments.length > 0 && <ul className="quotes">{comments.map((f) => <li key={f.id}>{f.comment}</li>)}</ul>}
                </>}
              </section>
            );
          })}
        </div>
      </section>
      <h2>Overall event</h2>
      {!feedback.length && <Empty title="No responses yet">{event.feedbackOpen ? 'Attendees can send feedback from the app now.' : 'Open feedback when you’re ready for responses.'}</Empty>}
      {feedback.length > 0 && (
        <div className="fb-grid">
          {event.questions.map((q) => {
            const answers = feedback.map((f) => f.answers[q.id]).filter((a) => a !== undefined && a !== '');
            if (q.type === 'rating') {
              const nums = answers.map(Number);
              return <section key={q.id} className="panel"><h3>{q.label}</h3><p className="big-count"><b>{avg(nums)}</b> average from {nums.length}</p><RatingBars values={nums} /></section>;
            }
            if (q.type === 'choice') {
              return (
                <section key={q.id} className="panel"><h3>{q.label}</h3>
                  <div className="bars">
                    {(q.options ?? []).map((o) => {
                      const c = answers.filter((a) => a === o).length;
                      return <div key={o} className="bar-row bar-row-wide"><span>{o}</span><div className="bar"><i style={{ width: `${answers.length ? (c / answers.length) * 100 : 0}%` }} /></div><span>{c}</span></div>;
                    })}
                  </div>
                </section>
              );
            }
            return (
              <section key={q.id} className="panel"><h3>{q.label}</h3>
                <ul className="quotes">{answers.map((a, i) => <li key={i}>{String(a)}</li>)}</ul>
              </section>
            );
          })}
          {speakers.length > 0 && (
            <section className="panel"><h3>Speaker ratings</h3>
              <ul className="plain-list">
                {speakers.map((s) => {
                  const v = feedback.map((f) => f.speakerRatings?.[s.id]).filter((n): n is number => !!n);
                  return <li key={s.id} className="row-between"><span>{s.name}</span><span><b>{avg(v)}</b> <small className="muted">({v.length})</small></span></li>;
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
