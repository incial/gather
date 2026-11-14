'use client';

import { useMemo, useRef, useState } from 'react';
import { Scanner } from '../../components/Scanner';
import { CsvButton, Empty, Modal, useToast } from '../../components/ui';
import { markAttendance, setSelfCheckIn, unmarkAttendance } from '../../lib/api';
import { primeCount, useCount } from '../../lib/live';
import type { SessionDoc } from '../../lib/types';
import { useEffect } from 'react';
import { attendanceLogSheet, attendanceRegisterSheet } from '../../lib/exports';
import { friendlyError } from '../../lib/format';
import { readPass } from '../../lib/qr';
import { checkInAttendee, undoCheckIn } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { fmtDateTime, fmtTime } from '../../lib/format';
import type { AttendeeDoc } from '../../lib/types';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';

const METHOD: Record<NonNullable<AttendeeDoc['checkInMethod']>, string> = { pass: 'Pass scan', manual: 'Manual', self: 'Self scan' };
interface LogEntry { id: string; uid: string; name: string; action: 'in' | 'undo'; method: string; by: string; byName: string; at: string }

/** The check-in history, read only when asked for (it can be long). */
function CheckInHistory({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<LogEntry[] | null>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); backend.getCol<LogEntry>(`events/${eventId}/checkinLog`, [], { orderBy: 'at', desc: true, limit: 40 }).then(setRows).catch(() => setErr(true)); };
  if (!rows) return <div className="row"><button className="btn btn-ghost btn-sm" onClick={load}>Show check-in history</button>{err && <span className="error">Couldn’t load the history.</span>}</div>;
  return (
    <details className="checkin-log" open>
      <summary>Check-in history · last {rows.length}</summary>
      {!rows.length ? <p className="muted">No check-ins recorded yet.</p> : (
        <ul>{rows.map((r) => <li key={r.id}><b>{r.name}</b> {r.action === 'in' ? `checked in (${METHOD[r.method as keyof typeof METHOD] ?? r.method})` : 'check-in undone'}{r.by !== r.uid && ` by ${r.byName}`} <small className="muted">{fmtDateTime(r.at)}</small></li>)}</ul>
      )}
    </details>
  );
}
import { BadgeCheck, CircleAlert, CircleX, Hand, RefreshCw, ScanLine, Search } from 'lucide-react';

/**
 * One session in the overview: how many attended, and whether self check-in is open. The selected
 * session's number comes from its live list (`present`, no extra read); the others use a count
 * (1 read). The automatic refresh (`tick`) only re-counts sessions happening now; `all` (the
 * Refresh button) re-counts every session.
 */
function SessionTile({ eventId, s, total, active, present, onOpen, tick, all }: { eventId: string; s: SessionDoc; total: number; active: boolean; present: number | null; onOpen: () => void; tick: number; all: number }) {
  const now = Date.now();
  const live = Date.parse(s.startsAt) <= now && Date.parse(s.endsAt) >= now;
  const path = `events/${eventId}/attendance`;
  // While selected, keep the shared count in step with the live list, so it's current when another session is picked.
  useEffect(() => { if (present !== null) primeCount(path, [['sessionId', s.id]], present); }, [present, path, s.id]);
  const c = useCount(present === null ? path : null, [['sessionId', s.id]]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tick && live && present === null) c.refresh(); }, [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (all && present === null) c.refresh(); }, [all]);
  const count = present ?? c.n;
  const n = count ?? 0;
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <button type="button" className={`sess-tile${active ? ' on' : ''}`} onClick={onOpen} aria-pressed={active}>
      <span className="sess-tile-top"><small>{fmtTime(s.startsAt)}{live && <i className="pill pill-live">Now</i>}</small>{s.selfCheckIn && <i className="sess-self" title="Self check-in is open"><Hand size={13} aria-hidden="true" /> Self</i>}</span>
      <b>{s.title}</b>
      <span className="sess-tile-n"><b>{count === null ? '…' : n}</b> / {total} <small>{pct}%</small></span>
      <span className="sess-bar"><i style={{ width: `${pct}%` }} /></span>
    </button>
  );
}
import { loadEventData, useAdmin, useAdminCol } from './context';

