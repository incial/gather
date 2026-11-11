'use client';

import { useState, type FormEvent } from 'react';
import { confetti, ErrorNote, Field, Modal, Stars, useToast } from '../../components/ui';
import { saveSessionFeedback } from '../../lib/api';
import { friendlyError } from '../../lib/format';
import type { SessionDoc } from '../../lib/types';
import { useEventCtx } from './context';

export function RateModal({ session, onClose, prompt }: { session: SessionDoc; onClose: () => void; prompt?: boolean }) {
  const { event, me, sessionFeedback } = useEventCtx();
  const toast = useToast();
  const mine = sessionFeedback.find((f) => f.sessionId === session.id);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!rating) { setErr('Tap a star to rate this session.'); return; }
    setBusy(true);
    try {
      await saveSessionFeedback(event.id, me, session.id, rating, comment);
      if (!mine) confetti();
      toast('Thanks for your feedback');
      onClose();
    } catch (x) { setErr(friendlyError(x)); setBusy(false); }
  }
  return (
    <Modal title={prompt ? 'How was it?' : session.title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {prompt && <p className="prompt-intro"><span>That session just ended.</span> <b>{session.title}</b></p>}
        <div className="rate-stars"><Stars label={`Rate ${session.title}`} value={rating} onChange={setRating} /></div>
        <Field label="What stood out? (optional)"><textarea rows={3} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} /></Field>
        <p className="muted">The organisers see your name with your rating.</p>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : mine ? 'Update feedback' : 'Send feedback'}</button>
        {prompt && <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>Not now</button>}
      </form>
    </Modal>
  );
}
