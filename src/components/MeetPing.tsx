'use client';

import { Check, Clock, Handshake, Send, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCol } from '../lib/live';
import { answerPing, DEFAULT_PING, MAX_PING, relation, resendPing, sendPing, withdrawPing, type PingDoc, type PingPerson } from '../lib/meetping';
import { friendlyError } from '../lib/format';
import { ErrorNote, Modal, useToast } from './ui';

/** My Meet Pings at one event, both directions (two small queries the security rules allow). */
export function useEventPings(eventId: string, uid: string | undefined) {
  const outW = useMemo<[string, unknown][]>(() => [['fromUid', uid], ['eventId', eventId]], [uid, eventId]);
  const inW = useMemo<[string, unknown][]>(() => [['toUid', uid], ['eventId', eventId]], [uid, eventId]);
  const out = useCol<PingDoc>(uid ? 'pings' : null, outW);
  const inc = useCol<PingDoc>(uid ? 'pings' : null, inW);
  return useMemo(() => [...out.data, ...inc.data], [out.data, inc.data]);
}

/** The Meet action for one person: send (with a message), sent, accept/decline, or connected. */
export function MeetButton({ event, me, other, pings, compact }: { event: { id: string; title: string }; me: PingPerson; other: PingPerson; pings: PingDoc[]; compact?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = relation(me.uid, other.uid, pings);
  if (other.uid === me.uid) return null;
  const sz = compact ? 'btn-sm' : '';

  async function answer(accept: boolean) {
    if (!r.ping) return;
    setBusy(true);
    try { await answerPing(r.ping, accept, me); toast(accept ? `You’re connected with ${other.name}` : 'Request declined'); }
    catch (x) { toast(friendlyError(x), 'err'); }
    setBusy(false);
  }

  if (r.kind === 'connected') return <span className={`btn btn-ghost ${sz} meet-state connected`}><Handshake size={15} aria-hidden="true" /> Connected</span>;
  if (r.kind === 'incoming') return (
    <span className="row meet-answer">
      <button className={`btn btn-primary ${sz}`} disabled={busy} onClick={() => answer(true)}><Check size={15} /> Accept</button>
      <button className={`btn btn-ghost ${sz}`} disabled={busy} onClick={() => answer(false)}><X size={15} /> Decline</button>
    </span>
  );
  if (r.kind === 'sent') return (
    <button className={`btn btn-ghost ${sz} meet-state`} title="Waiting for a reply. Tap to cancel it." disabled={busy}
      onClick={() => { if (r.ping && confirm(`Cancel your Meet Ping to ${other.name}?`)) withdrawPing(r.ping).then(() => toast('Meet Ping cancelled')).catch((x) => toast(friendlyError(x), 'err')); }}>
      <Clock size={15} aria-hidden="true" /> Ping sent
    </button>
  );
  if (r.kind === 'declined') return <span className={`btn btn-ghost ${sz} meet-state`} aria-disabled="true">Not now</span>;
  return (
    <>
      <button className={`btn btn-primary ${sz}`} onClick={() => setOpen(true)} aria-label={`Meet ${other.name}`}><Handshake size={15} /> {r.kind === 'cancelled' ? 'Send again' : 'Meet'}</button>
      {open && <Composer event={event} me={me} other={other} again={r.kind === 'cancelled' ? r.ping : undefined} onClose={() => setOpen(false)} />}
    </>
  );
}

export function Composer({ event, me, other, again, onClose }: { event: { id: string; title: string }; me: PingPerson; other: PingPerson; again?: PingDoc; onClose: () => void }) {
  const toast = useToast();
  const [msg, setMsg] = useState(DEFAULT_PING);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setErr('');
    try { await (again ? resendPing(again, msg) : sendPing(event, me, other, msg)); toast(`Meet Ping sent to ${other.name}`); onClose(); }
    catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }
  return (
    <Modal title={`Meet ${other.name}`} onClose={onClose}>
      <div className="stack">
        <p className="muted">They’ll get your message in Gather{' '}and can accept or decline. Your email and phone aren’t shared.</p>
        <label className="field"><span className="field-label">Message</span>
          <textarea rows={3} maxLength={MAX_PING} value={msg} onChange={(e) => setMsg(e.target.value)} />
          <span className="field-hint">{msg.length}/{MAX_PING}</span>
        </label>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block" disabled={busy || !msg.trim()} onClick={send}><Send size={16} /> {busy ? 'Sending…' : 'Send Meet Ping'}</button>
      </div>
    </Modal>
  );
}