export function Attendance() {
  const base = useAdmin();
  const { event, sessions, prefix } = base;
  const attendees = useAdminCol('attendees').data;
  const toast = useToast();
  const sorted = useMemo(() => [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions]);
  const [picked, setPicked] = useState('');
  const sessionId = picked || sorted[0]?.id || '';
  const [scanning, setScanning] = useState(false);
  // Only this session's check-ins are loaded, not every session's.
  const attendanceCol = useAdminCol('attendance', sessionId ? [['sessionId', sessionId]] : [['sessionId', '-']]);
  const attendance = attendanceCol.data;
  const attendanceLoading = attendanceCol.loading;
  const present = new Map(attendance.map((a) => [a.uid, a]));
  const lastScan = useRef('');
  const session = sorted.find((s) => s.id === sessionId);
  // The selected session's tile follows its live list. Sessions happening now re-count every 30 seconds
  // (people check themselves in); Refresh re-counts them all. Before, every tile re-counted every 30
  // seconds and on every single check-in, which cost one read per session each time.
  const [tick, setTick] = useState(0);
  const [all, setAll] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  async function toggleSelf(on: boolean) {
    if (!session) return;
    try { await setSelfCheckIn(event.id, session.id, on); toast(on ? `Attendees can now mark themselves present for “${session.title}”` : 'Self check-in closed'); }
    catch (x) { toast(friendlyError(x), 'err'); }
  }

  async function toggle(uid: string, on: boolean) {
    const a = attendees.find((x) => x.uid === uid)!;
    try {
      if (on) await markAttendance(event.id, sessionId, a, 'manual');
      else await unmarkAttendance(event.id, `${sessionId}_${uid}`);
    } catch (x) { toast(friendlyError(x), 'err'); }
  }
  function onPass(text: string) {
    const p = readPass(text);
    const a = p && p.eventId === event.id ? attendees.find((x) => (p.regId ? x.regId === p.regId : x.uid === p.uid)) : undefined;
    if (!a) { toast('That pass isn’t for this event', 'err'); return; }
    if (present.has(a.uid) || lastScan.current === `${sessionId}_${a.uid}`) { toast(`${a.name} is already checked in`); return; }
    lastScan.current = `${sessionId}_${a.uid}`;
    markAttendance(event.id, sessionId, a, 'staff').then(() => toast(`${a.name} checked in`)).catch((x) => toast(friendlyError(x), 'err'));
  }

  return (
    <div className="stack-lg">
      <DoorCheckIn attendees={attendees} />
      <div className="row-between">
        <h2>Session attendance</h2>
        <div className="row">
          <span className="csv-label">Register</span><CsvButton load={async () => attendanceRegisterSheet(await loadEventData(base))} prefix={prefix} />
          <span className="csv-label">Log</span><CsvButton load={async () => attendanceLogSheet(await loadEventData(base))} prefix={prefix} />
        </div>
      </div>
      {!sorted.length ? <Empty title="Add sessions first">Attendance is taken per session.</Empty> : <>
        {/* Every session at a glance; tap one to see and edit its list below */}
        <div className="row-between"><h3 className="sub-h">All sessions</h3><button className="btn btn-ghost btn-sm" onClick={() => setAll((n) => n + 1)}><RefreshCw size={14} /> Refresh</button></div>
        <div className="sess-grid">
          {sorted.map((s) => <SessionTile key={s.id} eventId={event.id} s={s} total={attendees.length} active={s.id === sessionId} present={s.id === sessionId && !attendanceLoading ? present.size : null} onOpen={() => setPicked(s.id)} tick={tick} all={all} />)}
        </div>
        <div className="row-between">
          <select aria-label="Session" className="grow" value={sessionId} onChange={(e) => setPicked(e.target.value)}>
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => setScanning(true)}>Scan passes</button>
        </div>
        <p className="big-count"><b>{present.size}</b> of {attendees.length} checked in</p>
        {session && (
          <label className="check self-toggle">
            <input type="checkbox" checked={!!session.selfCheckIn} onChange={(e) => toggleSelf(e.target.checked)} />
            <span><b>Let attendees mark themselves present</b><small>For when scanning doesn’t work or people arrive late. They tap “Mark me present” in the app; it shows as “Self-marked” here and in the register. Turn it off when the session is over.</small></span>
          </label>
        )}
        <div className="table-list">
          {attendees.map((a) => (
            <label key={a.uid} className="list-row check-row">
              <input type="checkbox" checked={present.has(a.uid)} onChange={(e) => toggle(a.uid, e.target.checked)} />
              <div className="grow"><b>{a.name}</b><small>{a.institution || a.email}</small></div>
              {present.has(a.uid) && <small className={`muted${present.get(a.uid)!.method === 'self' ? ' self-tag' : ''}`}>{{ qr: 'Room code', staff: 'Pass scan', manual: 'Manual', self: 'Self-marked' }[present.get(a.uid)!.method]}</small>}
            </label>
          ))}
        </div>
      </>}
      {scanning && (
        <Modal title="Scan attendee passes" onClose={() => setScanning(false)}>
          <Scanner continuous onResult={onPass} />
          <p className="muted">Keep scanning. Each pass is checked in to the session selected above.</p>
        </Modal>
      )}
    </div>
  );
}

