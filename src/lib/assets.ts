import { backend } from './backend';
import { downloadBlob } from './csv';
import { webUrl } from './links';
import type { AssetDoc } from './types';

/** Files are kept inside the database on the free plan, so they must be small. Bigger files go in as links. */
export const MAX_FILE_BYTES = 700 * 1024;
const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};
export const ACCEPT = Object.keys(ALLOWED).map((e) => `.${e}`).join(',');

export function checkFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED[ext]) return 'That file type isn’t supported. Use PDF, PowerPoint, Word, Excel, CSV, text or an image.';
  if (file.size > MAX_FILE_BYTES) return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Files up to 700 KB can be uploaded; for bigger ones, upload to Google Drive or OneDrive and add the share link instead.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(new Error('That file couldn’t be read.'));
  r.readAsDataURL(file);
});

export type AssetInput = Pick<AssetDoc, 'title' | 'description' | 'kind' | 'sessionId'> & { url: string; file: File | null };

/** Saves the asset's details, and the file in its own document so lists never download file contents. */
export async function saveAsset(eventId: string, a: AssetInput) {
  const id = backend.newId();
  const ext = a.file?.name.split('.').pop()?.toLowerCase() ?? '';
  const meta: Omit<AssetDoc, 'id'> = {
    title: a.title.trim().slice(0, 120), description: a.description.trim().slice(0, 500), kind: a.kind, sessionId: a.sessionId,
    url: a.file ? '' : webUrl(a.url), fileName: a.file?.name.slice(0, 120) ?? '', fileSize: a.file?.size ?? 0,
    mime: a.file ? ALLOWED[ext] : '', createdAt: backend.now() as string,
  };
  const ops = [];
  if (a.file) ops.push({ type: 'set' as const, path: `events/${eventId}/assetFiles/${id}`, data: { data: await toBase64(a.file), mime: ALLOWED[ext], name: meta.fileName } });
  ops.push({ type: 'set' as const, path: `events/${eventId}/assets/${id}`, data: meta as unknown as Record<string, unknown> });
  await backend.write(ops);
}

export const deleteAsset = (eventId: string, a: AssetDoc) => backend.write([
  { type: 'delete', path: `events/${eventId}/assets/${a.id}` },
  ...(a.fileName ? [{ type: 'delete' as const, path: `events/${eventId}/assetFiles/${a.id}` }] : []),
]);

/** Reads the file only when someone taps Download (one read). */
export async function downloadAsset(eventId: string, a: AssetDoc) {
  const f = await backend.getDoc<{ data: string; mime: string; name: string }>(`events/${eventId}/assetFiles/${a.id}`);
  if (!f) throw new Error('This file is no longer available.');
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  downloadBlob(f.name || a.fileName, new Blob([bytes], { type: f.mime || 'application/octet-stream' }));
}

export const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
