const SYMBOLS = { BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹' };

export function money(value, currency = 'BDT') {
  const n = Number(value ?? 0);
  const sym = SYMBOLS[currency] ?? `${currency} `;
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}${sym}${body}`;
}

export const num = (v) => Number(v ?? 0).toLocaleString('en-US');

export const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (v) =>
  v
    ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

// money maths on the client uses integer cents to avoid float drift
export const toCents = (v) => Math.round(Number(v || 0) * 100);
export const fromCents = (c) => c / 100;

export const titleCase = (s = '') => s.replace(/_/g, ' ').toLowerCase().replace(/^\w|\s\w/g, (m) => m.toUpperCase());
