import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';
import { routeFromScan, parsePass, passCode } from './qr';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines and round-trips through parseCsv', () => {
    const csv = toCsv([{ name: 'Rao, "Anika"', note: 'line one\nline two', mal: 'മലയാളം' }]);
    expect(parseCsv(csv)).toEqual([{ name: 'Rao, "Anika"', note: 'line one\nline two', mal: 'മലയാളം' }]);
  });
  it('starts with a BOM so Excel detects UTF-8', () => {
    expect(toCsv([{ a: 1 }]).charCodeAt(0)).toBe(0xfeff);
  });
  it('neutralises spreadsheet formulas but keeps phone numbers', () => {
    const csv = toCsv([{ a: '=HYPERLINK("http://x")', b: '@SUM(1)', c: '+91 98765 43210', d: '-1+2' }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(`'@SUM(1)`);
    expect(csv).toContain(',+91 98765 43210,');
  });
  it('writes a header even with no rows', () => {
    expect(toCsv([], ['name', 'email'])).toBe('\uFEFFname,email\r\n');
  });
});

describe('parseCsv', () => {
  it('normalises headers, handles CRLF and skips blank lines', () => {
    expect(parseCsv('Name, EMAIL \r\nAsha,a@x.in\r\n\r\n,\r\n')).toEqual([{ name: 'Asha', email: 'a@x.in' }]);
  });
});

describe('routeFromScan', () => {
  const o = 'https://gather.example';
  it('accepts app links and keeps the key', () => {
    expect(routeFromScan(`${o}/e/abc/c/s1?k=ABC123`, o)).toBe('/e/abc/c/s1?k=ABC123');
    expect(routeFromScan(`${o}/e/abc/connect/sp1`, o)).toBe('/e/abc/connect/sp1');
    expect(routeFromScan(`${o}/join/NFDP26`, o)).toBe('/join/NFDP26');
    // Private event links and Pulse links work from the scanner too.
    expect(routeFromScan(`${o}/e/abc`, o)).toBe('/e/abc');
    expect(routeFromScan(`${o}/pulse/join/ABC234`, o)).toBe('/pulse/join/ABC234');
    expect(routeFromScan(`${o}/pulse/survey/p1`, o)).toBe('/pulse/survey/p1');
    expect(routeFromScan(`${o}/speaker?event=abc`, o)).toBe('/speaker?event=abc');
    expect(routeFromScan(`${o}/e/abc/admin/x`, o)).toBeNull();
  });
  it('rejects other sites, other routes and plain text', () => {
    expect(routeFromScan('https://evil.example/e/abc/c/s1', o)).toBeNull();
    expect(routeFromScan(`${o}/admin`, o)).toBeNull();
    expect(routeFromScan('hello', o)).toBeNull();
  });
});

describe('parsePass', () => {
  it('only accepts passes for this event', () => {
    expect(parsePass(passCode('e1', 'u1'), 'e1')).toBe('u1');
    expect(parsePass(passCode('e2', 'u1'), 'e1')).toBeNull();
    expect(parsePass('junk', 'e1')).toBeNull();
  });
});

describe('QR codes', () => {
  it('generated codes decode with the in-app scanner library', () => {
    const text = 'https://gather.example/e/AbC123xyz/c/SeSsIoN456?k=F8VDSN';
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const scale = 6, quiet = 4, size = (modules.size + quiet * 2) * scale;
    const px = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
      if (!modules.get(y, x)) continue;
      for (let i = 0; i < scale * scale; i++) {
        const py = (y + quiet) * scale + Math.floor(i / scale), pxl = (x + quiet) * scale + (i % scale);
        px.fill(0, (py * size + pxl) * 4, (py * size + pxl) * 4 + 3);
      }
    }
    expect(jsQR(px, size, size)?.data).toBe(text);
  });
});

describe('readPass', () => {
  it('reads new registration-ID passes and old account-ID passes', async () => {
    const { passCodeFor, readPass } = await import('./qr');
    expect(readPass(passCodeFor('e1', 'AB23-CD45'))).toEqual({ eventId: 'e1', regId: 'AB23-CD45' });
    expect(readPass(passCode('e1', 'u1'))).toEqual({ eventId: 'e1', uid: 'u1' });
    expect(readPass('GATHER-PASS:e1')).toBeNull();
    expect(readPass('https://evil.example')).toBeNull();
    expect(parsePass(passCodeFor('e1', 'AB23-CD45'), 'e1')).toBeNull();
  });
});

describe('help desk contacts', () => {
  it('validates, removes empties, blocks duplicates and keeps one primary', async () => {
    const { cleanContacts, contactsOf } = await import('./helpdesk');
    const c = (phone: string, primary = false, name = 'Desk') => ({ name, designation: '', phone, primary });
    expect(cleanContacts([c('+91 98765 43210'), c('', false, ''), c('080-4444 5555', true)])).toEqual({ value: [
      { name: 'Desk', designation: '', phone: '+919876543210', primary: false }, { name: 'Desk', designation: '', phone: '08044445555', primary: true },
    ] });
    expect('error' in cleanContacts([c('+91 98765 43210'), c('919876543210')])).toBe(true);
    expect('error' in cleanContacts([c('123')])).toBe(true);
    expect('error' in cleanContacts([c('9876543210'), c('9876543211'), c('9876543212'), c('9876543213')])).toBe(true);
    const one = cleanContacts([c('9876543210')]);
    expect('value' in one && one.value[0].primary).toBe(true);
    expect(contactsOf({ id: 'i', wifiName: '', wifiPassword: '', helplinePhone: '123456789', helplineName: 'Old' })[0].name).toBe('Old');
  });
});
