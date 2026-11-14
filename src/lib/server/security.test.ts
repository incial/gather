import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashId, redact, securityLog } from './log';
import { burst, clientIp, decide, resetBursts } from './rateLimit';

describe('decide (durable per-account limit)', () => {
  const limits = [{ max: 3, windowMs: 1000 }, { max: 5, windowMs: 10_000 }];
  it('allows up to the limit, then refuses with a retry time', () => {
    let hits: number[] = [];
    for (let i = 0; i < 3; i++) { const r = decide(hits, 100 + i, limits); expect(r.ok).toBe(true); hits = r.next; }
    const r = decide(hits, 200, limits);
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBe(100 + 1000 - 200);
  });
  it('the longer window also applies', () => {
    let hits: number[] = [];
    for (const t of [0, 2000, 4000, 6000, 8000]) hits = decide(hits, t, limits).next;
    expect(decide(hits, 9000, limits).ok).toBe(false);
    expect(decide(hits, 10_001, limits).ok).toBe(true);
  });
  it('ignores junk and future values and keeps the stored list short', () => {
    const r = decide([Number.NaN, 5e15, -1] as number[], 1000, limits);
    expect(r.ok).toBe(true);
    let hits: number[] = [];
    for (let t = 0; t < 100; t += 3000) hits = decide(hits, t, limits).next;
    expect(hits.length).toBeLessThanOrEqual(5);
  });
});

describe('burst (in-memory per-IP limit)', () => {
  afterEach(() => resetBursts());
  it('limits per key, independently', () => {
    const l = { max: 2, windowMs: 1000 };
    expect(burst('a', l, 0).ok).toBe(true);
    expect(burst('a', l, 1).ok).toBe(true);
    expect(burst('a', l, 2).ok).toBe(false);
    expect(burst('b', l, 2).ok).toBe(true);
    expect(burst('a', l, 1001).ok).toBe(true);
  });
  it('reads the caller IP from the platform header', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('security logging', () => {
  it('redacts phone numbers, emails and tokens', () => {
    const s = redact('Recipient +91 98765 43210 (asha@x.test) token eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9abcdef');
    expect(s).not.toMatch(/98765|asha@x\.test|eyJhbGci/);
    expect(s).toContain('[number]');
    expect(s).toContain('[email]');
    expect(s).toContain('[token]');
  });
  it('logs IDs and IPs only as short hashes', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    securityLog('auth.invalid', { route: '/api/x', uid: 'user-123', ip: '1.2.3.4', reason: 'call 9876543210' });
    const line = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(line).not.toContain('user-123');
    expect(line).not.toContain('1.2.3.4');
    expect(line).not.toContain('9876543210');
    expect(JSON.parse(line)).toMatchObject({ kind: 'security', event: 'auth.invalid', uid: hashId('user-123'), ip: hashId('1.2.3.4') });
  });
});
