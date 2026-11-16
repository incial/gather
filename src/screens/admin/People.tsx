'use client';

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Avatar, CsvButton, Empty, ErrorNote, Icon, Modal, useToast } from '../../components/ui';
import { deletePrereg, importPrereg, promoteToSpeaker, removeAttendee } from '../../lib/api';
import { useCol } from '../../lib/live';
import { downloadCsv, parseCsv } from '../../lib/csv';
import { attendeesSheet } from '../../lib/exports';
import { friendlyError } from '../../lib/format';
import type { AttendeeDoc, PreregDoc, RoleDoc } from '../../lib/types';
import { loadEventData, useAdmin, useAdminCol } from './context';

const pickFirst = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v) ?? '';

export function rowsToPrereg(rows: Record<string, string>[]): { people: PreregDoc[]; skipped: number } {
  const seen = new Map<string, PreregDoc>();
  let skipped = 0;
  for (const r of rows) {
    const email = pickFirst(r, 'email', 'email address', 'e-mail', 'mail').toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; continue; }
    seen.set(email, {
      id: email, email, name: pickFirst(r, 'name', 'full name'),
      phone: pickFirst(r, 'phone', 'mobile', 'phone number', 'contact'),
      institution: pickFirst(r, 'institution', 'college', 'organisation', 'organization'),
      department: pickFirst(r, 'department', 'dept'), designation: pickFirst(r, 'designation', 'title', 'role'),
    });
  }
  return { people: [...seen.values()], skipped };
}

export function People() {
  const base = useAdmin();
  const { event, prefix } = base;
  const attendees = useAdminCol('attendees').data;
  const prereg = useAdminCol('preregistered').data;
  // Speaker roles at this event (who is already a speaker, and anyone an organiser removed earlier).
  const roles = useCol<RoleDoc>(`events/${event.id}/roles`).data;
  const roleOf = useMemo(() => new Map(roles.map((r) => [r.uid, r])), [roles]);
  const [promoting, setPromoting] = useState('');
  async function makeSpeaker(a: AttendeeDoc) {
    if (!confirm(`Make ${a.name} a speaker at ${event.title}?\n\nThey get speaker access straight away (Speaker area, speaker feedback, Gather Pulse) and appear in the speaker list. Their attendee registration stays as it is.`)) return;
    setPromoting(a.uid);
    try { await promoteToSpeaker(event, a, base.speakers, roleOf.get(a.uid) ?? null); toast(`${a.name} is now a speaker. Add their topic and bio in Speakers.`); }
    catch (x) { toast(friendlyError(x), 'err'); }
    setPromoting('');
  }
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const joinedEmails = useMemo(() => new Set(attendees.map((a) => (a.email ?? '').toLowerCase())), [attendees]);
  const waiting = prereg.filter((p) => !joinedEmails.has(p.id));
  const shown = attendees.filter((a) => `${a.name} ${a.email} ${a.institution}`.toLowerCase().includes(q.toLowerCase()));

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    const { people, skipped } = rowsToPrereg(parseCsv(await f.text()));
    if (!people.length) { setErr('No valid rows found. The file needs a column named “email”.'); return; }
    try {
      await importPrereg(event.id, people);
      toast(`${people.length} people imported${skipped ? `, ${skipped} skipped (no valid email)` : ''}`);
    } catch (x) { setErr(friendlyError(x)); }
  }

  return (
    <div className="stack-lg">
      <div className="row-between">
        <h1>People</h1>
        <div className="row">
          <CsvButton load={async () => attendeesSheet(await loadEventData(base))} prefix={prefix} />
          <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv('import-template.csv', [], ['name', 'email', 'phone', 'institution', 'department', 'designation'])}>Template</button>
          <button className="btn btn-primary btn-sm" onClick={() => file.current?.click()}>Import CSV</button>
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        </div>
      </div>
      <ErrorNote text={err} />
      {waiting.length > 0 && (
        <button className="nudge" onClick={() => setListOpen(true)}>
          <span><b>{waiting.length} pre-registered</b> haven’t joined yet</span><Icon name="arrow" size={20} />
        </button>
      )}
      <input className="search" aria-label="Search people" placeholder="Search name, email or institution" value={q} onChange={(e) => setQ(e.target.value)} />
      {!attendees.length ? <Empty title="Nobody has joined yet">Share the join QR from Overview, or import your registration list.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Institution</th><th>Source</th><th>Role</th><th /></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.uid}>
                  <td><span className="name-cell"><Avatar id={a.uid} name={a.name} photo={a.photo || undefined} size={30} /><b>{a.name}</b></span></td><td>{a.email}</td><td>{a.phone}</td><td>{a.institution}</td>
                  <td>{a.source === 'list' ? 'Pre-registered' : 'App'}</td>
                  <td>{roleOf.get(a.uid)?.active
                    ? <span className="pill">Speaker</span>
                    : <button className="btn btn-ghost btn-sm" disabled={promoting === a.uid} onClick={() => makeSpeaker(a)}>{promoting === a.uid ? 'Making speaker…' : 'Make speaker'}</button>}</td>
                  <td><button className="link danger" onClick={() => {
                    if (confirm(`Remove ${a.name} from this event?`)) removeAttendee(event.id, a.uid).catch((x) => toast(friendlyError(x), 'err'));
                  }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {listOpen && (
        <Modal title="Pre-registered, not joined" onClose={() => setListOpen(false)}>
          <ul className="plain-list">
            {waiting.map((p) => (
              <li key={p.id} className="row-between">
                <span><b>{p.name || p.email}</b><small className="muted"> {p.email}</small></span>
                <button className="link danger" onClick={() => deletePrereg(event.id, p.id).catch((x) => toast(friendlyError(x), 'err'))}>Remove</button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
