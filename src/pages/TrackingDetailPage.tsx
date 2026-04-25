import React, { useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Battery, BatteryCharging, BatteryLow, Clock, MapPin, ExternalLink, RefreshCw, Calendar, Route, History, Radio, Navigation,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeIdleMinutes, formatMinutes, totalActiveVisitMinutes, totalDistanceKm } from '@/lib/distance';
import { upsertTodaySummary } from '@/lib/dailySummary';

function dayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

const TrackingDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { startISO, endISO } = useMemo(() => dayBounds(), []);

  const { data: profile } = useQuery({
    queryKey: ['tracking-detail-profile', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, team_name')
        .eq('user_id', userId!)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const { data: logs = [], refetch: refetchLogs, isFetching: fetchingLogs } = useQuery({
    queryKey: ['tracking-detail-logs', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('location_logs')
        .select('id, latitude, longitude, accuracy, logged_at, battery_percent, battery_charging, source')
        .eq('user_id', userId!)
        .gte('logged_at', startISO)
        .lt('logged_at', endISO)
        .order('logged_at', { ascending: true });
      return data || [];
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const { data: punch } = useQuery({
    queryKey: ['tracking-detail-punch', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance_punches')
        .select('punched_in_at, punched_out_at, battery_percent_in, battery_percent_out')
        .eq('user_id', userId!)
        .gte('punched_in_at', startISO)
        .lt('punched_in_at', endISO)
        .order('punched_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['tracking-detail-visits', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('visits')
        .select('id, customer_name, checked_in_at, checked_out_at, visit_status')
        .eq('assigned_to', userId!)
        .gte('checked_in_at', startISO)
        .lt('checked_in_at', endISO)
        .order('checked_in_at', { ascending: true });
      return data || [];
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['tracking-detail-history', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance_daily_summary')
        .select('*')
        .eq('user_id', userId!)
        .order('work_date', { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!userId,
  });

  // Live recompute for today (so the lead always sees fresh numbers).
  const stats = useMemo(() => {
    const verifiedIntervals = visits
      .filter(v => v.checked_out_at && (v.visit_status === 'verified' || v.visit_status === 'completed'))
      .map(v => ({ start: v.checked_in_at, end: v.checked_out_at as string }));
    return {
      distanceKm: totalDistanceKm(logs),
      idleMin: computeIdleMinutes(logs, verifiedIntervals),
      activeVisitMin: totalActiveVisitMinutes(verifiedIntervals),
      latest: logs[logs.length - 1] || null,
    };
  }, [logs, visits]);

  // After we render today's view, persist a fresh "today" summary so the
  // history stays accurate even before punch-out.
  useEffect(() => {
    if (!userId || !user || logs.length === 0) return;
    // Only the owner can write their own summary (RLS). Skip for leads/admins.
    if (user.id !== userId) return;
    upsertTodaySummary(userId, {
      punched_in_at: punch?.punched_in_at,
      punched_out_at: punch?.punched_out_at,
    }).then(() => refetchHistory());
  }, [userId, user, logs.length, punch?.punched_in_at, punch?.punched_out_at, refetchHistory]);

  useEffect(() => {
    if (!userId || (role !== 'admin' && role !== 'team_lead' && user?.id !== userId)) return;

    const channel = supabase
      .channel(`tracking-detail-live-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'location_logs', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['tracking-detail-logs', userId] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_punches', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['tracking-detail-punch', userId] });
          qc.invalidateQueries({ queryKey: ['tracking-detail-history', userId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role, user?.id, qc]);

  const refresh = () => {
    refetchLogs();
    qc.invalidateQueries({ queryKey: ['tracking-detail-punch', userId] });
    qc.invalidateQueries({ queryKey: ['tracking-detail-visits', userId] });
    refetchHistory();
  };

  // Live "next ping in" countdown (5-min cadence) + "X seconds ago".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (role !== 'admin' && role !== 'team_lead' && user?.id !== userId) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        You don't have access to this page.
      </div>
    );
  }

  const latest = stats.latest;
  const isActive = !!punch && !punch.punched_out_at;

  // Derived ping timing values from `now` ticker above.
  // When NOT punched in: timer parks at "next 5:00" / "0s ago" — no overdue label.
  const lastPingMs = latest ? new Date(latest.logged_at).getTime() : null;
  const secondsSince = isActive && lastPingMs
    ? Math.max(0, Math.floor((now - lastPingMs) / 1000))
    : null;
  const rawNextPingSec = isActive && lastPingMs
    ? 300 - Math.floor((now - lastPingMs) / 1000)
    : null;
  const nextPingSec = isActive
    ? (rawNextPingSec != null ? Math.max(0, rawNextPingSec) : 300)
    : 300;
  // Only flag overdue while punched in.
  const isPingOverdue = isActive && rawNextPingSec != null && rawNextPingSec < 0;
  const formatAgo = (s: number) => {
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s ago`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ago`;
  };
  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const battPct = latest?.battery_percent ?? null;
  const BatteryIcon = latest?.battery_charging ? BatteryCharging : (battPct != null && battPct <= 15 ? BatteryLow : Battery);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 rounded-xl h-9" onClick={() => navigate('/tracking')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="outline" size="sm" className="ml-auto rounded-xl gap-1.5 h-9" onClick={refresh} disabled={fetchingLogs}>
          <RefreshCw className={cn('h-3.5 w-3.5', fetchingLogs && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Identity */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
            {(profile?.full_name || profile?.email || '?')[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{profile?.full_name || profile?.email || 'Loading...'}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.team_name || 'No team'}</p>
          </div>
          {isActive ? (
            <Badge className="bg-success/10 text-success border-success/20 gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Live
            </Badge>
          ) : (
            <Badge variant="outline">Offline</Badge>
          )}
        </CardContent>
      </Card>

      {/* HERO: Live location + battery (most important card on the page) */}
      <Card className="rounded-2xl overflow-hidden border-primary/20 shadow-lg">
        <div className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-full bg-primary-foreground/15 flex items-center justify-center shrink-0">
                <Navigation className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest font-semibold opacity-80">Current Location</p>
                <p className="text-[10px] opacity-70">Auto-pings every 5 min while punched in</p>
              </div>
            </div>
            {battPct != null ? (
              <div className="flex items-center gap-1.5 bg-primary-foreground/20 backdrop-blur rounded-full px-3 py-1.5 shrink-0">
                <BatteryIcon className="h-4 w-4" />
                <span className="font-bold text-sm">{battPct}%</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-primary-foreground/10 rounded-full px-3 py-1.5 opacity-60 shrink-0">
                <Battery className="h-4 w-4" />
                <span className="text-xs">N/A</span>
              </div>
            )}
          </div>

          {latest ? (
            <>
              <div>
                <p className="text-[10px] uppercase opacity-70 tracking-wide mb-1">Coordinates (13 dp)</p>
                <p className="font-mono text-[13px] sm:text-sm bg-primary-foreground/15 backdrop-blur rounded-lg px-3 py-2.5 break-all leading-relaxed">
                  {latest.latitude.toFixed(13)},<br />{latest.longitude.toFixed(13)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-primary-foreground/15 rounded-full px-2.5 py-1">
                  <Clock className="h-3 w-3" />
                  <span className="font-medium">{secondsSince != null ? formatAgo(secondsSince) : '—'}</span>
                </div>
                {latest.accuracy != null && (
                  <div className="bg-primary-foreground/15 rounded-full px-2.5 py-1 font-medium">
                    ±{Math.round(latest.accuracy)}m
                  </div>
                )}
                <div className="bg-primary-foreground/15 rounded-full px-2.5 py-1 capitalize font-medium">
                  {String(latest.source).replace(/_/g, ' ')}
                </div>
                {nextPingSec != null && (
                  <div className="ml-auto flex items-center gap-1.5 bg-primary-foreground/25 rounded-full px-2.5 py-1 font-mono font-semibold">
                    <Radio className={cn('h-3 w-3', isActive && 'animate-pulse')} />
                    {isPingOverdue
                      ? `overdue ${formatAgo(Math.abs(rawNextPingSec!))}`
                      : `next ${formatCountdown(nextPingSec)}`}
                  </div>
                )}
              </div>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${latest.latitude},${latest.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button size="lg" variant="secondary" className="w-full rounded-xl gap-2 font-semibold shadow-md">
                  <ExternalLink className="h-4 w-4" />
                  Open in Google Maps
                </Button>
              </a>
            </>
          ) : (
            <div className="text-center py-6 opacity-80">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-60" />
              <p className="text-sm">No pings recorded yet today.</p>
              <p className="text-xs opacity-70 mt-1">Pings start once the salesperson punches in.</p>
            </div>
          )}
        </div>
        <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Pings received today</span>
          <span className="font-bold">{logs.length}</span>
        </div>
      </Card>

      {/* Big numbers: distance + idle */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-1.5 text-primary text-xs font-semibold uppercase tracking-wide">
              <Route className="h-3.5 w-3.5" /> Distance
            </div>
            <p className="text-4xl font-bold mt-2 text-primary">{stats.distanceKm.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">km traveled today</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              <Clock className="h-3.5 w-3.5" /> Idle Time
            </div>
            <p className="text-4xl font-bold mt-2">{formatMinutes(stats.idleMin)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              no movement{stats.activeVisitMin > 0 && ` • ${formatMinutes(stats.activeVisitMin)} in visits excluded`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Punch in/out */}
      {punch && (
        <Card className="rounded-2xl">
          <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Punched In</p>
              <p className="font-semibold">
                {new Date(punch.punched_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Punched Out</p>
              <p className="font-semibold">
                {punch.punched_out_at
                  ? new Date(punch.punched_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day-wise history */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
            <History className="h-3.5 w-3.5" /> Day-wise history
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet — saved at punch-out each day.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map(h => (
                <div key={h.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium w-24 shrink-0">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    {new Date(h.work_date).toLocaleDateString([], { month: 'short', day: '2-digit', year: '2-digit' })}
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="font-bold text-primary">{Number(h.total_distance_km).toFixed(2)} km</p>
                      <p className="text-[10px] text-muted-foreground">distance</p>
                    </div>
                    <div>
                      <p className="font-bold">{formatMinutes(h.total_idle_minutes)}</p>
                      <p className="text-[10px] text-muted-foreground">idle</p>
                    </div>
                    <div>
                      <p className="font-bold">
                        {h.punched_in_at
                          ? new Date(h.punched_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                        {' → '}
                        {h.punched_out_at
                          ? new Date(h.punched_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">in / out</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrackingDetailPage;
