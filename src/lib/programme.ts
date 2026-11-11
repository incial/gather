import type { SessionDoc, SessionKind, SpeakerDoc } from './types';

/** The I&E Ecosystem Development FDP, from the printed programme schedule. All times are IST. */
const at = (day: 16 | 17 | 18, time: string) => new Date(`2026-11-${day}T${time}:00+05:30`).toISOString();

const person = (id: string, name: string, topic: string, organisation = ''): SpeakerDoc => ({
  id, name, role: 'Resource person', organisation, topic, expertise: '', bio: '', email: '', phone: '', linkedin: '', website: '', links: [],
});

export const FDP_SPEAKERS: SpeakerDoc[] = [
  person('sherin-sam-jose', 'Prof. Dr. Sherin Sam Jose', 'Institutional innovation ecosystems'),
  person('abi-varghese', 'Prof. Dr. Abi Varghese', 'Ideation and project development'),
  person('jippu-jacob', 'Dr. Jippu Jacob', 'IPR and patent drafting'),
  person('bhagiya-lakshmi', 'Mrs. Bhagiya Lakshmi', 'IPR and patent drafting'),
  person('godwin-raj', 'Dr. Godwin Raj', 'Patent funding'),
  person('nitheesh-kurian', 'Prof. Nitheesh Kurian', 'IEDC student-centric activities', 'Rajagiri School of Engineering, Kochi'),
  person('sarju-s', 'Prof. Sarju S', 'Idea Lab development', 'St. Joseph’s College of Engineering & Technology, Palai'),
  person('alen-anil', 'Mr. Alen Anil', 'IIC report drafting and NISP'),
  person('akhil-pr', 'Mr. Akhil PR', 'IIC report drafting and NISP'),
  person('alan-thomas-shaji', 'Mr. Alan Thomas Shaji', 'Student-centric IEDCs'),
  person('abidh-habeeb', 'Mr. Abidh Habeeb', 'Student-centric IEDCs'),
  person('bava-kurian-vargese', 'Mr. Bava Kurian Vargese', 'Student-centric IEDCs'),
  person('emilin-thomas', 'Ms. Emilin Thomas', 'Student-centric IEDCs'),
];

const AJCE = 'Amal Jyothi College of Engineering';
type Row = [id: string, day: 16 | 17 | 18, from: string, to: string, title: string, kind: SessionKind, feedbackOn: boolean, speakers: string[], room?: string];

const ROWS: Row[] = [
  ['d1-registration', 16, '09:00', '09:30', 'Registration', 'activity', false, []],
  ['d1-inauguration', 16, '09:30', '10:00', 'Inauguration', 'talk', false, []],
  ['d1-ecosystem', 16, '10:00', '11:30', 'Development of an effective Institutional Innovation Ecosystem: A case study including TBI visit', 'talk', true, ['sherin-sam-jose']],
  ['d1-tea', 16, '11:30', '11:45', 'Tea Break', 'break', false, []],
  ['d1-tbi', 16, '11:45', '12:15', 'TBI Visit', 'activity', true, []],
  ['d1-ideation', 16, '12:15', '13:30', 'Ideation & Project Development: A journey of Nodal Officer', 'talk', true, ['abi-varghese']],
  ['d1-lunch', 16, '13:30', '16:00', 'Lunch and free time', 'break', false, []],
  ['d1-outing', 16, '16:00', '19:00', 'Outing to Panchalimedu & Kuttikkanam', 'activity', true, [], 'Panchalimedu & Kuttikkanam'],
  ['d1-vision', 16, '19:00', '21:00', 'IEDC Vision Drafting (2026 - 28)', 'workshop', true, ['sherin-sam-jose'], 'Marian College, Kuttikkanam'],
  ['d1-dinner', 16, '22:00', '23:00', 'Dinner and Night vibe at Kuttikkanam', 'break', false, [], 'Kuttikkanam'],
  ['d2-ipr', 17, '09:30', '13:30', 'IPR and Patent Drafting', 'workshop', true, ['jippu-jacob', 'bhagiya-lakshmi']],
  ['d2-kapila', 17, '09:30', '13:30', 'Patent Funding - Kapila', 'talk', true, ['godwin-raj', 'abi-varghese']],
  ['d2-student', 17, '17:00', '18:30', 'IEDC Student-centric activities and fundraising and network', 'talk', true, ['nitheesh-kurian']],
  ['d2-idealab', 17, '18:30', '19:30', 'Idea Lab development', 'talk', true, ['sarju-s']],
  ['d2-dinner', 17, '19:30', '20:30', 'Dinner', 'break', false, []],
  ['d2-iic', 17, '20:30', '23:00', 'Introducing IIC with Report Drafting and NISP', 'workshop', true, ['alen-anil', 'akhil-pr']],
  ['d3-transform', 18, '09:30', '11:00', 'How to transform IEDC to a student-centric activity centre & External Fundraising and Social Networking', 'panel', true, ['alan-thomas-shaji', 'abidh-habeeb', 'bava-kurian-vargese', 'emilin-thomas']],
  ['d3-execom', 18, '11:30', '12:15', 'Interaction with the present IEDC Student Execom - Amal Jyothi', 'activity', true, []],
  ['d3-proposal', 18, '13:00', '15:30', 'Basics of Proposal Drafting', 'workshop', true, ['sherin-sam-jose']],
  ['d3-valedictory', 18, '15:30', '16:15', 'Valedictory', 'talk', false, []],
];

export const FDP_SESSIONS: SessionDoc[] = ROWS.map(([id, day, from, to, title, kind, feedbackOn, speakerIds, room]) => ({
  id, title, description: '', room: room ?? AJCE, startsAt: at(day, from), endsAt: at(day, to), speakerIds, kind, feedbackOn,
}));

export const FDP_EVENT = {
  title: 'I&E Ecosystem Development',
  tagline: 'Faculty Development Programme',
  organiser: 'Maker Hub IEDC, Amal Jyothi College of Engineering',
  venue: 'Amal Jyothi College of Engineering, Kanjirappally',
  description: 'A three-day Faculty Development Programme on building innovation and entrepreneurship ecosystems. In association with Marian College Kuttikkanam, St. Joseph’s College of Engineering and Technology Palai, and Kerala Startup Mission. Sponsored by the Department of Mechanical Engineering Automobile and the Department of Food Technology.',
  startsAt: at(16, '09:00'),
  endsAt: at(18, '16:15'),
  color: 'rose' as const,
};
