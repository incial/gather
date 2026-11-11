'use client';

import { MessageCircle } from 'lucide-react';
import { Modal, QrImage } from '../../components/ui';
import type { PulseDoc } from '../../lib/pulse/types';
import { CopyButton } from './PulseHome';

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);
/** The short link people type or scan. Works for presentations and surveys. */
export const pulseJoinUrl = (code: string) => `${origin()}/pulse/join/${code}`;
export const surveyUrl = (id: string) => `${origin()}/pulse/survey/${id}`;
export const shareUrl = (p: Pick<PulseDoc, 'kind' | 'id' | 'code'>) => (p.kind === 'survey' ? surveyUrl(p.id) : pulseJoinUrl(p.code));
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export function ShareModal({ p, onClose }: { p: PulseDoc; onClose: () => void }) {
  const url = shareUrl(p);
  const msg = `${p.title}: ${p.kind === 'survey' ? 'please take a minute to answer' : 'join in'} ${url}`;
  return (
    <Modal title={`Share “${p.title}”`} onClose={onClose}>
      <div className="pl-share">
        <QrImage text={url} size={200} label={`QR code for ${p.title}`} />
        <div className="stack">
          <div><span className="field-label">Join code</span><div className="join-code">{p.code}</div><small className="muted">at {origin().replace(/^https?:\/\//, '')}/pulse/join</small></div>
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
