'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Empty, ErrorNote, Field, Icon, Modal, useToast } from '../../components/ui';
import { ACCEPT, checkFile, deleteAsset, fmtSize, saveAsset, type AssetInput } from '../../lib/assets';
import { friendlyError } from '../../lib/format';
import { webUrl } from '../../lib/links';
import { useCol } from '../../lib/live';
import type { AssetDoc } from '../../lib/types';
import { useAdmin } from './context';

export const KIND: Record<AssetDoc['kind'], string> = { slides: 'Slides', document: 'Document', video: 'Video', link: 'Link', schedule: 'Schedule', other: 'Other' };

export function AdminAssets() {
  const { event, sessions } = useAdmin();
  const toast = useToast();
  const assets = useCol<AssetDoc>(`events/${event.id}/assets`);
  const [adding, setAdding] = useState(false);
  const title = (id: string) => sessions.find((s) => s.id === id)?.title;
  const sorted = [...assets.data].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h1>Event assets</h1>
          <p className="muted">Slides, handouts and links for people who joined the event.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add asset</button>
      </div>
      {!sorted.length && !assets.loading && <Empty title="No assets yet">Add the workshop slides, a handout, or a link to recordings.</Empty>}
      <div className="table-list">
        {sorted.map((a) => (
          <div key={a.id} className="list-row">
            <span className="asset-icon"><Icon name={a.fileName ? 'download' : 'external'} size={18} /></span>
            <div className="grow">
              <b>{a.title}</b>
              <small>{KIND[a.kind]}{a.fileName ? ` · ${a.fileName} · ${fmtSize(a.fileSize)}` : ` · ${a.url.replace(/^https?:\/\//, '').slice(0, 40)}`}{title(a.sessionId) ? ` · ${title(a.sessionId)}` : ''}</small>
            </div>
            <button className="link danger" onClick={() => { if (confirm(`Remove “${a.title}”? Attendees won’t see it any more.`)) deleteAsset(event.id, a).catch((x) => toast(friendlyError(x), 'err')); }}>Remove</button>
          </div>
        ))}
      </div>
      {adding && <AddAsset onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddAsset({ onClose }: { onClose: () => void }) {
  const { event, sessions } = useAdmin();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'file' | 'link'>('file');
  const [f, setF] = useState<AssetInput>({ title: '', description: '', kind: 'slides', sessionId: '', url: '', file: null });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkFile(file);
    if (problem) { setErr(problem); return; }
    setErr('');
    setF({ ...f, file, title: f.title || file.name.replace(/\.[^.]+$/, '') });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) { setErr('Give it a title.'); return; }
    if (mode === 'file' && !f.file) { setErr('Choose a file, or switch to “Add a link”.'); return; }
    if (mode === 'link' && !webUrl(f.url)) { setErr('Paste a valid web link (for example a Google Drive share link).'); return; }
    setBusy(true); setErr('');
    try { await saveAsset(event.id, { ...f, file: mode === 'file' ? f.file : null, url: mode === 'link' ? f.url : '' }); toast('Asset added'); onClose(); }
    catch (x) { setErr(friendlyError(x)); setBusy(false); }
  }
  return (
    <Modal title="Add asset" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Upload a file</button>
          <button type="button" role="tab" aria-selected={mode === 'link'} className={mode === 'link' ? 'on' : ''} onClick={() => { setMode('link'); if (f.kind === 'slides' || f.kind === 'document') setF({ ...f, kind: 'link' }); }}>Add a link</button>
        </div>
        {mode === 'file' ? (
          <div className="stack">
            <button type="button" className="btn btn-ghost btn-block" onClick={() => input.current?.click()}><Icon name="download" size={18} /> {f.file ? `${f.file.name} · ${fmtSize(f.file.size)}` : 'Choose file'}</button>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} />
            <p className="muted small">PDF, PowerPoint, Word, Excel, CSV, text or images, up to 700 KB. Larger files: upload to Google Drive or OneDrive and use “Add a link”.</p>
          </div>
        ) : (
          <Field label="Link" hint="Google Drive, OneDrive, Dropbox, YouTube… make sure sharing is set so attendees can open it."><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" /></Field>
        )}
        <Field label="Title"><input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="two">
          <Field label="Type">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as AssetDoc['kind'] })}>
              {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Session (optional)">
            <select value={f.sessionId} onChange={(e) => setF({ ...f, sessionId: e.target.value })}>
              <option value="">Whole event</option>
              {sorted.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description (optional)"><textarea rows={2} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Add asset'}</button>
      </form>
    </Modal>
  );
}
