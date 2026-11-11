import { describe, expect, it } from 'vitest';
import { parseSchedule, parseTime, splitSpeaker, toLines, type TextItem } from './scheduleParse';

const at = (h: number, m: number) => h * 60 + m;

describe('parseTime', () => {
  it('reads common formats', () => {
    expect(parseTime('09:30 AM - 10:00 AM')).toMatchObject({ start: at(9, 30), end: at(10, 0) });
    expect(parseTime('1.30 PM - 4.00 PM')).toMatchObject({ start: at(13, 30), end: at(16, 0) });
    expect(parseTime('12:15 PM - 1:30 PM')).toMatchObject({ start: at(12, 15), end: at(13, 30) });
    expect(parseTime('10:00-11:30')).toMatchObject({ start: at(10, 0), end: at(11, 30) });
    expect(parseTime('9:30 - 1:30 PM')).toMatchObject({ start: at(9, 30), end: at(13, 30) });
    expect(parseTime('4:00 PM Outing')).toMatchObject({ start: at(16, 0), end: null, rest: 'Outing' });
  });
  it('fixes an obvious AM/PM typo', () => {
    expect(parseTime('11:30 AM - 11:45 PM')).toMatchObject({ start: at(11, 30), end: at(11, 45) });
  });
  it('ignores plain numbers and date ranges', () => {
    expect(parseTime('16 - 18 November')).toBeNull();
    expect(parseTime('Registration')).toBeNull();
  });
});

describe('splitSpeaker', () => {
  it('separates the organisation', () => {
    expect(splitSpeaker('Prof. Sarju S, St. Joseph’s College of Engineering & Technology, Palai')).toEqual({ name: 'Prof. Sarju S', organisation: 'St. Joseph’s College of Engineering & Technology, Palai' });
    expect(splitSpeaker('Dr. Jippu Jacob')).toEqual({ name: 'Dr. Jippu Jacob', organisation: '' });
  });
});

// A layout like the FDP programme: Time at x=60, Program at x=225, Resource Persons at x=640.
function sheet(rows: [number, string, string, string][]): TextItem[] {
  const items: TextItem[] = [];
  rows.forEach(([y, time, title, who]) => {
    if (time) items.push({ str: time, x: 60, y, page: 1 });
    if (title) items.push({ str: title, x: 225, y, page: 1 });
    if (who) items.push({ str: who, x: 640, y, page: 1 });
  });
  return items;
}

