'use client';

import { useMemo, useState } from 'react';
import { Empty, ErrorNote, Field, Spinner, useToast } from '../../components/ui';
import { updateEvent } from '../../lib/api';
import { DEFAULT_CERT, eligibility, issueCertificates, revokeCertificate, type Eligibility } from '../../lib/certificates';
import { friendlyError } from '../../lib/format';
import { useCol } from '../../lib/live';
import type { CertConfig } from '../../lib/types';
import { loadEventData, useAdmin } from './context';

export function AdminCertificates() {
  const base = useAdmin();
  const { event, sessions } = base;
  const toast = useToast();
  const saved = event.certificates ?? DEFAULT_CERT;
  const [cfg, setCfg] = useState<CertConfig>({ ...DEFAULT_CERT, ...saved, signers: [...(saved.signers ?? []), { name: '', title: '' }, { name: '', title: '' }].slice(0, 3) });
  const index = useCol<{ id: string; uid: string; certId: string }>(`events/${event.id}/certIndex`);
  const issued = useMemo(() => Object.fromEntries(index.data.map((i) => [i.uid, i.certId])), [index.data]);
  const [people, setPeople] = useState<Eligibility[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async (next: CertConfig, msg: string) => {
    const clean = { ...next, minAttendance: Math.max(0, Math.min(100, Math.round(next.minAttendance || 0))), title: next.title.trim() || DEFAULT_CERT.title, signers: next.signers.map((s) => ({ name: s.name.trim(), title: s.title.trim() })) };
    try { await updateEvent(event.id, { certificates: clean }); setCfg({ ...clean, signers: [...clean.signers, { name: '', title: '' }].slice(0, 3) }); toast(msg); }
    catch (x) { toast(friendlyError(x), 'err'); }
  };
  async function check() {
    setBusy(true); setErr('');
    try {
      const d = await loadEventData(base);
      setPeople(eligibility(cfg, sessions, d.attendees, d.attendance, d.feedback, d.sessionFeedback));
    } catch { setErr('Couldn’t load attendance. Check your connection and try again.'); }
    setBusy(false);
  }
  async function issue() {
    if (!people) return;
    setBusy(true);
    try { const n = await issueCertificates(event, cfg, people, issued); toast(n ? `Issued ${n} certificates` : 'Everyone eligible already has one'); }
    catch (x) { toast(friendlyError(x), 'err'); }
    setBusy(false);
  }
  const eligible = people?.filter((p) => p.eligible) ?? [];
  const toIssue = eligible.filter((p) => !issued[p.attendee.uid]).length;

  return (
    <div className="stack-lg narrow">
      <div className="row-between">
        <h1>Certificates</h1>
        <label className="switch-row"><input type="checkbox" checked={!!saved.on} onChange={(e) => save({ ...cfg, on: e.target.checked }, e.target.checked ? 'Certificates are on' : 'Certificates are off')} /> <b>{saved.on ? 'On' : 'Off'}</b></label>
      </div>
      <p className="muted">When on, people you issue a certificate to can download it as a PDF from the event, with a QR code anyone can scan to verify it. Certificates are made on the attendee’s phone, so nothing is stored but a small record.</p>

      <section className="panel">
        <h2>Settings</h2>
        <Field label="Certificate title"><input value={cfg.title} maxLength={60} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} /></Field>
        <div className="two">
          <Field label="Minimum attendance (%)" hint="Share of sessions checked in to. Breaks don’t count."><input type="number" min={0} max={100} value={cfg.minAttendance} onChange={(e) => setCfg({ ...cfg, minAttendance: Number(e.target.value) })} /></Field>
          <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={cfg.requireFeedback} onChange={(e) => setCfg({ ...cfg, requireFeedback: e.target.checked })} /> Must give feedback</label>
        </div>
        <span className="field-label">Signatures (optional)</span>
        {cfg.signers.map((s, i) => (
          <div key={i} className="two">
            <input aria-label={`Signatory ${i + 1} name`} placeholder="Name" value={s.name} onChange={(e) => setCfg({ ...cfg, signers: cfg.signers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input aria-label={`Signatory ${i + 1} title`} placeholder="Title, e.g. Principal" value={s.title} onChange={(e) => setCfg({ ...cfg, signers: cfg.signers.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => save(cfg, 'Settings saved')}>Save settings</button>
      </section>

      <section className="panel">
        <div className="row-between">
          <h2>Issue certificates</h2>
          <span className="pill">{index.data.length} issued</span>
        </div>
        <p className="muted">Check who qualifies with the current settings, then issue. Running it again only adds people who don’t have one yet.</p>
        <div className="row">
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={check}>{busy && !people ? 'Checking…' : 'Check who qualifies'}</button>
          {people && <button className="btn btn-primary btn-sm" disabled={busy || !toIssue} onClick={issue}>{busy ? 'Issuing…' : `Issue to ${toIssue} ${toIssue === 1 ? 'person' : 'people'}`}</button>}
        </div>
        <ErrorNote text={err} />
        {busy && !people && <Spinner />}
        {people && (people.length === 0 ? <Empty title="No attendees yet" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Attendance</th><th>Feedback</th><th>Status</th><th /></tr></thead>
              <tbody>
                {[...people].sort((a, b) => b.percent - a.percent).map((p) => (
                  <tr key={p.attendee.uid}>
                    <td><b>{p.attendee.name}</b></td>
                    <td>{p.attended}/{p.total} · {p.percent}%</td>
                    <td>{p.gaveFeedback ? 'Yes' : 'No'}</td>
                    <td>{issued[p.attendee.uid] ? 'Issued' : p.eligible ? 'Eligible' : 'Not yet'}</td>
                    <td>{issued[p.attendee.uid] && <button className="link danger" onClick={() => { if (confirm(`Revoke ${p.attendee.name}’s certificate? Its verification link will stop working.`)) revokeCertificate(event.id, p.attendee.uid, issued[p.attendee.uid]).catch((x) => toast(friendlyError(x), 'err')); }}>Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
