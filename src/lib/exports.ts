import { strToU8, zipSync } from 'fflate';
import { downloadBlob, toCsv, type Row } from './csv';
import { fmtDateTime } from './format';
import type { AttendanceDoc, AttendeeDoc, ConnectionDoc, EventDoc, EventInfoDoc, FeedbackDoc, PreregDoc, SavedDoc, SessionDoc, SessionFeedbackDoc, SpeakerDoc } from './types';

export interface EventData {
  event: EventDoc;
  info: EventInfoDoc | null;
  sessions: SessionDoc[];
  speakers: SpeakerDoc[];
  attendees: AttendeeDoc[];
  prereg: PreregDoc[];
  attendance: AttendanceDoc[];
  feedback: FeedbackDoc[];
  connections: ConnectionDoc[];
  saved: SavedDoc[];
  sessionFeedback: SessionFeedbackDoc[];
}
export interface Sheet { name: string; rows: Row[]; columns: string[] }

const sortedSessions = (d: EventData) => [...d.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

export function attendeesSheet(d: EventData): Sheet {
  const counts = new Map<string, number>();
  d.attendance.forEach((a) => counts.set(a.uid, (counts.get(a.uid) ?? 0) + 1));
  const rows: Row[] = d.attendees.map((a) => ({
    Name: a.name, Email: a.email, Phone: a.phone, Institution: a.institution, Department: a.department,
    Designation: a.designation, Status: 'Joined', Source: a.source === 'list' ? 'Pre-registered' : 'Registered in app',
    'Joined at': fmtDateTime(a.joinedAt), 'Sessions attended': counts.get(a.uid) ?? 0,
  }));
  const joined = new Set(d.attendees.map((a) => a.email.toLowerCase()));
  for (const p of d.prereg) {
    if (joined.has(p.id)) continue;
    rows.push({ Name: p.name, Email: p.email, Phone: p.phone, Institution: p.institution, Department: p.department,
      Designation: p.designation, Status: 'Not joined yet', Source: 'Pre-registered', 'Joined at': '', 'Sessions attended': 0 });
  }
  return { name: 'attendees', rows, columns: ['Name', 'Email', 'Phone', 'Institution', 'Department', 'Designation', 'Status', 'Source', 'Joined at', 'Sessions attended'] };
}

/** One row per check-in. */
export function attendanceLogSheet(d: EventData): Sheet {
  const titles = new Map(d.sessions.map((s) => [s.id, s.title]));
  const how = { qr: 'Session code (scanned or typed)', staff: 'Pass scanned by staff', manual: 'Marked by organiser', self: 'Self-marked (allowed by organiser)' };
  const rows = [...d.attendance].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')).map((a) => ({
    Session: titles.get(a.sessionId) ?? a.sessionId, Name: a.name, Email: a.email, 'Checked in at': fmtDateTime(a.at), Method: how[a.method],
  }));
  return { name: 'attendance-log', rows, columns: ['Session', 'Name', 'Email', 'Checked in at', 'Method'] };
}

/** One row per person, one column per session: the sheet most programmes file as the attendance register. */
export function attendanceRegisterSheet(d: EventData): Sheet {
  const sessions = sortedSessions(d);
  const present = new Set(d.attendance.map((a) => `${a.sessionId}_${a.uid}`));
  const labels = sessions.map((s, i) => `${i + 1}. ${s.title}`);
  const rows: Row[] = d.attendees.map((a) => {
    const row: Row = { Name: a.name, Email: a.email, Institution: a.institution };
    let n = 0;
    sessions.forEach((s, i) => {
      const p = present.has(`${s.id}_${a.uid}`);
      if (p) n++;
      row[labels[i]] = p ? 'P' : 'A';
    });
    row.Attended = n;
    row['Attendance %'] = sessions.length ? Math.round((n / sessions.length) * 100) : 0;
    return row;
  });
  return { name: 'attendance-register', rows, columns: ['Name', 'Email', 'Institution', ...labels, 'Attended', 'Attendance %'] };
}

export function feedbackSheet(d: EventData): Sheet {
  const qs = d.event.questions;
  const speakerCols = d.speakers.map((s) => `Speaker: ${s.name}`);
  const rows = d.feedback.map((f) => {
    const row: Row = { Name: f.name, Email: f.email, 'Submitted at': fmtDateTime(f.at) };
    qs.forEach((q) => { row[q.label] = f.answers[q.id] ?? ''; });
    d.speakers.forEach((s, i) => { row[speakerCols[i]] = f.speakerRatings?.[s.id] ?? ''; });
    return row;
  });
  return { name: 'feedback', rows, columns: ['Name', 'Email', 'Submitted at', ...qs.map((q) => q.label), ...speakerCols] };
}

