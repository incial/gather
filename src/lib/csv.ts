export type Row = Record<string, string | number | boolean | null | undefined>;

/**
 * A cell starting with = + - @ runs as a formula in Excel, and attendees type
 * these values themselves. Plain phone numbers like +91 98765 43210 are left alone.
 */
function safe(value: Row[string]): string {
  const s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]+$/.test(s)) return `'${s}`;
  return s;
}

function cell(value: Row[string]): string {
  const s = safe(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads Malayalam, Hindi etc. correctly
}

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(filename: string, rows: Row[], columns?: string[]) {
  downloadBlob(filename, new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }));
}
