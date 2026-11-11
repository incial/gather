import { backend } from './backend';
import { webUrl } from './links';
import type { AppUser, SpeakerLink } from './types';

/** The part of a person other signed-in Gather users can see. Phone and email are never stored here. */
export interface PublicProfile {
  id: string; // the user's uid
  profileId: string; // short shareable ID, e.g. "g7k2m9qx"
  name: string;
  photo: string;
  photoSource: 'google' | 'upload' | 'none';
  headline: string;
  bio: string;
  organisation: string;
  designation: string;
  education: string;
  skills: string[];
  interests: string[];
  location: string;
  linkedin: string;
  website: string;
  portfolio: string;
  links: SpeakerLink[];
  /** public: visible to signed-in Gather users. private: only you (and organisers of events you join). */
  visibility: 'public' | 'private';
  updatedAt?: string;
}

export const PROFILE_FIELDS = ['profileId', 'name', 'photo', 'photoSource', 'headline', 'bio', 'organisation', 'designation', 'education', 'skills', 'interests', 'location', 'linkedin', 'website', 'portfolio', 'links', 'visibility', 'updatedAt'] as const;
export const LIMITS = { name: 80, headline: 120, bio: 1200, short: 120, list: 15, item: 40, links: 8, photo: 200_000 };

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newProfileId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}

export function blankProfile(user: AppUser): Omit<PublicProfile, 'id'> {
  return {
    profileId: newProfileId(), name: user.name || user.email.split('@')[0], photo: user.photo ?? '', photoSource: user.photo ? 'google' : 'none',
    headline: '', bio: '', organisation: '', designation: '', education: '', skills: [], interests: [], location: '',
    linkedin: '', website: '', portfolio: '', links: [], visibility: 'public',
  };
}

/** Creates the profile on first sign-in, and keeps the Google photo fresh unless the person uploaded their own. */
export async function ensureProfile(user: AppUser) {
  const path = `profiles/${user.uid}`;
  const existing = await backend.getDoc<PublicProfile>(path);
  if (!existing) {
    await backend.write([{ type: 'set', path, data: { ...blankProfile(user), updatedAt: backend.now() } }]);
    return;
  }
  if (existing.photoSource !== 'upload' && user.photo && existing.photo !== user.photo) {
    await backend.write([{ type: 'set', path, merge: true, data: { photo: user.photo, photoSource: 'google' } }]);
  }
}

/** Completion counts the details that make a profile useful to other people. */
export function completion(p: Partial<PublicProfile>, phone: string): { percent: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!p.name?.trim(), 'Name'], [!!p.photo, 'Photo'], [!!p.headline?.trim(), 'Headline'], [!!p.organisation?.trim(), 'College or organisation'],
    [!!p.designation?.trim(), 'Designation'], [!!p.bio?.trim(), 'Bio'], [(p.skills?.length ?? 0) > 0, 'Skills'], [(p.interests?.length ?? 0) > 0, 'Interests'],
    [!!p.location?.trim(), 'Location'], [!!(p.linkedin?.trim() || p.website?.trim()), 'A link'], [!!phone.trim(), 'Phone'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, n]) => n) };
}

const list = (s: string) => [...new Set(s.split(',').map((x) => x.trim().slice(0, LIMITS.item)).filter(Boolean))].slice(0, LIMITS.list);
export const toList = list;

/** Cleans and validates an edit before saving. Returns an error message or the clean profile. */
export function cleanProfile(p: Omit<PublicProfile, 'id'>): { error: string } | { value: Omit<PublicProfile, 'id' | 'updatedAt'> } {
  if (!p.name.trim()) return { error: 'Add your name.' };
  for (const [label, v] of [['Website', p.website], ['Portfolio', p.portfolio]] as const) {
    if (v.trim() && !webUrl(v)) return { error: `${label} needs a valid web link.` };
  }
  const links = p.links.filter((l) => l.label.trim() || l.url.trim());
  const bad = links.find((l) => !l.label.trim() || !webUrl(l.url));
  if (bad) return { error: bad.label.trim() ? `“${bad.label}” needs a valid web link.` : 'Give each extra link a name.' };
  if (p.photo.length > LIMITS.photo) return { error: 'That photo is too large. Try a smaller image.' };
  return { value: {
    profileId: p.profileId, name: p.name.trim().slice(0, LIMITS.name), photo: p.photo, photoSource: p.photoSource,
    headline: p.headline.trim().slice(0, LIMITS.headline), bio: p.bio.trim().slice(0, LIMITS.bio),
    organisation: p.organisation.trim().slice(0, LIMITS.short), designation: p.designation.trim().slice(0, LIMITS.short),
    education: p.education.trim().slice(0, LIMITS.short), location: p.location.trim().slice(0, LIMITS.short),
    skills: p.skills.slice(0, LIMITS.list), interests: p.interests.slice(0, LIMITS.list),
    linkedin: p.linkedin.trim().slice(0, 200), website: webUrl(p.website), portfolio: webUrl(p.portfolio),
    links: links.slice(0, LIMITS.links).map((l) => ({ label: l.label.trim().slice(0, 40), url: webUrl(l.url) })),
    visibility: p.visibility === 'private' ? 'private' : 'public',
  } };
}

export async function saveProfile(uid: string, p: Omit<PublicProfile, 'id' | 'updatedAt'>, phone: string) {
  await backend.write([
    { type: 'set', path: `profiles/${uid}`, data: { ...p, updatedAt: backend.now() } },
    // Phone stays private, next to the details used to fill in event registration.
    { type: 'set', path: `users/${uid}/profile/me`, merge: true, data: { name: p.name, phone: phone.trim(), institution: p.organisation, designation: p.designation } },
  ]);
}

export const findProfile = async (profileId: string) =>
  (await backend.getCol<PublicProfile>('profiles', [['profileId', profileId], ['visibility', 'public']]))[0] ?? null;

/** WebP where the browser can make it (about a third smaller), otherwise JPEG. */
export function encodeSmall(canvas: HTMLCanvasElement) {
  const webp = canvas.toDataURL('image/webp', 0.78);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.8);
}

/** Shrinks an uploaded photo to a small square JPEG so it fits in the profile record. */
export function shrinkPhoto(file: File, size = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error('Please choose an image file.')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('That image is over 15 MB. Try a smaller one.')); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const side = Math.min(img.width, img.height);
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(encodeSmall(canvas));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file couldn’t be read as an image.')); };
    img.src = url;
  });
}
