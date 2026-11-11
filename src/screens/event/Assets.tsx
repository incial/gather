'use client';

import { useState } from 'react';
import { Empty, Icon, LoadError, Spinner, useToast } from '../../components/ui';
import { downloadAsset, fmtSize } from '../../lib/assets';
import { useCol } from '../../lib/live';
import type { AssetDoc } from '../../lib/types';
import { KIND } from '../admin/AdminAssets';
import { useEventCtx } from './context';
import { CertificateCard } from './CertificateCard';

export function Assets() {
  const { event, sessions } = useEventCtx();
  const toast = useToast();
  const assets = useCol<AssetDoc>(`events/${event.id}/assets`);
  const [busy, setBusy] = useState('');
  const groups = new Map<string, AssetDoc[]>();
  for (const a of [...assets.data].sort((x, y) => (x.createdAt ?? '').localeCompare(y.createdAt ?? ''))) {
    groups.set(a.sessionId, [...(groups.get(a.sessionId) ?? []), a]);
  }
  const order = ['', ...[...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((s) => s.id)].filter((id) => groups.has(id));
  const get = async (a: AssetDoc) => {
    setBusy(a.id);
    try { await downloadAsset(event.id, a); } catch (x) { toast((x as Error).message || 'Download failed. Try again.', 'err'); }
    setBusy('');
  };
  return (
    <div className="stack-lg">
      <div>
        <h1>Event assets</h1>
        <p className="muted">Slides, handouts and links shared by the organisers.</p>
      </div>
      <CertificateCard />
      {assets.error ? <LoadError /> : assets.loading ? <Spinner /> : !assets.data.length ? <Empty title="Nothing shared yet">Organisers will add slides and documents here.</Empty> : order.map((sid) => (
        <section key={sid || 'event'} className="stack">
          <h2 className="asset-group">{sid ? sessions.find((s) => s.id === sid)?.title ?? 'Session' : 'For the whole event'}</h2>
          {groups.get(sid)!.map((a) => (
            <div key={a.id} className="asset card">
              <span className="asset-icon"><Icon name={a.fileName ? 'download' : a.kind === 'video' ? 'mic' : 'external'} size={20} /></span>
              <div className="grow">
                <b>{a.title}</b>
                <small>{KIND[a.kind]}{a.fileName ? ` · ${fmtSize(a.fileSize)}` : ''}</small>
                {a.description && <p className="asset-desc">{a.description}</p>}
              </div>
              {a.fileName
                ? <button className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => get(a)}>{busy === a.id ? '…' : 'Download'}</button>
                : <a className="btn btn-ghost btn-sm" href={a.url} target="_blank" rel="noopener noreferrer">Open</a>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
