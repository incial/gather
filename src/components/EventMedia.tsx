'use client';

import { CalendarRange, Download, Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { downloadAsset, fmtSize } from '../lib/assets';
import { backend } from '../lib/backend';
import { bannerPath, videoEmbedUrl } from '../lib/eventMedia';
import { useCol, useDoc } from '../lib/live';
import type { AssetDoc, EventDoc } from '../lib/types';
import { useToast } from './ui';

/** The event banner: the small copy shows at once, the full picture replaces it when loaded. */
export function EventBanner({ event, className = '' }: { event: Pick<EventDoc, 'id' | 'title' | 'bannerThumb'>; className?: string }) {
  const full = useDoc<{ data: string }>(event.bannerThumb ? bannerPath(event.id) : null);
  if (!event.bannerThumb) return null;
  return (
    <div className={`ev-banner ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={full.data?.data || event.bannerThumb} alt={`${event.title} banner`} className={full.data ? '' : 'blur'} />
    </div>
  );
}

export function EventVideo({ url, title }: { url?: string; title: string }) {
  const src = videoEmbedUrl(url);
  if (!src) return null;
  return (
    <div className="ev-video">
      <iframe src={src} title={`${title} video`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  );
}

/** The schedule file the organiser uploaded (PDF or image), to view or download. */
export function ScheduleFiles({ eventId, compact }: { eventId: string; compact?: boolean }) {
  const where = useMemo<[string, unknown][]>(() => [['kind', 'schedule']], []);
  const files = useCol<AssetDoc>(`events/${eventId}/assets`, where);
  const toast = useToast();
  const [busy, setBusy] = useState('');
  if (!files.data.length) return null;
  async function view(a: AssetDoc) {
    setBusy(a.id);
    // Open the window first so phones don't block it, then fill it with the file.
    const w = window.open('', '_blank');
    try {
      const f = await backend.getDoc<{ data: string; mime: string }>(`events/${eventId}/assetFiles/${a.id}`);
      if (!f) throw new Error('This file is no longer available.');
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
      if (w) w.location.href = url; else window.location.href = url;
    } catch (x) { w?.close(); toast((x as Error).message, 'err'); }
    setBusy('');
  }
  return (
    <div className={`ev-schedule-files${compact ? ' compact' : ''}`}>
      {files.data.map((a) => (
        <div key={a.id} className="ev-schedule-file">
          <span className="ev-file-ic"><CalendarRange size={22} aria-hidden="true" /></span>
          <div><b>{a.title || 'Event schedule'}</b><small className="muted">{a.fileName ? `${a.fileName.split('.').pop()?.toUpperCase()} · ${fmtSize(a.fileSize)}` : 'Link'}</small></div>
          {a.fileName ? (
            <div className="row">
              <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => view(a)}><Eye size={15} /> View</button>
              <button className="btn btn-ink btn-sm" onClick={() => downloadAsset(eventId, a).catch((x) => toast((x as Error).message, 'err'))}><Download size={15} /> Download</button>
            </div>
          ) : <a className="btn btn-ink btn-sm" href={a.url} target="_blank" rel="noreferrer">Open</a>}
        </div>
      ))}
    </div>
  );
}
