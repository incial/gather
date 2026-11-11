import { backend } from './backend';
import { shrinkImage } from './image';

/** Full banner lives in its own document (read only on the event page); a tiny copy sits on the event for cards. */
export const BANNER_BYTES = 420_000;
export const THUMB_BYTES = 26_000;
export const bannerPath = (eventId: string) => `events/${eventId}/media/banner`;

export async function prepareBanner(file: File) {
  const [data, thumb] = await Promise.all([shrinkImage(file, 1600, BANNER_BYTES), shrinkImage(file, 520, THUMB_BYTES)]);
  return { data, thumb };
}

export const saveBanner = (eventId: string, b: { data: string; thumb: string }) => backend.write([
  { type: 'set', path: bannerPath(eventId), data: { data: b.data } },
  { type: 'set', path: `events/${eventId}`, merge: true, data: { bannerThumb: b.thumb } },
]);

export const removeBanner = (eventId: string) => backend.write([
  { type: 'delete', path: bannerPath(eventId) },
  { type: 'set', path: `events/${eventId}`, merge: true, data: { bannerThumb: '' } },
]);

/**
 * Turns a YouTube or Vimeo link into an embeddable player address. Other sites aren't embedded:
 * the video stays where it is hosted, Gather never copies it.
 */
export function videoEmbedUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw.trim().startsWith('http') ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const id = (s: string | null | undefined) => (s && /^[\w-]{6,20}$/.test(s) ? s : null);
  if (host === 'youtu.be') { const v = id(u.pathname.slice(1)); return v ? `https://www.youtube-nocookie.com/embed/${v}` : null; }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = id(u.searchParams.get('v')) ?? id(u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]);
    return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const v = u.pathname.match(/(\d{6,12})/)?.[1];
    return v ? `https://player.vimeo.com/video/${v}` : null;
  }
  return null;
}