describe('parseSchedule', () => {
  const items = sheet([
    [10, '', 'Day - 1', ''],
    [20, 'Time', 'Program', 'Resource Persons'],
    [30, '09:00 AM - 09:30 AM', 'Registration', ''],
    [40, '10:00 AM - 11:30 AM', 'Devolopement of an effective Institutional Innovation', 'Prof. Dr. Sherin Sam Jose'],
    [45, '', 'Ecosystem: A case study Including TBI visit', ''],
    [50, '11:30 AM - 11:45 PM', 'Tea Break', ''],
    [60, '4:00 PM', 'Outing to Panchalimedu & Kuttikanam', ''],
    [70, '7:00 PM - 9:00 PM', 'IEDC Vision Drafting (2026 - 28)', 'Prof. Dr. Sherin Sam Jose'],
    [80, '11:45 PM', 'Day 1 ends', ''],
    [90, '', 'Day - 2', ''],
    [97, '', '', 'Dr. Jippu Jacob'],
    [100, '09:30 AM - 01:30 PM', 'IPR and Patent Drafting', ''],
    [105, '', '', 'Mrs. Bhagiya Lakshmi'],
    [110, '', 'Patent Funding - Kapila', 'Dr. Godwin Raj & Prof. Dr. Abi Varghese'],
    [120, '05:00 PM - 06:30 PM', 'IEDC Student-centric activities', 'Prof. Nitheesh Kurian, Ragajiri School of'],
    [125, '', '', 'Engineering - Kochi'],
    [130, '06:30 PM - 07:30 PM', 'Idea Lab development', 'Prof. Sarju S, St. Joseph’s College of'],
    [135, '', '', 'Engineering & Technology, Palai'],
    [140, '', 'Day - 3', ''],
    [146, '', '', 'Mr. Alan Thomas Shaji'],
    [151, '', 'How to transform IEDC', ''],
    [156, '09:30 AM - 11:00 AM', '', ''],
    [161, '', '& External Fundraising', ''],
    [166, '', '', 'Mr. Abidh Habeeb'],
    [171, '', '', 'Mr. Bava Kurian Vargese & Ms. Emilin Thomas'],
    [180, '09:30 AM - 10:00 AM', 'Inaugration', ''],
    [190, '10:00 AM - 11:30 AM', 'A case study including TBI visit', 'Prof. Dr. Sherin Sam Jose'],
    [200, '03:30 PM - 04:15 PM', 'Valedictory', ''],
  ]);
  const rows = parseSchedule(toLines(items));

  it('finds every session on the right day', () => {
    expect(rows.map((r) => [r.day, r.start, r.title])).toEqual([
      [1, '09:00', 'Registration'],
      [1, '10:00', 'Devolopement of an effective Institutional Innovation Ecosystem: A case study Including TBI visit'],
      [1, '11:30', 'Tea Break'],
      [1, '16:00', 'Outing to Panchalimedu & Kuttikanam'],
      [1, '19:00', 'IEDC Vision Drafting (2026 - 28)'],
      [2, '09:30', 'IPR and Patent Drafting'],
      [2, '09:30', 'Patent Funding - Kapila'],
      [2, '17:00', 'IEDC Student-centric activities'],
      [2, '18:30', 'Idea Lab development'],
      [3, '09:30', 'How to transform IEDC & External Fundraising'],
      [3, '09:30', 'Inaugration'],
      [3, '10:00', 'A case study including TBI visit'],
      [3, '15:30', 'Valedictory'],
    ]);
  });
  it('joins multi-line speakers and splits "&"', () => {
    expect(rows[5].speakers).toEqual(['Dr. Jippu Jacob', 'Mrs. Bhagiya Lakshmi']);
    expect(rows[6].speakers).toEqual(['Dr. Godwin Raj', 'Prof. Dr. Abi Varghese']);
    expect(rows[7].speakers).toEqual(['Prof. Nitheesh Kurian, Ragajiri School of Engineering - Kochi']);
    expect(rows[8].speakers).toEqual(['Prof. Sarju S, St. Joseph’s College of Engineering & Technology, Palai']);
    expect(rows[9].speakers).toHaveLength(4);
  });
  it('fills end times and guesses types and feedback', () => {
    expect(rows[2].end).toBe('11:45');
    expect(rows[3].end).toBe('19:00');
    expect(rows.find((r) => r.title === 'Tea Break')).toMatchObject({ kind: 'break', feedbackOn: false });
    expect(rows.find((r) => r.title === 'Registration')).toMatchObject({ kind: 'activity', feedbackOn: false });
    expect(rows.find((r) => r.title === 'Valedictory')?.feedbackOn).toBe(false);
    expect(rows[9].kind).toBe('panel');
    expect(rows[5].kind).toBe('workshop');
    expect(rows.find((r) => r.title === 'Inaugration')?.feedbackOn).toBe(false);
    expect(rows.find((r) => r.title.startsWith('A case study'))?.kind).toBe('talk');
  });
  it('works without a header row, reading time then title', () => {
    const plain = toLines([
      { str: '9:00 AM - 10:00 AM Opening keynote', x: 10, y: 10, page: 1 },
      { str: '10:00 AM - 10:15 AM Coffee break', x: 10, y: 20, page: 1 },
    ]);
    expect(parseSchedule(plain).map((r) => [r.start, r.end, r.title, r.kind])).toEqual([
      ['09:00', '10:00', 'Opening keynote', 'talk'],
      ['10:00', '10:15', 'Coffee break', 'break'],
    ]);
  });
});
