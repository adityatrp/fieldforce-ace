// Shared geo helpers for distance + idle-time math.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface PingPoint {
  latitude: number;
  longitude: number;
  logged_at: string;
}

/** Total straight-line distance (km) along a sequence of pings, ascending by time. */
export function totalDistanceKm(pings: PingPoint[]): number {
  let m = 0;
  for (let i = 1; i < pings.length; i++) {
    m += haversineMeters(pings[i - 1].latitude, pings[i - 1].longitude, pings[i].latitude, pings[i].longitude);
  }
  return m / 1000;
}

/**
 * Idle-time estimator using the rule the user picked:
 *   "If 3 consecutive pings (≈15 min) are all within the same 100m radius,
 *    that 15-min window counts as idle. Sum every overlapping window."
 *
 * Implementation: slide a window of 3 consecutive pings. Whenever the max
 * pairwise distance within the window is ≤ 100m, mark the time-span between
 * the first and third ping as idle. Then merge overlapping intervals so we
 * don't double-count, and total the merged duration.
 *
 * Verified-visit active intervals are passed in and subtracted from the result
 * so time spent inside a check-in/check-out window never counts as idle.
 */
export function computeIdleMinutes(
  pings: PingPoint[],
  activeVisitIntervals: Array<{ start: string; end: string }> = [],
  radiusMeters = 100,
): number {
  if (pings.length < 3) return 0;
  const sorted = [...pings].sort(
    (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
  );
  const idleSpans: Array<[number, number]> = [];
  for (let i = 0; i + 2 < sorted.length; i++) {
    const p0 = sorted[i];
    const p1 = sorted[i + 1];
    const p2 = sorted[i + 2];
    const d01 = haversineMeters(p0.latitude, p0.longitude, p1.latitude, p1.longitude);
    const d02 = haversineMeters(p0.latitude, p0.longitude, p2.latitude, p2.longitude);
    const d12 = haversineMeters(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
    if (Math.max(d01, d02, d12) <= radiusMeters) {
      idleSpans.push([new Date(p0.logged_at).getTime(), new Date(p2.logged_at).getTime()]);
    }
  }
  if (idleSpans.length === 0) return 0;

  // Merge overlapping spans
  idleSpans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [idleSpans[0]];
  for (let i = 1; i < idleSpans.length; i++) {
    const last = merged[merged.length - 1];
    if (idleSpans[i][0] <= last[1]) {
      last[1] = Math.max(last[1], idleSpans[i][1]);
    } else {
      merged.push(idleSpans[i]);
    }
  }

  // Subtract verified visit intervals
  const visits = activeVisitIntervals
    .map(v => [new Date(v.start).getTime(), new Date(v.end).getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  let totalMs = 0;
  for (const [s, e] of merged) {
    let cursor = s;
    for (const [vs, ve] of visits) {
      if (ve <= cursor || vs >= e) continue;
      const overlapStart = Math.max(cursor, vs);
      const overlapEnd = Math.min(e, ve);
      if (overlapStart > cursor) totalMs += overlapStart - cursor;
      cursor = Math.max(cursor, overlapEnd);
    }
    if (cursor < e) totalMs += e - cursor;
  }
  return Math.round(totalMs / 60000);
}

export function totalActiveVisitMinutes(intervals: Array<{ start: string; end: string }>): number {
  let ms = 0;
  for (const v of intervals) {
    ms += Math.max(0, new Date(v.end).getTime() - new Date(v.start).getTime());
  }
  return Math.round(ms / 60000);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
