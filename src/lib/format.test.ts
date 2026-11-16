import { describe, expect, it } from 'vitest';
import { hue, initials } from './format';

describe('avatar helpers', () => {
  it('make initials from a name, skipping titles', () => {
    expect(initials('Dr. Asha Menon')).toBe('AM');
    expect(initials('ben')).toBe('B');
  });
  it('never crash on a record with no name or id (the live-site crash)', () => {
    expect(initials(undefined)).toBe('?');
    expect(initials(null)).toBe('?');
    expect(initials('   ')).toBe('?');
    expect(['blue', 'amber', 'violet', 'lime', 'rose']).toContain(hue(undefined));
  });
});
