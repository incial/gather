import { backend, type WriteOp } from './backend';
import { fmtRange } from './format';
import type { AttendanceDoc, AttendeeDoc, CertConfig, CertificateDoc, EventDoc, FeedbackDoc, SessionDoc, SessionFeedbackDoc } from './types';

export const DEFAULT_CERT: CertConfig = { on: false, title: 'Certificate of Participation', minAttendance: 75, requireFeedback: false, signers: [{ name: '', title: '' }, { name: '', title: '' }] };

/** Long random ID: the verification link is public, so it must not be guessable. */
export function newCertId() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(b, (x) => a[x % a.length]).join('');
  return `GTH-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export interface Eligibility { attendee: AttendeeDoc; attended: number; total: number; percent: number; gaveFeedback: boolean; eligible: boolean }

/** Works out who qualifies from check-ins and feedback. Breaks don't count towards attendance. */
export function eligibility(cfg: CertConfig, sessions: SessionDoc[], attendees: AttendeeDoc[], attendance: AttendanceDoc[], feedback: FeedbackDoc[], sessionFeedback: SessionFeedbackDoc[]): Eligibility[] {
  const counted = new Set(sessions.filter((s) => (s.kind ?? 'talk') !== 'break').map((s) => s.id));
  const total = counted.size;
  const by = new Map<string, Set<string>>();
  for (const a of attendance) if (counted.has(a.sessionId)) (by.get(a.uid) ?? by.set(a.uid, new Set()).get(a.uid)!).add(a.sessionId);
  const fb = new Set([...feedback.map((f) => f.uid), ...sessionFeedback.map((f) => f.uid)]);
  return attendees.map((attendee) => {
    const attended = by.get(attendee.uid)?.size ?? 0;
    const percent = total ? Math.round((attended / total) * 100) : 0;
    const gaveFeedback = fb.has(attendee.uid);
    return { attendee, attended, total, percent, gaveFeedback, eligible: percent >= cfg.minAttendance && (!cfg.requireFeedback || gaveFeedback) };
  });
}

/** Issues certificates to eligible people who don't have one yet. Re-running never duplicates. */
export async function issueCertificates(event: EventDoc, cfg: CertConfig, people: Eligibility[], existing: Record<string, string>) {
  const ops: WriteOp[] = [];
  let n = 0;
  for (const p of people) {
    if (!p.eligible || existing[p.attendee.uid]) continue;
    const id = newCertId();
    const cert: Omit<CertificateDoc, 'id'> = {
      eventId: event.id, uid: p.attendee.uid, name: p.attendee.name, eventTitle: event.title, title: cfg.title,
      organiser: event.organiser, dates: fmtRange(event.startsAt, event.endsAt), venue: event.venue,
      signers: cfg.signers.filter((s) => s.name.trim()), issuedAt: backend.now() as string,
    };
    ops.push({ type: 'set', path: `certificates/${id}`, data: cert as unknown as Record<string, unknown> });
    // Per-event index so the attendee and organiser find it without searching all certificates.
    ops.push({ type: 'set', path: `events/${event.id}/certIndex/${p.attendee.uid}`, data: { uid: p.attendee.uid, certId: id } });
    n++;
  }
  if (ops.length) await backend.write(ops);
  return n;
}

export async function revokeCertificate(eventId: string, uid: string, certId: string) {
  await backend.write([{ type: 'delete', path: `certificates/${certId}` }, { type: 'delete', path: `events/${eventId}/certIndex/${uid}` }]);
}

/** Draws the certificate at A4 landscape on a canvas. Made on the device; nothing is stored. */
export async function drawCertificate(c: CertificateDoc, verifyUrl: string): Promise<HTMLCanvasElement> {
  const W = 1754, H = 1240;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  await document.fonts?.ready;
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#2BD4FF'); grad.addColorStop(0.55, '#0047FF'); grad.addColorStop(1, '#0B0B0F');
  g.fillStyle = grad; g.fillRect(0, 0, W, 22); g.fillRect(0, H - 22, W, 22); g.fillRect(0, 0, 22, H); g.fillRect(W - 22, 0, 22, H);
  g.strokeStyle = 'rgba(11,11,15,.12)'; g.lineWidth = 2; g.strokeRect(60, 60, W - 120, H - 120);
  g.fillStyle = '#C8FF00'; g.beginPath(); g.arc(150, 150, 30, 0, Math.PI * 2); g.fill();
  g.lineWidth = 14; g.strokeStyle = '#0B0B0F'; g.beginPath(); g.arc(150, 150, 30, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#0B0B0F'; g.font = '600 40px "Geist Variable", system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('gather', 200, 152);
  const center = (text: string, y: number, font: string, color = '#0B0B0F', max = W - 300) => {
    g.font = font; g.fillStyle = color; g.textAlign = 'center';
    let t = text; while (g.measureText(t).width > max && t.length > 4) t = `${t.slice(0, -2)}…`;
    g.fillText(t, W / 2, y); g.textAlign = 'left';
  };
  center(c.title.toUpperCase(), 330, '600 46px "Geist Variable", system-ui, sans-serif', '#0047FF');
  center('This is to certify that', 430, '400 34px "Geist Variable", system-ui, sans-serif', '#5F6068');
  center(c.name, 540, '600 96px "Geist Variable", system-ui, sans-serif');
  g.fillStyle = '#C8FF00'; g.fillRect(W / 2 - 220, 610, 440, 8);
  center('has participated in', 690, '400 34px "Geist Variable", system-ui, sans-serif', '#5F6068');
  center(c.eventTitle, 770, '600 56px "Geist Variable", system-ui, sans-serif');
  center([c.dates, c.venue].filter(Boolean).join(' · '), 840, '400 30px "Geist Variable", system-ui, sans-serif', '#5F6068');
  if (c.organiser) center(`Organised by ${c.organiser}`, 888, '400 28px "Geist Variable", system-ui, sans-serif', '#5F6068');
  const signers = c.signers.slice(0, 3);
  signers.forEach((s, i) => {
    const x = signers.length === 1 ? W / 2 : 380 + (i * (W - 760)) / Math.max(1, signers.length - 1);
    g.strokeStyle = '#0B0B0F'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 170, 1010); g.lineTo(x + 170, 1010); g.stroke();
    g.textAlign = 'center'; g.fillStyle = '#0B0B0F'; g.font = '600 30px "Geist Variable", system-ui, sans-serif'; g.fillText(s.name, x, 1050);
    g.fillStyle = '#5F6068'; g.font = '400 24px "Geist Variable", system-ui, sans-serif'; g.fillText(s.title, x, 1088); g.textAlign = 'left';
  });
  const { default: QRCode } = await import('qrcode');
  const qr = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1, color: { dark: '#0B0B0F', light: '#FFFFFF' } });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = qr; });
  g.drawImage(img, W - 300, 110, 170, 170);
  g.fillStyle = '#5F6068'; g.font = '400 20px "Geist Variable", system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText(`ID ${c.id}`, W - 215, 305); g.fillText('Scan to verify', W - 215, 332); g.textAlign = 'left';
  return cv;
}

export async function certificatePdf(c: CertificateDoc, verifyUrl: string): Promise<Blob> {
  const cv = await drawCertificate(c, verifyUrl);
  const png = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/png'));
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${c.title} - ${c.name}`); pdf.setAuthor('Gather'); pdf.setSubject(c.eventTitle);
  const page = pdf.addPage([841.89, 595.28]);
  const embedded = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
  page.drawImage(embedded, { x: 0, y: 0, width: 841.89, height: 595.28 });
  return new Blob([(await pdf.save()).slice()], { type: 'application/pdf' });
}
