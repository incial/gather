'use client';

import { Maximize2, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal, QrImage } from '../../components/ui';
import type { PulseDoc } from '../../lib/pulse/types';
import { CopyButton } from './PulseHome';

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);
/** The short link people type or scan. Works for presentations and surveys. */
export const pulseJoinUrl = (code: string) => `${origin()}/pulse/join/${code}`;
export const surveyUrl = (id: string) => `${origin()}/pulse/survey/${id}`;
export const shareUrl = (p: Pick<PulseDoc, 'kind' | 'id' | 'code'>) => (p.kind === 'survey' ? surveyUrl(p.id) : pulseJoinUrl(p.code));
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/**
 * Full-screen join view for a projector: a QR big enough to scan from the back of the room,
 * the access code in large type, and the link with a Copy button. Esc or × closes it.
 */
export function JoinScreen({ p, onClose }: { p: Pick<PulseDoc, 'kind' | 'id' | 'code' | 'title'>; onClose: () => void }) {
  const url = pulseJoinUrl(p.code);
  const host = url.replace(/^https?:\/\//, '').replace(/\/pulse\/join\/.*/, '/pulse/join');
  const [size, setSize] = useState(320);
  useEffect(() => {
    const fit = () => setSize(Math.round(Math.max(200, Math.min(window.innerWidth * 0.8, window.innerHeight * 0.5, 560))));
    fit();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('resize', fit); window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="join-screen" role="dialog" aria-modal="true" aria-label={`Join ${p.title}`}>
      <button className="icon-btn join-screen-x" onClick={onClose} aria-label="Close"><X size={22} /></button>
      <p className="join-screen-title">{p.title}</p>
      <QrImage text={url} size={size} label={`QR code to join ${p.title}`} />
      <div className="join-screen-code"><span>Go to <b>{host}</b> and enter</span><b className="join-screen-big" aria-label={`Code ${p.code.split('').join(' ')}`}>{p.code}</b></div>
      <div className="row-center"><CopyButton text={url} /></div>
    </div>
  );
}

export function ShareModal({ p, onClose }: { p: PulseDoc; onClose: () => void }) {
  const url = shareUrl(p);
  const [big, setBig] = useState(false);
  if (big) return <JoinScreen p={p} onClose={() => setBig(false)} />;
  const msg = `${p.title}: ${p.kind === 'survey' ? 'please take a minute to answer' : 'join in'} ${url}`;
  return (
    <Modal title={`Share “${p.title}”`} onClose={onClose}>
      <div className="pl-share">
        <div className="stack">
          <QrImage text={pulseJoinUrl(p.code)} size={240} label={`QR code for ${p.title}`} />
          <button className="btn btn-ink btn-sm" onClick={() => setBig(true)}><Maximize2 size={15} /> Show full screen</button>
        </div>
        <div className="stack">
          <div><span className="field-label">Join code</span><div className="join-code join-code-xl">{p.code}</div><small className="muted">at {origin().replace(/^https?:\/\//, '')}/pulse/join</small></div>
          <input readOnly value={url} aria-label="Link" onFocus={(e) => e.target.select()} />
          <div className="row">
            <CopyButton text={url} />
            <a className="btn btn-ghost btn-sm" href={whatsappUrl(msg)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigator.share({ title: p.title, text: msg, url }).catch(() => {})}>More…</button>
            )}
          </div>
          <p className="muted">
            {p.access === 'event' ? 'Only people who joined the event can answer.' : p.access === 'signedIn' ? 'People sign in with Google to answer.' : 'Anyone with the link can answer, no account needed.'}
            {p.locked ? ' They also need the password.' : ''}
          </p>
        </div>
      </div>
    </Modal>
  );
}