export function speakersSheet(d: EventData): Sheet {
  const counts = new Map<string, number>();
  d.connections.forEach((c) => counts.set(c.speakerId, (counts.get(c.speakerId) ?? 0) + 1));
  const rows = d.speakers.map((s) => ({
    Name: s.name, Role: s.role, Organisation: s.organisation, Topic: s.topic, Expertise: s.expertise ?? '', Bio: s.bio, Email: s.email,
    Phone: s.phone, LinkedIn: s.linkedin, Website: s.website, 'Other links': (s.links ?? []).map((l) => `${l.label}: ${l.url}`).join(' | '), Connections: counts.get(s.id) ?? 0,
  }));
  return { name: 'speakers', rows, columns: ['Name', 'Role', 'Organisation', 'Topic', 'Expertise', 'Bio', 'Email', 'Phone', 'LinkedIn', 'Website', 'Other links', 'Connections'] };
}

export function sessionsSheet(d: EventData): Sheet {
  const names = new Map(d.speakers.map((s) => [s.id, s.name]));
  const counts = new Map<string, number>();
  d.attendance.forEach((a) => counts.set(a.sessionId, (counts.get(a.sessionId) ?? 0) + 1));
  const rows = sortedSessions(d).map((s) => ({
    Title: s.title, Type: s.kind ?? 'talk', 'Feedback on': s.feedbackOn === false ? 'No' : 'Yes', Starts: fmtDateTime(s.startsAt), Ends: fmtDateTime(s.endsAt), Room: s.room,
    Speakers: s.speakerIds.map((id) => names.get(id) ?? '').filter(Boolean).join('; '),
    Description: s.description, 'Checked in': counts.get(s.id) ?? 0,
  }));
  return { name: 'schedule', rows, columns: ['Title', 'Type', 'Feedback on', 'Starts', 'Ends', 'Room', 'Speakers', 'Description', 'Checked in'] };
}

export function connectionsSheet(d: EventData): Sheet {
  const rows = [...d.connections].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')).map((c) => ({
    Attendee: c.name, Email: c.email, Speaker: c.speakerName, 'Connected at': fmtDateTime(c.at), Via: c.method === 'scan' ? 'QR scan' : 'In app',
  }));
  return { name: 'speaker-connections', rows, columns: ['Attendee', 'Email', 'Speaker', 'Connected at', 'Via'] };
}

export function sessionFeedbackSheet(d: EventData): Sheet {
  const titles = new Map(d.sessions.map((s) => [s.id, s.title]));
  const rows = [...d.sessionFeedback].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')).map((f) => ({
    Session: titles.get(f.sessionId) ?? f.sessionId, Name: f.name, Email: f.email, Rating: f.rating, Comment: f.comment, 'Submitted at': fmtDateTime(f.at),
  }));
  return { name: 'session-feedback', rows, columns: ['Session', 'Name', 'Email', 'Rating', 'Comment', 'Submitted at'] };
}

export function savedSheet(d: EventData): Sheet {
  const joined = new Set(d.attendees.map((a) => a.uid));
  const rows = [...d.saved].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')).map((s) => ({
    Name: s.name, Email: s.email, 'Saved at': fmtDateTime(s.at), Joined: joined.has(s.uid) ? 'Yes' : 'No',
  }));
  return { name: 'saved-by', rows, columns: ['Name', 'Email', 'Saved at', 'Joined'] };
}

export function eventSheet(d: EventData): Sheet {
  const e = d.event;
  const rows = [{ Title: e.title, Tagline: e.tagline, Organiser: e.organiser, Venue: e.venue, Starts: fmtDateTime(e.startsAt), Ends: fmtDateTime(e.endsAt),
    'Join code': e.joinCode, Registration: e.registration === 'open' ? 'Open' : 'Invite list only', Published: e.published ? 'Yes' : 'No', 'Wi-Fi name': d.info?.wifiName ?? '', 'Wi-Fi password': d.info?.wifiPassword ?? '', Description: e.description }];
  return { name: 'event-details', rows, columns: Object.keys(rows[0]) };
}

export const allSheets = (d: EventData) => [
  eventSheet(d), attendeesSheet(d), attendanceRegisterSheet(d), attendanceLogSheet(d),
  feedbackSheet(d), sessionFeedbackSheet(d), speakersSheet(d), sessionsSheet(d), connectionsSheet(d), savedSheet(d),
];

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';

export function downloadZip(d: EventData) {
  const files = Object.fromEntries(allSheets(d).map((s) => [`${s.name}.csv`, strToU8(toCsv(s.rows, s.columns))]));
  const zipped = zipSync(files);
  downloadBlob(`${slug(d.event.title)}-all-data.zip`, new Blob([zipped.slice()], { type: 'application/zip' }));
}
