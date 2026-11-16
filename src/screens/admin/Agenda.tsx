'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { CsvButton, Empty, ErrorNote, Field, Modal, useToast } from '../../components/ui';
import { deleteSession, saveSession } from '../../lib/api';
import { sessionsSheet } from '../../lib/exports';
import { fmtDay, fmtTime, friendlyError, fromLocalInput, toLocalInput } from '../../lib/format';
import { KIND_LABEL } from '../../lib/session';
import type { SessionDoc, SessionKind } from '../../lib/types';
import { loadEventData, useAdmin } from './context';
import { useRowCount } from '../../lib/summaries';
import { ImportSchedule } from './ImportSchedule';

const blank = (startsAt: string): SessionDoc => ({ id: '', title: '', description: '', room: '', startsAt, endsAt: startsAt, speakerIds: [], kind: 'talk', feedbackOn: true });

export function Agenda() {
  const base = useAdmin();
  const { event, sessions, speakers, prefix } = base;
  const toast = useToast();
  const [editing, setEditing] = useState<SessionDoc | null>(null);
  const [importing, setImporting] = useState(false);
  const sorted = [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <div className="stack-lg">
      <div className="row-between">
        <h1>Schedule</h1>
        <div className="row">
          <CsvButton load={async () => sessionsSheet(await loadEventData(base))} prefix={prefix} />
          <button className="btn btn-ghost btn-sm" onClick={() => setImporting(true)}>Upload schedule PDF</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(blank(event.startsAt))}>+ Add session</button>
        </div>
      </div>
      {!sorted.length && <Empty title="No sessions yet">Upload the programme PDF to fill this in, or add sessions one by one.</Empty>}
      {importing && <ImportSchedule event={event} speakers={speakers} onClose={() => setImporting(false)} />}
      <div className="table-list">
        {sorted.map((s) => (
          <div key={s.id} className="list-row">
            <div className="grow">
              <b>{s.title}</b>
              <small>{fmtDay(s.startsAt)} · {fmtTime(s.startsAt)} to {fmtTime(s.endsAt)}{s.room && ` · ${s.room}`} · <CheckinCount eventId={event.id} sessionId={s.id} /> checked in · {KIND_LABEL[s.kind ?? 'talk']}{s.feedbackOn === false ? ' · feedback off' : ''}</small>
            </div>
            <Link className="btn btn-primary btn-sm" href={`/admin/checkin/${event.id}/${s.id}`} target="_blank">Run check-in</Link>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
            <button className="link danger" onClick={() => {
              if (confirm(`Delete “${s.title}”? Its attendance records stay in the log.`)) deleteSession(event.id, s.id).catch((x) => toast(friendlyError(x), 'err'));
            }}>Delete</button>
          </div>
        ))}
      </div>
      {editing && (
        <Modal title={editing.id ? 'Edit session' : 'Add session'} onClose={() => setEditing(null)}>
          <SessionForm initial={editing} speakers={speakers} onSave={async (s) => { await saveSession(event.id, s); setEditing(null); toast('Session saved'); }} />
        </Modal>
      )}
    </div>
  );
}

function SessionForm({ initial, speakers, onSave }: { initial: SessionDoc; speakers: { id: string; name: string }[]; onSave: (s: SessionDoc) => Promise<void> }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (Date.parse(f.endsAt) < Date.parse(f.startsAt)) { setErr('The end time is before the start time.'); return; }
    try { await onSave(f); } catch (x) { setErr(friendlyError(x)); }
  }
  const pick = (id: string, on: boolean) => setF({ ...f, speakerIds: on ? [...f.speakerIds, id] : f.speakerIds.filter((x) => x !== id) });
  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Title"><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Type">
        <select value={f.kind ?? 'talk'} onChange={(e) => { const kind = e.target.value as SessionKind; setF({ ...f, kind, feedbackOn: kind !== 'break' }); }}>
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <div className="two">
        <Field label="Starts"><input required type="datetime-local" value={toLocalInput(f.startsAt)} onChange={(e) => setF({ ...f, startsAt: fromLocalInput(e.target.value) })} /></Field>
        <Field label="Ends"><input required type="datetime-local" value={toLocalInput(f.endsAt)} onChange={(e) => setF({ ...f, endsAt: fromLocalInput(e.target.value) })} /></Field>
      </div>
      <Field label="Room"><input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
      <Field label="Description"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      {speakers.length > 0 && (
        <div className="field">
          <span className="field-label">Speakers</span>
          {speakers.map((s) => <label key={s.id} className="check"><input type="checkbox" checked={f.speakerIds.includes(s.id)} onChange={(e) => pick(s.id, e.target.checked)} /> {s.name}</label>)}
        </div>
      )}
      <label className="check"><input type="checkbox" checked={f.feedbackOn !== false} onChange={(e) => setF({ ...f, feedbackOn: e.target.checked })} /><span><b>Collect feedback for this session</b><small>Attendees can rate it once it starts.</small></span></label>
      <ErrorNote text={err} />
      <button className="btn btn-primary btn-block">Save session</button>
    </form>
  );
}

/** This session's check-ins; every session's number arrives in one request. */
function CheckinCount({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  const c = useRowCount('attendance', eventId, sessionId);
  return <>{c.error ? '–' : c.n ?? '…'}</>;
}
