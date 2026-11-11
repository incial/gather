'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { ErrorNote, Field, Icon, Modal, useToast } from '../../components/ui';
import { importSchedule } from '../../lib/api';
import { friendlyError, fromLocalInput, toLocalInput } from '../../lib/format';
import { pdfTextItems } from '../../lib/pdfText';
import { parseSchedule, toLines, type ParsedRow } from '../../lib/scheduleParse';
import { KIND_LABEL } from '../../lib/session';
import type { EventDoc, SessionKind, SpeakerDoc } from '../../lib/types';

/** The calendar date of Day 1 in the organiser's local time, as YYYY-MM-DD. */
const dayOne = (iso: string) => (toLocalInput(iso) || toLocalInput(new Date().toISOString())).slice(0, 10);
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00`); d.setDate(d.getDate() + n); return toLocalInput(d.toISOString()).slice(0, 10); };

export function ImportSchedule({ event, speakers, onClose }: { event: EventDoc; speakers: SpeakerDoc[]; onClose: () => void }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [start, setStart] = useState(dayOne(event.startsAt));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  async function read(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(''); setBusy(true); setName(f.name);
    try {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') throw new Error('Please choose a PDF file.');
      const items = await pdfTextItems(f);
      if (!items.length) throw new Error('This PDF has no readable text (it may be a scanned image). Add the sessions by hand instead.');
      const parsed = parseSchedule(toLines(items));
      if (!parsed.length) throw new Error('No times found in this PDF. Check it’s the programme schedule, or add sessions by hand.');
      setRows(parsed);
    } catch (x) { setErr(x instanceof Error ? x.message : friendlyError(x)); }
    setBusy(false);
  }

  const patch = (i: number, p: Partial<ParsedRow>) => setRows((r) => r!.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const days = rows ? Math.max(1, ...rows.map((r) => r.day)) : 1;
  const problems = (rows ?? []).filter((r) => !r.title.trim() || !r.start || !r.end || r.end <= r.start).length;

  async function save() {
    if (!rows?.length) return;
    setBusy(true); setErr('');
    try {
      const res = await importSchedule(event.id, rows.map((r) => {
        const date = addDays(start, r.day - 1);
        return { title: r.title, startsAt: fromLocalInput(`${date}T${r.start}`), endsAt: fromLocalInput(`${date}T${r.end}`), speakers: r.speakers, kind: r.kind, feedbackOn: r.feedbackOn };
      }), speakers);
      toast(`Added ${res.sessions} sessions${res.speakers ? ` and ${res.speakers} new speakers` : ''}`);
      onClose();
    } catch (x) { setErr(friendlyError(x)); setBusy(false); }
  }

  return (
    <Modal title="Upload schedule PDF" onClose={onClose}>
      {!rows ? (
        <div className="stack">
          <p className="muted">Upload the programme schedule as a PDF. Gather reads the times, sessions and resource persons, and you check everything before it’s added.</p>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => file.current?.click()}>
            <Icon name="download" size={18} /> {busy ? `Reading ${name}…` : 'Choose PDF'}
          </button>
          <input ref={file} type="file" accept="application/pdf,.pdf" hidden onChange={read} />
          <ErrorNote text={err} />
        </div>
      ) : (
        <div className="stack">
          <p className="muted">Found <b>{rows.length} sessions</b> over {days} {days === 1 ? 'day' : 'days'} in {name}. Fix anything that’s wrong, then add them.</p>
          <Field label="Day 1 is on"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <div className="import-list">
            {rows.map((r, i) => {
              const bad = !r.title.trim() || !r.start || !r.end || r.end <= r.start;
              return (
                <div key={i} className={`import-row${bad ? ' import-bad' : ''}`}>
                  <div className="import-top">
                    <select aria-label="Day" value={r.day} onChange={(e) => patch(i, { day: Number(e.target.value) })}>
                      {Array.from({ length: Math.max(days, r.day) + 1 }, (_, d) => d + 1).map((d) => <option key={d} value={d}>Day {d}</option>)}
                    </select>
                    <input aria-label="Starts" type="time" value={r.start} onChange={(e) => patch(i, { start: e.target.value })} />
                    <input aria-label="Ends" type="time" value={r.end} onChange={(e) => patch(i, { end: e.target.value })} />
                    <button type="button" className="icon-btn" aria-label={`Remove ${r.title || 'session'}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
                  </div>
                  <input aria-label="Session title" value={r.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Session title" />
                  <input aria-label="Resource persons" value={r.speakers.join('; ')} onChange={(e) => patch(i, { speakers: e.target.value.split(';').map((s) => s.trim()).filter(Boolean) })} placeholder="Resource persons, separated by ;" />
                  <div className="import-top">
                    <select aria-label="Type" value={r.kind} onChange={(e) => { const kind = e.target.value as SessionKind; patch(i, { kind, feedbackOn: kind !== 'break' }); }}>
                      {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <label className="check"><input type="checkbox" checked={r.feedbackOn} onChange={(e) => patch(i, { feedbackOn: e.target.checked })} /> Feedback</label>
                  </div>
                  {bad && <small className="danger">Needs a title, and an end time after the start.</small>}
                </div>
              );
            })}
          </div>
          <ErrorNote text={err} />
          <div className="two">
            <button className="btn btn-ghost" onClick={() => { setRows(null); setErr(''); }}>Choose another PDF</button>
            <button className="btn btn-primary" disabled={busy || problems > 0 || !rows.length} onClick={save}>{busy ? 'Adding…' : `Add ${rows.length} sessions`}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
