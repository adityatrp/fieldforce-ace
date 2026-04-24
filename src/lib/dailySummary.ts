import { supabase } from '@/integrations/supabase/client';
import { computeIdleMinutes, totalActiveVisitMinutes, totalDistanceKm } from '@/lib/distance';

function dayBounds(d = new Date()) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Recomputes today's tracking totals for `userId` from raw logs + verified
 * visits, then upserts into attendance_daily_summary. Called on punch-out
 * (and from the live view for "today" recompute).
 */
export async function upsertTodaySummary(userId: string, punch?: {
  punched_in_at?: string | null;
  punched_out_at?: string | null;
}) {
  const { start, end } = dayBounds();
  const dateStr = start.toISOString().slice(0, 10);

  const [logsRes, visitsRes, punchRes] = await Promise.all([
    supabase
      .from('location_logs')
      .select('latitude, longitude, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', start.toISOString())
      .lt('logged_at', end.toISOString())
      .order('logged_at', { ascending: true }),
    supabase
      .from('visits')
      .select('checked_in_at, checked_out_at, visit_status')
      .eq('assigned_to', userId)
      .gte('checked_in_at', start.toISOString())
      .lt('checked_in_at', end.toISOString())
      .in('visit_status', ['verified', 'completed']),
    punch
      ? Promise.resolve({ data: punch })
      : supabase
          .from('attendance_punches')
          .select('punched_in_at, punched_out_at')
          .eq('user_id', userId)
          .gte('punched_in_at', start.toISOString())
          .lt('punched_in_at', end.toISOString())
          .order('punched_in_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);

  const logs = logsRes.data || [];
  const visits = (visitsRes.data || [])
    .filter(v => v.checked_out_at)
    .map(v => ({ start: v.checked_in_at, end: v.checked_out_at as string }));

  const distanceKm = totalDistanceKm(logs);
  const idleMin = computeIdleMinutes(logs, visits);
  const activeVisitMin = totalActiveVisitMinutes(visits);

  await supabase.from('attendance_daily_summary').upsert(
    {
      user_id: userId,
      work_date: dateStr,
      total_distance_km: Number(distanceKm.toFixed(3)),
      total_idle_minutes: idleMin,
      total_active_visit_minutes: activeVisitMin,
      ping_count: logs.length,
      punched_in_at: punchRes.data?.punched_in_at ?? null,
      punched_out_at: punchRes.data?.punched_out_at ?? null,
    },
    { onConflict: 'user_id,work_date' },
  );
}
