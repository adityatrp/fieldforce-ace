/**
 * Workday boundary helper.
 *
 * A salesperson's "workday" runs from 5:00 AM to 5:00 AM the next day.
 * - If the current time is >= 5 AM today, the workday started at 5 AM today.
 * - If the current time is < 5 AM today, the workday started at 5 AM yesterday.
 *
 * This is used so that:
 *  - Punch-in / punch-out can only happen once per workday.
 *  - Tracking lists (live distance, today's pings) reset at 5 AM, not midnight.
 */
export const WORKDAY_RESET_HOUR = 5;

export function workdayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(WORKDAY_RESET_HOUR, 0, 0, 0);
  if (now.getHours() < WORKDAY_RESET_HOUR) {
    start.setDate(start.getDate() - 1);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function workdayBoundsISO(now: Date = new Date()) {
  const { start, end } = workdayBounds(now);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}
