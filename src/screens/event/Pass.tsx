'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import Link from 'next/link';
import { BadgeCheck, CalendarDays, Clock, Info, Mic, QrCode } from 'lucide-react';
import { Avatar, confetti, ErrorNote, Field, Modal, QrImage, useToast } from '../../components/ui';
import { ensureRegId, updateProfileFor, type Profile } from '../../lib/api';
import { backend } from '../../lib/backend';
import { fmtDate, fmtRange, fmtTime, friendlyError } from '../../lib/format';
import { passCodeFor } from '../../lib/qr';
import { useEventCtx } from './context';

const LEVELS = [
  { at: 0, name: 'Newcomer' }, { at: 0.25, name: 'Regular' }, { at: 0.5, name: 'Enthusiast' },
  { at: 0.75, name: 'Superfan' }, { at: 1, name: 'Legend' },
];

export function Pass() {
  const { event, me, sessions, speakers, attendance, connections, feedback } = useEventCtx();
  const [editing, setEditing] = useState(false);
  const [bigQr, setBigQr] = useState(false);
  const attended = new Set(attendance.map((a) => a.sessionId));
  const met = new Set(connections.map((c) => c.speakerId));
  const earned = attended.size + met.size + (feedback ? 1 : 0);
  const total = sessions.length + speakers.length + 1;
  const level = [...LEVELS].reverse().find((l) => earned / total >= l.at) ?? LEVELS[0];
  // Older registrations get their pass ID the first time the pass is opened.
  useEffect(() => { if (!me.regId) ensureRegId(event.id, me.uid).catch(() => {}); }, [event.id, me.uid, me.regId]);
  // Celebrate the moment staff check this person in while the pass is open.
  const wasIn = useRef(me.checkedIn);
  const [justIn, setJustIn] = useState(false);
  useEffect(() => {
    if (me.checkedIn && wasIn.current === false) { setJustIn(true); setBigQr(false); confetti(); }
    wasIn.current = !!me.checkedIn;
  }, [me.checkedIn]);
  const qr = me.regId ? passCodeFor(event.id, me.regId) : '';

  return (
    <div className="stack-lg pass-page">
      <WalletPass onQr={() => setBigQr(true)} qr={qr} justIn={justIn} />
      <nav className="pass-links" aria-label="Pass shortcuts">
        <button className="chip" onClick={() => setBigQr(true)} disabled={!qr}><QrCode size={17} /> Show QR</button>
        <Link className="chip" href={`/e/${event.id}/schedule`}><CalendarDays size={17} /> Schedule</Link>
        <Link className="chip" href={`/e/${event.id}/speakers`}><Mic size={17} /> Speakers</Link>
        <Link className="chip" href={`/e/${event.id}`}><Info size={17} /> Event details</Link>
      </nav>
      {bigQr && qr && <FullQr qr={qr} name={me.name} event={event.title} regId={me.regId ?? ''} onClose={() => setBigQr(false)} />}

      <section>
        <div className="row-between"><h2>Passport</h2><span className="pill">{level.name} · {earned}/{total}</span></div>
        <div className="stamps">
          {sessions.map((s, i) => (
            <div key={s.id} className={attended.has(s.id) ? 'stamp on' : 'stamp'} style={{ '--tilt': `${(i * 37) % 15 - 7}deg` } as React.CSSProperties}>
              <small>{fmtDate(s.startsAt)}</small><b>{s.title}</b>
            </div>
          ))}
          <Link href={`/e/${event.id}/feedback`} className={feedback ? 'stamp on' : 'stamp'} style={{ '--tilt': '4deg' } as React.CSSProperties}>
            <small>Feedback</small><b>{feedback ? 'Thank you!' : event.feedbackOpen ? 'Share yours' : 'Opens later'}</b>
          </Link>
        </div>
      </section>

      {speakers.length > 0 && (
        <section>
          <h2>Speakers met</h2>
          <div className="met">
            {speakers.map((s) => (
              <Link key={s.id} href={`/e/${event.id}/speakers/${s.id}`} className={met.has(s.id) ? 'met-item on' : 'met-item'} aria-label={`${s.name}${met.has(s.id) ? ', connected' : ''}`}>
                <Avatar id={s.id} name={s.name} photo={s.photo} size={52} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="pass-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit my details</button>
        <Link className="btn btn-ghost btn-sm" href="/">All events</Link>
        <button className="btn btn-ghost btn-sm" onClick={() => backend.signOut()}>Sign out</button>
      </div>
      {editing && <EditProfile onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const { event, me } = useEventCtx();
  const toast = useToast();
  const [f, setF] = useState<Profile>({ name: me.name, phone: me.phone, institution: me.institution, department: me.department, designation: me.designation });
  const [listed, setListed] = useState(me.listed !== false);
  const [err, setErr] = useState('');
  const set = (k: keyof Profile) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try { await updateProfileFor(event.id, me, f, listed); toast('Details saved'); onClose(); }
    catch (x) { setErr(friendlyError(x)); }
  }
  return (
    <Modal title="Edit my details" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Full name"><input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Institution"><input value={f.institution} onChange={set('institution')} /></Field>
        <Field label="Department"><input value={f.department} onChange={set('department')} /></Field>
        <Field label="Designation"><input value={f.designation} onChange={set('designation')} /></Field>
        <label className="check"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} /><span><b>Show me in People</b><small>Other attendees see your name, role and institution. Never your email or phone.</small></span></label>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block">Save</button>
      </form>
    </Modal>
  );
}

/** The pass itself: a ticket and a tear-off stub, with a gentle tilt that follows the mouse. */
function WalletPass({ qr, onQr, justIn }: { qr: string; onQr: () => void; justIn: boolean }) {
  const { event, me, role } = useEventCtx();
  const card = useRef<HTMLDivElement>(null);
  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !card.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = card.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.current.style.transform = `perspective(1000px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
  };
  const reset = () => { if (card.current) card.current.style.transform = ''; };
  const sub = [me.designation, me.institution].filter(Boolean).join(', ');
  return (
    <div className={`wallet a-${event.color}${justIn ? ' just-in' : ''}`} ref={card} onPointerMove={tilt} onPointerLeave={reset}>
      <div className="wallet-main">
        <div className={`wallet-head${event.bannerThumb ? ' has-art' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {event.bannerThumb && <img className="wallet-art" src={event.bannerThumb} alt="" />}
          <div className="wallet-bar">
            <span className="wallet-brand"><span className="logo-mark" aria-hidden="true" /><span>{event.organiser || 'Gather'}</span></span>
            <span className={`wallet-status${me.checkedIn ? ' in' : ''}`}>{me.checkedIn ? <><BadgeCheck size={13} aria-hidden="true" /> Checked in</> : 'Admit one'}</span>
          </div>
          <h1 className="wallet-title">{event.title}</h1>
        </div>
        <div className="wallet-body">
          <div className="wallet-who">
            <Avatar id={me.uid} name={me.name} photo={me.photo} size={56} />
            <div>
              <span className="wallet-label">{role ? 'Speaker' : 'Attendee'}</span>
              <span className="wallet-name">{me.name}</span>
              {sub && <span className="wallet-sub" title={sub}>{sub}</span>}
            </div>
          </div>
          <dl className="wallet-fields">
            <div><dt>Date</dt><dd>{fmtRange(event.startsAt, event.endsAt)}</dd></div>
            <div><dt>Time</dt><dd>{fmtTime(event.startsAt)}</dd></div>
            <div className="wide"><dt>Venue</dt><dd>{event.venue || '—'}</dd></div>
            <div><dt>Pass ID</dt><dd className="mono">{me.regId ?? '…'}</dd></div>
            <div><dt>Status</dt><dd>{me.checkedIn ? <><Clock size={12} aria-hidden="true" /> In at {fmtTime(me.checkedInAt)}</> : 'Not checked in'}</dd></div>
          </dl>
        </div>
      </div>
      <div className="wallet-stub">
        <button className="wallet-qr" onClick={onQr} disabled={!qr} aria-label="Show QR code full screen">
          {qr ? <QrImage text={qr} size={300} label="Your pass QR code" /> : <span className="muted">Preparing your pass…</span>}
          <small>{qr ? 'Tap to enlarge for scanning' : ''}</small>
        </button>
      </div>
      {justIn && <div className="wallet-success" role="status"><BadgeCheck size={36} aria-hidden="true" /><b>You’re in!</b><span>Checked in at {fmtTime(me.checkedInAt)}</span></div>}
    </div>
  );
}

/** Full-screen QR for scanning: large, high contrast, closes with Escape or a tap outside. */
function FullQr({ qr, name, event, regId, onClose }: { qr: string; name: string; event: string; regId: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const done = useRef<HTMLButtonElement>(null);
  const close = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    setClosing(true);
    setTimeout(onClose, 170);
  };
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const back = document.activeElement as HTMLElement | null;
    done.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); back?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`qr-full${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label="Pass QR code" onClick={close}>
      <div className="qr-full-card" onClick={(e) => e.stopPropagation()}>
        <span className="qr-full-name">{name}</span>
        <span className="muted">{event}</span>
        <QrImage text={qr} size={600} label="Your pass QR code" />
        <code className="qr-full-id">{regId}</code>
        <small className="muted">Turn your screen brightness up. Staff scan this at the entrance.</small>
        <button ref={done} className="btn btn-ink btn-block" onClick={close}>Done</button>
      </div>
    </div>
  );
}
