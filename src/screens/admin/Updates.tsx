'use client';

import { Megaphone, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { ErrorNote, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';
import { fmtDateTime, friendlyError } from '../../lib/format';
import { useCol } from '../../lib/live';
import { useAdmin } from './context';

interface Notice { id: string; text: string; by: string; byName: string; at: string }
const MAX = 500;

/**
 * Organiser notices and updates. Each one appears straight away in attendees' Live updates on Home
 * and in the event's Live feed, with a pop-up for anyone who has Gather open.
 */
export function Updates() {
  const { event } = useAdmin();
  const { user } = useAuth();
  const toast = useToast();
  const list = useCol<Notice>(`events/${event.id}/announcements`);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...list.data].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')), [list.data]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr('');
    try {
      await backend.write([{ type: 'set', path: `events/${event.id}/announcements/${backend.newId()}`, data: {
        text: text.trim().slice(0, MAX), by: user!.uid, byName: (user!.name || user!.email).slice(0, 80), at: backend.now(),
      } }]);
      setText(''); toast('Notice sent to attendees');
    } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }
  async function remove(n: Notice) {
    if (!confirm('Delete this notice? Attendees will no longer see it.')) return;
    try { await backend.write([{ type: 'delete', path: `events/${event.id}/announcements/${n.id}` }]); toast('Notice deleted'); }
    catch (x) { toast(friendlyError(x), 'err'); }
  }

  return (
    <div className="stack-lg narrow">
      <div>
        <h1>Updates</h1>
        <p className="muted">Send notices to everyone at {event.title}. They appear at once in attendees’ Live updates on Home and in the event’s Live feed, with a pop-up for anyone who has Gather open.</p>
      </div>
      <form className="panel stack" onSubmit={send}>
        <label className="field"><span className="field-label"><Megaphone size={15} aria-hidden="true" /> New notice</span>
          <textarea rows={3} maxLength={MAX} value={text} placeholder="e.g. Lunch is served in Hall B. The afternoon session starts at 2 pm." onChange={(e) => setText(e.target.value)} />
          <span className="field-hint">{text.length}/{MAX}</span>
        </label>
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send to attendees'}</button>
        <p className="muted small">New files in <Link className="link" href={`/admin/e/${event.id}/assets`}>Assets</Link> (like presentations) and live polls from <Link className="link" href={`/admin/e/${event.id}/activities`}>Activities</Link> show up in Live updates automatically.</p>
      </form>
      <section className="stack">
        <h2>Sent notices</h2>
        {!sorted.length ? <p className="muted">No notices yet.</p> : (
          <ul className="notice-list">
            {sorted.map((n) => (
              <li key={n.id} className="panel">
                <p className="prose">{n.text}</p>
                <div className="row-between"><small className="muted">{n.byName} · {fmtDateTime(n.at)}</small>
                  <button className="icon-btn" aria-label="Delete notice" onClick={() => remove(n)}><Trash2 size={16} /></button></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