type ScanResult = { kind: 'ok' | 'already' | 'invalid' | 'wrong' | 'missing' | 'error'; title: string; detail?: string };

/** Event check-in at the door: scan passes or check people in by hand. Times come from the server. */
function DoorCheckIn({ attendees }: { attendees: AttendeeDoc[] }) {
  const { event } = useAdmin();
  const toast = useToast();
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [q, setQ] = useState('');
  const busy = useRef(new Set<string>());
  const inCount = attendees.filter((a) => a.checkedIn).length;
  const pct = attendees.length ? Math.round((inCount / attendees.length) * 100) : 0;

  async function admit(a: AttendeeDoc, method: 'pass' | 'manual'): Promise<ScanResult> {
    if (a.checkedIn) return { kind: 'already', title: `${a.name} is already checked in`, detail: `Since ${fmtTime(a.checkedInAt)}` };
    if (busy.current.has(a.uid)) return { kind: 'already', title: `${a.name} is being checked in…` };
    busy.current.add(a.uid);
    try { await checkInAttendee(event.id, a, method, user!); return { kind: 'ok', title: `${a.name} checked in`, detail: a.regId ? `Pass ${a.regId}` : undefined }; }
    catch (x) { return { kind: 'error', title: 'Couldn’t check in', detail: friendlyError(x) }; }
    finally { busy.current.delete(a.uid); }
  }
  async function onScan(text: string) {
    const p = readPass(text);
    if (!p) { setResult({ kind: 'invalid', title: 'Not a Gather pass', detail: 'Ask the attendee to open their pass in the app.' }); return; }
    if (p.eventId !== event.id) { setResult({ kind: 'wrong', title: 'Pass for a different event', detail: 'This pass belongs to another Gather event.' }); return; }
    const a = attendees.find((x) => (p.regId ? x.regId === p.regId : x.uid === p.uid));
    if (!a) { setResult({ kind: 'missing', title: 'Registration not found', detail: 'They may have been removed. Check them in by name instead.' }); return; }
    setResult(await admit(a, 'pass'));
  }
  const exportSheet = () => downloadCsv(`${event.title}-attendance.csv`, attendees.map((a) => ({
    Name: a.name, Email: a.email, Phone: a.phone, Event: event.title, 'Registration ID': a.regId ?? '',
    Status: a.checkedIn ? 'Checked in' : 'Not checked in', 'Check-in time': a.checkedIn ? fmtDateTime(a.checkedInAt) : '', 'Check-in method': a.checkedIn ? METHOD[a.checkInMethod ?? 'pass'] : '',
  })), ['Name', 'Email', 'Phone', 'Event', 'Registration ID', 'Status', 'Check-in time', 'Check-in method']);
  const shown = attendees.filter((a) => !q || `${a.name} ${a.email} ${a.regId ?? ''} ${a.phone}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!!b.checkedIn) - Number(!!a.checkedIn) || (b.checkedInAt ?? '').localeCompare(a.checkedInAt ?? '') || a.name.localeCompare(b.name));
  const Ico = { ok: BadgeCheck, already: CircleAlert, invalid: CircleX, wrong: CircleX, missing: CircleX, error: CircleX };

  return (
    <section className="stack">
      <div className="row-between">
        <h1>Check-in</h1>
        <div className="row">
          <button className="btn btn-primary btn-sm" onClick={() => { setResult(null); setScanning(true); }}><ScanLine size={16} /> Scan passes</button>
          <button className="btn btn-ghost btn-sm" disabled={!attendees.length} onClick={exportSheet}>Attendance sheet (CSV)</button>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat"><span>Registered</span><b>{attendees.length}</b><small>{event.capacity ? `capacity ${event.capacity}` : 'no limit'}</small></div>
        <div className="stat"><span>Checked in</span><b>{inCount}</b><small>{pct}% of registered</small></div>
        <div className="stat"><span>Not yet</span><b>{attendees.length - inCount}</b><small>pending</small></div>
        {(event.expectedAttendees ?? 0) > 0 && <div className="stat"><span>Expected</span><b>{event.expectedAttendees}</b><small>organiser’s estimate</small></div>}
      </div>
      <div className="door-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Checked in"><i style={{ width: `${pct}%` }} /></div>
      <label className="org-search"><Search size={17} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name, email, phone or pass ID" aria-label="Find attendee" /></label>
      <div className="table-list door-list">
        {shown.slice(0, q ? 50 : 30).map((a) => (
          <div key={a.uid} className="list-row">
            <div className="grow"><b>{a.name}</b><small>{a.regId ? `${a.regId} · ` : ''}{a.institution || a.email}</small></div>
            {a.checkedIn
              ? <><span className="door-in"><BadgeCheck size={15} aria-hidden="true" /> {fmtTime(a.checkedInAt)} · {METHOD[a.checkInMethod ?? 'pass'].toLowerCase()}</span>
                  <button className="link" onClick={() => { if (confirm(`Undo ${a.name}’s check-in?`)) undoCheckIn(event.id, a, user!).catch((x) => toast(friendlyError(x), 'err')); }}>Undo</button></>
              : <button className="btn btn-ghost btn-sm" onClick={() => admit(a, 'manual').then((r) => toast(r.title, r.kind === 'ok' || r.kind === 'already' ? 'ok' : 'err'))}>Mark as present</button>}
          </div>
        ))}
        {!shown.length && <p className="muted">{attendees.length ? 'No one matches.' : 'No one has registered yet.'}</p>}
        {!q && shown.length > 30 && <p className="muted">Showing 30 of {shown.length}. Search to find anyone else.</p>}
      </div>
      <CheckInHistory eventId={event.id} />
      {scanning && (
        <Modal title="Scan passes at the door" onClose={() => setScanning(false)}>
          <Scanner continuous onResult={onScan} />
          {result && (() => { const I = Ico[result.kind]; return <div className={`door-result ${result.kind}`} role="status"><I size={30} aria-hidden="true" /><div><b>{result.title}</b>{result.detail && <span>{result.detail}</span>}</div></div>; })()}
          <p className="muted">Keep scanning. {inCount} of {attendees.length} checked in.</p>
        </Modal>
      )}
    </section>
  );
}
