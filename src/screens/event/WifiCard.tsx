'use client';

import { useState } from 'react';
import { Icon, Modal, QrImage, useToast } from '../../components/ui';
import type { EventInfoDoc } from '../../lib/types';

const esc = (v: string) => v.replace(/([\;,":])/g, '\\$1');

export function WifiCard({ info }: { info: EventInfoDoc }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [qr, setQr] = useState(false);
  const copy = () => navigator.clipboard.writeText(info.wifiPassword).then(() => toast('Password copied'), () => toast('Couldn’t copy. Tap Show and type it in.', 'err'));
  return (
    <section className="wifi card" id="wifi">
      <span className="wifi-icon"><Icon name="wifi" size={22} /></span>
      <div className="grow">
        <small>Event Wi-Fi</small>
        <b>{info.wifiName}</b>
        {info.wifiPassword && <code>{show ? info.wifiPassword : '•'.repeat(10)}</code>}
      </div>
      {info.wifiPassword && <div className="wifi-actions">
        <button className="chip" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        <button className="chip" onClick={copy}>Copy</button>
        <button className="chip" onClick={() => setQr(true)}>QR</button>
      </div>}
      {qr && (
        <Modal title="Join the Wi-Fi" onClose={() => setQr(false)}>
          <div className="print-card">
            <QrImage text={`WIFI:T:WPA;S:${esc(info.wifiName)};P:${esc(info.wifiPassword)};;`} size={240} label={`QR code to join ${info.wifiName}`} />
            <p className="muted">Scan with another phone’s camera to connect it.</p>
          </div>
        </Modal>
      )}
    </section>
  );
}
