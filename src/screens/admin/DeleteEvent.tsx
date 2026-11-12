'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorNote, Modal, useToast } from '../../components/ui';
import { deleteEvent } from '../../lib/api';
import { backend } from '../../lib/backend';
import { friendlyError } from '../../lib/format';
import type { EventDoc } from '../../lib/types';

/**
 * Confirm-and-delete for an event, the counterpart of Create event. Shows what will go, asks for
 * DELETE, then removes the event and everything in it for everyone, with progress as it goes.
 */
export function DeleteEventDialog({ event, onClose, onDeleted }: { event: Pick<EventDoc, 'id' | 'title'>; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  const [n, setN] = useState<Record<string, number | null>>({ attendees: null, sessions: null, speakers: null, attendance: null });
  useEffect(() => {
    for (const k of Object.keys(n)) backend.count(`events/${event.id}/${k}`).then((c) => setN((x) => ({ ...x, [k]: c }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);
  const busy = !!step;
  async function go() {
    setErr('');
    try {
      await deleteEvent(event.id, setStep);
      toast(`“${event.title}” was deleted`);
      onDeleted();
    } catch (x) {
      setStep('');
      setErr(`Couldn’t finish deleting. ${friendlyError(x)} Nothing you can see was left half-deleted; try again.`);
    }
  }
  const c = (k: string, one: string, many: string) => (n[k] === null ? `${many}` : `${n[k]} ${n[k] === 1 ? one : many}`);
  return (
    <Modal title="Delete this event?" onClose={() => { if (!busy) onClose(); }}>
      <div className="stack del-ev">
        <p><b>{event.title}</b> and everything in it will be permanently deleted for everyone:</p>
        <ul className="plain-bullets">
          <li>{c('attendees', 'registration', 'registrations')}, their passes and People entries</li>
          <li>{c('sessions', 'session', 'sessions')} and {c('speakers', 'speaker', 'speakers')}, speaker codes and roles</li>
          <li>{c('attendance', 'check-in record', 'check-in records')}, check-in history, feedback and certificates</li>
          <li>Announcements, Pulse sessions, Meet Pings and saves made for this event</li>
        </ul>
        <p className="muted">This can’t be undone. Download your CSVs first (Data tab) if you need them.</p>
        <label className="field"><span className="field-label">Type DELETE to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={busy} /></label>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block danger-btn" disabled={typed.trim().toUpperCase() !== 'DELETE' || busy} onClick={go}>
          <Trash2 size={16} /> {step || 'Delete event'}
        </button>
        {!busy && <button className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>}
      </div>
    </Modal>
  );
}
