'use client';

import { useState } from 'react';
import { Icon, Modal, useToast } from '../../components/ui';
import { certificatePdf, drawCertificate } from '../../lib/certificates';
import { downloadBlob } from '../../lib/csv';
import { backend } from '../../lib/backend';
import { useDoc } from '../../lib/live';
import type { CertificateDoc } from '../../lib/types';
import { useEventCtx } from './context';

/** Shows the attendee's certificate when certificates are on, with download and a verification link. */
export function CertificateCard() {
  const { event, me } = useEventCtx();
  const toast = useToast();
  const on = !!event.certificates?.on;
  const idx = useDoc<{ certId: string }>(on ? `events/${event.id}/certIndex/${me.uid}` : null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  if (!on) return null;
  const certId = idx.data?.certId;
  const verifyUrl = certId ? `${location.origin}/verify/${certId}` : '';

  async function download() {
    if (!certId) return;
    setBusy(true);
    try {
      const c = await backend.getDoc<CertificateDoc>(`certificates/${certId}`);
      if (!c) throw new Error('missing');
      downloadBlob(`${event.title} - certificate.pdf`, await certificatePdf(c, verifyUrl));
    } catch { toast('Couldn’t make the certificate. Check your connection and try again.', 'err'); }
    setBusy(false);
  }
  async function view() {
    if (!certId) return;
    setBusy(true);
    try {
      const c = await backend.getDoc<CertificateDoc>(`certificates/${certId}`);
      if (!c) throw new Error('missing');
      setPreview((await drawCertificate(c, verifyUrl)).toDataURL('image/jpeg', 0.85));
    } catch { toast('Couldn’t show the certificate. Check your connection and try again.', 'err'); }
    setBusy(false);
  }
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: `My certificate: ${event.title}`, url: verifyUrl }); else { await navigator.clipboard.writeText(verifyUrl); toast('Verification link copied'); } } catch { /* closed */ }
  };
  return (
    <section className={`cert-card${certId ? ' is-ready' : ''}`}>
      <span className="cert-icon"><Icon name="verified" size={24} /></span>
      <div className="grow">
        <b>{certId ? 'Your certificate is ready' : 'Certificate'}</b>
        <small>{certId ? `ID ${certId}` : `Issued after the event to people who attended at least ${event.certificates!.minAttendance}% of sessions${event.certificates!.requireFeedback ? ' and gave feedback' : ''}.`}</small>
      </div>
      {certId && (
        <div className="row">
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={view}>View</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={download}>{busy ? 'Working…' : 'Download PDF'}</button>
          <button className="btn btn-ghost btn-sm" onClick={share}>Share</button>
        </div>
      )}
      {preview && (
        <Modal title="Your certificate" onClose={() => setPreview('')}>
          <img className="cert-preview" src={preview} alt={`Certificate for ${me.name}`} />
          <button className="btn btn-primary btn-block" disabled={busy} onClick={download}>{busy ? 'Working…' : 'Download PDF'}</button>
        </Modal>
      )}
    </section>
  );
}
