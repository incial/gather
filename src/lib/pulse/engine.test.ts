import { describe, expect, it } from 'vitest';
import { videoEmbedUrl } from '../eventMedia';
import { cleanAnswer, duplicateSlide, formatAnswer, leaderboard, newSlide, quizPoints, summarize, visibleSlides } from './engine';

describe('answers', () => {
  it('multiple choice accepts one option unless multi is on', () => {
    const s = newSlide('mc');
    const [a, b] = s.options.map((o) => o.id);
    expect(cleanAnswer(s, [a])).toEqual({ value: [a] });
    expect(cleanAnswer(s, [a, b])).toEqual({ error: 'Choose one option.' });
    expect(cleanAnswer({ ...s, multi: true }, [a, b, a])).toEqual({ value: [a, b] });
    expect(cleanAnswer(s, ['not-an-option'])).toEqual({ error: 'Choose an option.' });
  });
  it('rating stays inside the scale', () => {
    const s = newSlide('rating');
    expect(cleanAnswer(s, 3)).toEqual({ value: 3 });
    expect('error' in cleanAnswer(s, 9)).toBe(true);
    expect('error' in cleanAnswer(s, 2.5)).toBe(true);
  });
  it('ranking needs every item once', () => {
    const s = newSlide('ranking');
    const ids = s.options.map((o) => o.id);
    expect(cleanAnswer(s, [...ids].reverse())).toEqual({ value: [...ids].reverse() });
    expect('error' in cleanAnswer(s, [ids[0], ids[0], ids[1]])).toBe(true);
  });
  it('word cloud trims, caps and filters rude words', () => {
    const s = { ...newSlide('wordcloud'), maxEntries: 2 };
    expect(cleanAnswer(s, ['  great   day ', 'fun', 'extra'])).toEqual({ value: ['great day', 'fun'] });
    expect(cleanAnswer(s, ['shit'])).toEqual({ error: 'Please keep it friendly.' });
  });
  it('formats answers for CSV', () => {
    const s = newSlide('ranking');
    expect(formatAnswer(s, s.options.map((o) => o.id))).toBe('1. First item; 2. Second item; 3. Third item');
  });
});

describe('results', () => {
  it('counts votes and marks the right answer after reveal', () => {
    const s = newSlide('quiz');
    const [a, b] = s.options.map((o) => o.id);
    const r = summarize(s, [{ id: '1', value: [a], name: '' }, { id: '2', value: [b], name: '' }, { id: '3', value: [a], name: '', hidden: true }], [a]);
    expect(r.kind === 'bars' && r.bars.slice(0, 2).map((x) => [x.count, x.correct])).toEqual([[1, true], [1, false]]);
  });
  it('word cloud merges case and sorts by count', () => {
    const r = summarize(newSlide('wordcloud'), [{ id: '1', value: ['Happy'], name: '' }, { id: '2', value: ['happy', 'calm'], name: '' }]);
    expect(r.kind === 'words' && r.words).toEqual([{ text: 'Happy', count: 2 }, { text: 'calm', count: 1 }]);
  });
  it('rating gives the average and distribution', () => {
    const r = summarize(newSlide('rating'), [{ id: '1', value: 5, name: '' }, { id: '2', value: 4, name: '' }]);
    expect(r.kind === 'scale' && [r.average, r.counts]).toEqual([4.5, [0, 0, 0, 1, 1]]);
  });
  it('ranking uses points for each place', () => {
    const s = newSlide('ranking');
    const [a, b, c] = s.options.map((o) => o.id);
    const r = summarize(s, [{ id: '1', value: [b, a, c], name: '' }, { id: '2', value: [b, c, a], name: '' }]);
    expect(r.kind === 'ranking' && r.items[0].id).toBe(b);
  });
});

describe('quiz', () => {
  it('fast right answers score more; wrong answers score zero', () => {
    expect(quizPoints(['a'], ['a'], 0, 20)).toBe(1000);
    expect(quizPoints(['a'], ['a'], 20000, 20)).toBe(500);
    expect(quizPoints(['b'], ['a'], 0, 20)).toBe(0);
    expect(quizPoints(['a'], ['a'], 99999, 0)).toBe(1000);
  });
  it('leaderboard adds up across questions and hides names when anonymous', () => {
    const t = '2026-11-16T10:00:00.000Z';
    const rows = [
      { uid: 'x', name: 'Xi', slideId: 'q1', value: ['a'], at: t },
      { uid: 'y', name: 'Yo', slideId: 'q1', value: ['b'], at: t },
      { uid: 'y', name: 'Yo', slideId: 'q2', value: ['c'], at: t },
    ];
    const board = leaderboard(rows, { q1: ['a'], q2: ['c'] }, { q1: t, q2: t }, { q1: 20, q2: 20 }, false);
    expect(board.map((b) => [b.name, b.score])).toEqual([['Xi', 1000], ['Yo', 1000]]);
    expect(leaderboard(rows, { q1: ['a'] }, {}, {}, true)[0].name).toMatch(/^Player/);
  });
});

describe('surveys and slides', () => {
  it('conditional questions show only after the matching answer', () => {
    const a = newSlide('yesno');
    const b = { ...newSlide('open'), condition: { slideId: a.id, optionId: a.options[0].id } };
    expect(visibleSlides([a, b], {}).length).toBe(1);
    expect(visibleSlides([a, b], { [a.id]: [a.options[0].id] }).length).toBe(2);
  });
  it('duplicates get new IDs and keep the right answer', () => {
    const q = newSlide('quiz');
    const d = duplicateSlide(q);
    expect(d.id).not.toBe(q.id);
    expect(d.options[0].id).not.toBe(q.options[0].id);
    expect(d.correct).toEqual([d.options[0].id]);
  });
});

describe('event video links', () => {
  it('accepts YouTube and Vimeo, nothing else', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://youtube.com/shorts/abcdefghijk')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk');
    expect(videoEmbedUrl('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789');
    expect(videoEmbedUrl('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoEmbedUrl('')).toBeNull();
  });
});
