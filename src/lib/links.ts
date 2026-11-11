import type { SpeakerDoc, SpeakerLink } from './types';

/** Accepts a full URL or just a LinkedIn handle like "jane-doe". */
export function linkedinUrl(v: string) {
  const s = v.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(www\.)?linkedin\.com\//i.test(s)) return `https://${s}`;
  return `https://www.linkedin.com/in/${s.replace(/^@/, '').replace(/^in\//, '')}`;
}

/** Adds https:// when missing; refuses anything that isn't a web link. */
export function webUrl(v: string) {
  const s = v.trim();
  if (!s) return '';
  const full = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[^\s]+\.[^\s]+/i.test(full) ? full : '';
}

/** Every public link for a speaker, in display order. */
export function speakerLinks(s: SpeakerDoc): SpeakerLink[] {
  const out: SpeakerLink[] = [];
  const li = linkedinUrl(s.linkedin ?? '');
  if (li) out.push({ label: 'LinkedIn', url: li });
  const site = webUrl(s.website ?? '');
  if (site) out.push({ label: 'Website', url: site });
  for (const l of s.links ?? []) {
    const url = webUrl(l.url);
    if (url && l.label.trim()) out.push({ label: l.label.trim(), url });
  }
  return out;
}
