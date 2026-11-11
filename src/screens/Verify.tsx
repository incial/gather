'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, Logo, Spinner } from '../components/ui';
import { backend } from '../lib/backend';
import { fmtDateTime } from '../lib/format';
import type { CertificateDoc } from '../lib/types';

/** Public: anyone with the certificate's link or QR can check it's genuine. No sign-in needed. */
export function Verify() {
  const { cid } = useParams<{ cid: string }>();
  const [c, setC] = useState<CertificateDoc | null | undefined>(undefined);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const id = decodeURIComponent(cid).toUpperCase();
    if (!/^GTH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) { setC(null); return; }
    backend.getDoc<CertificateDoc>(`certificates/${id}`).then(setC).catch(() => setErr(true));
  }, [cid]);
  return (
    <div className="verify-page">
      <header className="top"><Logo /></header>
      <main className="verify">
        {err ? <p className="error">Couldn’t check right now. Try again in a moment.</p> : c === undefined ? <Spinner /> : c ? (
          <div className="verify-card ok">
            <span className="verify-badge"><Icon name="verified" size={30} /></span>
            <h1>Valid certificate</h1>
            <dl>
              <div><dt>Awarded to</dt><dd>{c.name}</dd></div>
              <div><dt>For</dt><dd>{c.eventTitle}</dd></div>
              <div><dt>Certificate</dt><dd>{c.title}</dd></div>
              {c.dates && <div><dt>Dates</dt><dd>{c.dates}</dd></div>}
              {c.organiser && <div><dt>Organised by</dt><dd>{c.organiser}</dd></div>}
              {c.issuedAt && <div><dt>Issued</dt><dd>{fmtDateTime(c.issuedAt)}</dd></div>}
              <div><dt>ID</dt><dd className="mono">{c.id}</dd></div>
            </dl>
            <p className="muted small">Issued through Gather by the event’s organisers.</p>
          </div>
        ) : (
          <div className="verify-card bad">
            <h1>Not found</h1>
            <p>No certificate has this ID. It may have been revoked, or the link is mistyped.</p>
          </div>
        )}
      </main>
    </div>
  );
}
