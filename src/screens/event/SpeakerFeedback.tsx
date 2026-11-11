'use client';

import { CheckCircle2, EyeOff, MessageSquareHeart } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorNote, Stars, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';
import { friendlyError } from '../../lib/format';
import { sendSpeakerFeedback } from '../../lib/speakers';
import type { SpeakerDoc } from '../../lib/types';
import { useEventCtx } from './context';

/** Attendee → speaker feedback. Speakers can read feedback about them, never send it. */
export function SpeakerFeedbackForm({ speaker }: { speaker: Pick<SpeakerDoc, 'id' | 'name'> }) {
  const { event, me, role } = useEventCtx();
  const { user } = useAuth();
  const toast = useToast();
  const [sent, setSent] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ownerPath = `events/${event.id}/speakerFeedbackOwners/${speaker.id}_${me.uid}`;

  useEffect(() => {
    if (role) { setSent(false); return; }
    backend.getDoc(ownerPath).then((d) => setSent(!!d)).catch(() => setSent(false));
  }, [ownerPath, role]);

  if (role) {
    if (role.speakerId === speaker.id) return null;
    return <section className="card profile-sec sfb"><p className="muted">You’re a speaker at this event, so speaker feedback is turned off for you. Feedback you receive appears in your speaker area.</p></section>;
  }
  if (sent === null) return null;
  if (sent) return <section className="card profile-sec sfb sfb-done"><CheckCircle2 size={22} aria-hidden="true" /><span>You sent feedback to {speaker.name}. Thank you.</span></section>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!rating) { setErr('Choose a star rating.'); return; }
    setErr(''); setBusy(true);
    try {
      await sendSpeakerFeedback(event.id, { uid: me.uid, name: me.name || user?.name || '', photo: user?.photo ?? me.photo }, speaker.id, rating, text, anonymous);
      setSent(true);
      toast('Feedback sent');
    } catch (x) { setErr(/permission/i.test(String(x)) ? 'This feedback couldn’t be sent. You may have already sent feedback to this speaker.' : friendlyError(x)); }
    setBusy(false);
  }

  return (
    <form className="card profile-sec sfb" onSubmit={submit}>
      <h2><MessageSquareHeart size={20} aria-hidden="true" /> Feedback for {speaker.name}</h2>
      <Stars value={rating} onChange={setRating} label={`Rate ${speaker.name}`} />
      <textarea rows={3} maxLength={1000} value={text} placeholder="What stood out? What could be better? (optional)" aria-label="Written feedback" onChange={(e) => setText(e.target.value)} />
      <label className="sfb-toggle">
        <input type="checkbox" role="switch" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span className="sfb-switch" aria-hidden="true" />
        <span>Send feedback anonymously</span>
      </label>
      <small className="muted">{anonymous
        ? <><EyeOff size={13} aria-hidden="true" /> {speaker.name} will see your rating and comment but not who you are. Organisers can see the sender only to deal with abuse.</>
        : <>Your name and photo are shown to {speaker.name} with your feedback.</>}</small>
      <ErrorNote text={err} />
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
    </form>
  );
}
