import { describe, expect, it } from 'vitest';
import { blankProfile, cleanProfile, completion, newProfileId, toList } from './profile';

const user = { uid: 'u1', email: 'asha@x.test', name: 'Asha Nair', emailVerified: true, photo: 'https://lh3.googleusercontent.com/a' };

describe('profiles', () => {
  it('starts from the Google name and photo, visible, with a fresh ID', () => {
    const p = blankProfile(user);
    expect(p).toMatchObject({ name: 'Asha Nair', photo: user.photo, photoSource: 'google', visibility: 'public' });
    expect(p.profileId).toMatch(/^[a-z2-9]{8}$/);
    expect(new Set(Array.from({ length: 200 }, newProfileId)).size).toBe(200);
  });
  it('measures completion and names what is missing', () => {
    const p = { ...blankProfile(user), headline: 'Teacher', organisation: 'X' };
    const c = completion(p, '');
    expect(c.percent).toBeGreaterThan(0);
    expect(c.missing).toContain('Phone');
    expect(c.missing).not.toContain('Name');
  });
  it('cleans lists, links and rejects bad input', () => {
    expect(toList(' IPR, ipr ,IPR, Design , ')).toEqual(['IPR', 'ipr', 'Design']);
    const base = { ...blankProfile(user), website: 'asha.dev', links: [{ label: 'Insta', url: 'instagram.com/a' }, { label: '', url: '' }] };
    const ok = cleanProfile(base);
    expect('value' in ok && ok.value.website).toBe('https://asha.dev');
    expect('value' in ok && ok.value.links).toEqual([{ label: 'Insta', url: 'https://instagram.com/a' }]);
    expect(cleanProfile({ ...base, name: ' ' })).toEqual({ error: 'Add your name.' });
    expect('error' in cleanProfile({ ...base, website: 'javascript:alert(1)' })).toBe(true);
    expect('error' in cleanProfile({ ...base, links: [{ label: 'X', url: 'not a link' }] })).toBe(true);
  });
});

import { shapeRows } from './queryShape';
describe('paging', () => {
  it('pages by name without skipping people who share a name', () => {
    const all = ['Asha', 'Asha', 'Asha', 'Ben', 'Cara'].map((name, i) => ({ id: `p${i}`, name }));
    const seen: string[] = [];
    let after: [string, string] | undefined;
    for (;;) {
      const page = shapeRows(all, { orderBy: 'name', limit: 2, after });
      seen.push(...page.map((p) => p.id));
      if (page.length < 2) break;
      after = [page[1].name, page[1].id];
    }
    expect(seen).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });
});
