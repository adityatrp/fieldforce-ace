// Period math for shop-assignment-based visits.
// "Fixed periods from month start": 1=full month, 2=halves, 3=thirds, 4=weekly-ish, 5=~6 days.

export type Period = { index: number; start: Date; end: Date };

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Splits month into N contiguous periods covering days 1..lastDay. */
export function periodsForMonth(year: number, month0: number, n: number): Period[] {
  const last = daysInMonth(year, month0);
  // Compute period boundaries by even integer split of [1..last].
  const out: Period[] = [];
  for (let i = 0; i < n; i++) {
    const startDay = Math.floor((i * last) / n) + 1;
    const endDay = Math.floor(((i + 1) * last) / n);
    out.push({
      index: i,
      start: new Date(year, month0, startDay, 0, 0, 0, 0),
      end: new Date(year, month0, endDay, 23, 59, 59, 999),
    });
  }
  return out;
}

export function currentPeriod(date: Date, n: number): Period {
  const periods = periodsForMonth(date.getFullYear(), date.getMonth(), n);
  const t = date.getTime();
  return periods.find(p => t >= p.start.getTime() && t <= p.end.getTime()) || periods[periods.length - 1];
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function periodLabel(p: Period): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${p.start.toLocaleDateString(undefined, opts)} – ${p.end.toLocaleDateString(undefined, opts)}`;
}

/** All periods in the current month for a given visits/month frequency. */
export function monthPeriods(date: Date, n: number): Period[] {
  return periodsForMonth(date.getFullYear(), date.getMonth(), n);
}
