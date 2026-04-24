import React, { useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Battery, BatteryCharging, Clock, MapPin, ExternalLink, RefreshCw, Calendar, Route, History,
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

  const refresh = () => {
    refetchLogs();
    qc.invalidateQueries({ queryKey: ['tracking-detail-punch', userId] });
    qc.invalidateQueries({ queryKey: ['tracking-detail-visits', userId] });
    refetchHistory();
  };

  if (role !== 'admin' && role !== 'team_lead' && user?.id !== userId) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        You don't have access to this page.
      </div>
    );
  }

  const latest = stats.latest;
  const isActive = !!punch && !punch.punched_out_at;

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
            <Badge className="bg-success/10 text-success border-success/20">Live</Badge>
          ) : (
            <Badge variant="outline">Offline</Badge>
          )}
        </CardContent>
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

      {/* Latest backend location + battery */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Latest in backend
            </p>
            {latest?.battery_percent !== null && latest?.battery_percent !== undefined && (
              <span className="flex items-center gap-1 text-xs">
                {latest.battery_charging ? (
                  <BatteryCharging className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Battery className={cn('h-3.5 w-3.5', latest.battery_percent <= 20 && 'text-destructive')} />
                )}
                <span className="font-semibold">{latest.battery_percent}%</span>
              </span>
            )}
          </div>

          {latest ? (
            <>
              <div className="font-mono text-sm bg-muted/40 rounded-lg px-3 py-2 break-all">
                {latest.latitude.toFixed(13)}, {latest.longitude.toFixed(13)}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {new Date(latest.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {latest.accuracy != null && ` • ±${Math.round(latest.accuracy)}m`}
                  {' • '}
                  <span className="capitalize">{String(latest.source).replace(/_/g, ' ')}</span>
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${latest.latitude},${latest.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button size="sm" variant="default" className="rounded-xl h-8 gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Google Maps
                  </Button>
                </a>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No pings recorded yet today.</p>
          )}
        </CardContent>
      </Card>

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
