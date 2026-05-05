// Flexible monthly visit counter logic.
// Replaces the old "fixed periods" approach: a salesperson must do N successful
// check-ins per shop per calendar month, with a minimum 72-hour gap between
// consecutive successful check-ins at the same shop.

export const MIN_GAP_HOURS = 72;
export const MIN_GAP_MS = MIN_GAP_HOURS * 60 * 60 * 1000;

export function monthStart(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function nextMonthStart(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

/**
 * Given the verified visits at a shop in this month and a target, return:
 * - completedThisMonth: number of successful check-ins this month
 * - lastSuccessAt: timestamp of last verified check-in (any time)
 * - cooldownUntil: when the salesperson can check in again (null if eligible)
 * - eligible: true if a new check-in is allowed right now
 */
export function evaluateAssignment(
  visitsThisMonth: { visit_status: string; checked_in_at: string }[],
  visitsPerMonth: number,
  now: Date = new Date(),
): {
  completedThisMonth: number;
  remaining: number;
  lastSuccessAt: Date | null;
  cooldownUntil: Date | null;
  eligible: boolean;
  done: boolean;
} {
  const verified = visitsThisMonth
    .filter(v => v.visit_status === 'verified' || v.visit_status === 'checked_in')
    .map(v => new Date(v.checked_in_at))
    .sort((a, b) => a.getTime() - b.getTime());

  const completedThisMonth = verified.length;
  const remaining = Math.max(0, visitsPerMonth - completedThisMonth);
  const lastSuccessAt = verified.length ? verified[verified.length - 1] : null;
  const done = remaining === 0;

  let cooldownUntil: Date | null = null;
  if (lastSuccessAt) {
    const next = new Date(lastSuccessAt.getTime() + MIN_GAP_MS);
    if (next.getTime() > now.getTime()) cooldownUntil = next;
  }

  const eligible = !done && cooldownUntil === null;
  return { completedThisMonth, remaining, lastSuccessAt, cooldownUntil, eligible, done };
}

export function formatCooldown(until: Date, now: Date = new Date()): string {
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return 'now';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
