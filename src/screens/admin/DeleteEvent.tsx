'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorNote, Modal, useToast } from '../../components/ui';
import { deleteEvent, purgeEvent } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';
import { friendlyError } from '../../lib/format';
import type { EventDoc } from '../../lib/types';

/**
 * Confirm-and-delete for an event, the counterpart of Create event. Asks for DELETE, then:
 * - normally (organisers): a soft delete. The event disappears for everyone at once (attendees,
 *   speakers, the organiser and their team) and only super admins can still see it;
 * - `permanent` (super admins, on an event that's already deleted): removes it and everything in it for good.
 */
export function DeleteEventDialog({ event, permanent = false, onClose, onDeleted }: { event: EventDoc; permanent?: boolean; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
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
      if (permanent) await purgeEvent(event.id, setStep);
      else await deleteEvent(event, user, setStep);
      toast(permanent ? `“${event.title}” was permanently deleted` : `“${event.title}” was deleted`);
      onDeleted();
    } catch (x) {
      setStep('');
      setErr(`Couldn’t finish deleting. ${friendlyError(x)} Try again.`);
    }
  }
  const c = (k: string, one: string, many: string) => (n[k] === null ? `${many}` : `${n[k]} ${n[k] === 1 ? one : many}`);
  return (
    <Modal title={permanent ? 'Permanently delete this event?' : 'Delete this event?'} onClose={() => { if (!busy) onClose(); }}>
      <div className="stack del-ev">
        {permanent ? (
          <>
            <p><b>{event.title}</b> and everything in it will be erased from the database:</p>
            <ul className="plain-bullets">
              <li>{c('attendees', 'registration', 'registrations')}, their passes and People entries</li>
              <li>{c('sessions', 'session', 'sessions')} and {c('speakers', 'speaker', 'speakers')}, speaker codes and roles</li>
              <li>{c('attendance', 'check-in record', 'check-in records')}, check-in history, feedback and certificates</li>
              <li>Announcements, Pulse sessions, Meet Pings and saves made for this event</li>
            </ul>
            <p className="muted">This can’t be undone. Download the CSVs first (Data tab) if you need them.</p>
          </>
        ) : (
          <>
            <p><b>{event.title}</b> will be removed for everyone, straight away:</p>
            <ul className="plain-bullets">
              <li>It disappears from attendees’ and speakers’ apps ({c('attendees', 'registration', 'registrations')}), Explore and saved events</li>
              <li>It leaves your organiser dashboard and your team’s, and its link and join code stop working</li>
              <li>Certificates for it no longer show on people’s profiles</li>
            </ul>
            <p className="muted">You won’t be able to open it again. The records are kept for the platform’s super admins. Download your CSVs first (Data tab) if you need them.</p>
          </>
        )}
        <label className="field"><span className="field-label">Type DELETE to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={busy} /></label>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block danger-btn" disabled={typed.trim().toUpperCase() !== 'DELETE' || busy} onClick={go}>
          <Trash2 size={16} /> {step || (permanent ? 'Delete permanently' : 'Delete event')}
        </button>
        {!busy && <button className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>}
      </div>
    </Modal>
  );
}
