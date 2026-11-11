import { describe, expect, it } from 'vitest';
import { pingId, relation, type PingDoc } from './meetping';

const p = (from: string, to: string, status: PingDoc['status']): PingDoc => ({
  id: pingId('e1', from, to), eventId: 'e1', eventTitle: 'E', fromUid: from, fromName: from, fromPhoto: '', toUid: to, toName: to, toPhoto: '', message: 'hi', status,
});

describe('Meet Ping status between two people', () => {
  it('none, sent, incoming, connected and declined', () => {
    expect(relation('a', 'b', []).kind).toBe('none');
    expect(relation('a', 'b', [p('a', 'b', 'pending')]).kind).toBe('sent');
    expect(relation('a', 'b', [p('b', 'a', 'pending')]).kind).toBe('incoming');
    expect(relation('a', 'b', [p('b', 'a', 'accepted')]).kind).toBe('connected');
    expect(relation('a', 'b', [p('a', 'b', 'declined')]).kind).toBe('declined');
  });
  it('an accepted ping in either direction wins over others', () => {
    expect(relation('a', 'b', [p('a', 'b', 'declined'), p('b', 'a', 'accepted')]).kind).toBe('connected');
  });
  it('other people’s pings don’t count', () => {
    expect(relation('a', 'b', [p('a', 'c', 'pending'), p('c', 'b', 'accepted')]).kind).toBe('none');
  });
  it('one ID per pair per event and direction', () => {
    expect(pingId('e1', 'a', 'b')).toBe('e1_a_b');
  });
});
