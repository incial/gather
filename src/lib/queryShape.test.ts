import { describe, expect, it } from 'vitest';
import { shapeRows } from './queryShape';

describe('shapeRows `from` (demo mode, like a Firestore >= range)', () => {
  const rows = [
    { id: 'a', endsAt: '2020-01-01T00:00:00.000Z' },
    { id: 'b', endsAt: '2099-06-01T00:00:00.000Z' },
    { id: 'c', endsAt: '2099-01-01T00:00:00.000Z' },
    { id: 'd' },
  ];
  it('keeps rows at or after the value, in order, leaving out rows without the field', () => {
    expect(shapeRows(rows, { orderBy: 'endsAt', from: '2026-11-14T00:00:00.000Z' }).map((r) => r.id)).toEqual(['c', 'b']);
  });
  it('applies the limit after the range', () => {
    expect(shapeRows(rows, { orderBy: 'endsAt', from: '2026-11-14T00:00:00.000Z', limit: 1 }).map((r) => r.id)).toEqual(['c']);
  });
});
