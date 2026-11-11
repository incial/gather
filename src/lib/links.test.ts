import { describe, expect, it } from 'vitest';
import { linkedinUrl, speakerLinks, webUrl } from './links';

describe('links', () => {
  it('turns a LinkedIn ID into a profile link and keeps full links', () => {
    expect(linkedinUrl('jane-doe')).toBe('https://www.linkedin.com/in/jane-doe');
    expect(linkedinUrl('@jane')).toBe('https://www.linkedin.com/in/jane');
    expect(linkedinUrl('linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane');
    expect(linkedinUrl('https://www.linkedin.com/in/x')).toBe('https://www.linkedin.com/in/x');
    expect(linkedinUrl('')).toBe('');
  });
  it('adds https and refuses non-web links', () => {
    expect(webUrl('example.com')).toBe('https://example.com');
    expect(webUrl('javascript:alert(1)')).toBe('');
    expect(webUrl('mailto:a@b.c')).toBe('');
    expect(webUrl('not a link')).toBe('');
  });
  it('builds the tray in order and skips broken entries', () => {
    const tray = speakerLinks({ linkedin: 'jane', website: 'jane.dev', links: [{ label: 'Instagram', url: 'instagram.com/jane' }, { label: '', url: 'x.com' }, { label: 'Bad', url: 'javascript:1' }] } as never);
    expect(tray.map((l) => l.label)).toEqual(['LinkedIn', 'Website', 'Instagram']);
  });
});
