import type { EventInfoDoc, HelpContact } from './types';

export const MAX_CONTACTS = 3;

/** Digits only, keeping a leading +. Accepts spaces, dashes and brackets as typed. */
export const normPhone = (p: string) => { const t = p.trim(); return (t.startsWith('+') ? '+' : '') + t.replace(/[^0-9]/g, ''); };

/** 7–15 digits (international numbers), optional + country code. */
export function phoneError(p: string): string | null {
  const n = normPhone(p);
  const digits = n.replace('+', '');
  if (!digits) return 'Add a phone number.';
  if (digits.length < 7 || digits.length > 15) return 'That phone number doesn’t look right. Include the country code, like +91 98765 43210.';
  return null;
}

/** Checks the list the organiser typed: up to three, no duplicates, exactly one primary. Empty rows are dropped. */
export function cleanContacts(list: HelpContact[]): { value: HelpContact[] } | { error: string } {
  const rows = list.filter((c) => c.phone.trim() || c.name.trim());
  if (rows.length > MAX_CONTACTS) return { error: `Up to ${MAX_CONTACTS} help desk contacts.` };
  const seen = new Set<string>();
  const out: HelpContact[] = [];
  for (const c of rows) {
    const err = phoneError(c.phone);
    if (err) return { error: `${c.name || 'Contact'}: ${err}` };
    const n = normPhone(c.phone);
    if (seen.has(n.replace(/^\+/, ''))) return { error: 'The same phone number is listed twice.' };
    seen.add(n.replace(/^\+/, ''));
    out.push({ name: c.name.trim().slice(0, 60), designation: c.designation.trim().slice(0, 60), phone: n, primary: !!c.primary });
  }
  if (out.length && !out.some((c) => c.primary)) out[0].primary = true;
  let primarySeen = false;
  for (const c of out) { if (c.primary && primarySeen) c.primary = false; if (c.primary) primarySeen = true; }
  return { value: out };
}

/** Contacts to show attendees, falling back to the older single help line. Primary first. */
export function contactsOf(info: EventInfoDoc | null): HelpContact[] {
  if (!info) return [];
  const list = info.helpdesk?.length ? info.helpdesk : info.helplinePhone ? [{ name: info.helplineName || 'Event desk', designation: '', phone: info.helplinePhone, primary: true }] : [];
  return [...list].sort((a, b) => Number(b.primary) - Number(a.primary));
}

export const waLink = (phone: string) => `https://wa.me/${normPhone(phone).replace('+', '')}`;
