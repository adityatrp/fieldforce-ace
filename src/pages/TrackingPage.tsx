import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Battery, BatteryCharging, Navigation, Calendar, RefreshCw, Route } from 'lucide-react';
import { cn } from '@/lib/utils';

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

const TrackingPage: React.FC = () => {
  const { user, role } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Visible salespersons (RLS already restricts team_lead to own team)
  const { data: profiles = [] } = useQuery({
    queryKey: ['tracking-profiles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, team_name')
        .order('full_name');
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  // All location logs for selected date across visible users (RLS-filtered)
  const dayStart = useMemo(() => new Date(selectedDate + 'T00:00:00').toISOString(), [selectedDate]);
  const dayEnd = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }, [selectedDate]);

  const { data: logs = [], refetch: refetchLogs, isFetching } = useQuery({
    queryKey: ['tracking-logs', selectedDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('location_logs')
        .select('*')
        .gte('logged_at', dayStart)
        .lt('logged_at', dayEnd)
        .order('logged_at', { ascending: true });
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  const { data: punches = [] } = useQuery({
    queryKey: ['tracking-punches', selectedDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance_punches')
        .select('*')
        .gte('punched_in_at', dayStart)
        .lt('punched_in_at', dayEnd);
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  // Per-user aggregation
  const perUser = useMemo(() => {
    const byUser = new Map<string, any[]>();
    for (const l of logs) {
      const arr = byUser.get(l.user_id) || [];
      arr.push(l);
      byUser.set(l.user_id, arr);
    }
    return profiles
      .filter(p => byUser.has(p.user_id) || punches.some(pn => pn.user_id === p.user_id))
      .map(p => {
        const userLogs = (byUser.get(p.user_id) || []).sort(
          (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
        );
        let distanceM = 0;
        for (let i = 1; i < userLogs.length; i++) {
          distanceM += getDistanceMeters(
            userLogs[i - 1].latitude,
            userLogs[i - 1].longitude,
            userLogs[i].latitude,
            userLogs[i].longitude
          );
        }
        const last = userLogs[userLogs.length - 1];
        const punch = punches.find(pn => pn.user_id === p.user_id);
        return {
          profile: p,
          logs: userLogs,
          distanceKm: distanceM / 1000,
          pings: userLogs.length,
          lastBattery: last?.battery_percent ?? punch?.battery_percent_in ?? null,
          lastCharging: last?.battery_charging ?? null,
          punchedInAt: punch?.punched_in_at ?? null,
          punchedOutAt: punch?.punched_out_at ?? null,
        };
      })
      .sort((a, b) => b.distanceKm - a.distanceKm);
  }, [logs, profiles, punches]);

  const selectedUser = perUser.find(u => u.profile.user_id === selectedUserId);

  if (role !== 'admin' && role !== 'team_lead') {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        You don't have access to this page.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-header">Field Tracking</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {role === 'admin' ? 'All salespersons' : 'Your team'} • daily distance, route history & battery
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5 h-9"
          onClick={() => refetchLogs()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Date picker */}
      <Card className="rounded-2xl">
        <CardContent className="p-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            max={todayISO()}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-transparent text-sm font-medium outline-none flex-1"
          />
          <Badge variant="outline" className="text-[11px]">
            {perUser.length} active
          </Badge>
        </CardContent>
      </Card>

      {/* Summary list */}
      {perUser.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No tracking data for this date.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {perUser.map(u => (
            <Card
              key={u.profile.user_id}
              className={cn(
                'rounded-2xl cursor-pointer transition-all',
                selectedUserId === u.profile.user_id && 'ring-2 ring-primary'
              )}
              onClick={() =>
                setSelectedUserId(selectedUserId === u.profile.user_id ? null : u.profile.user_id)
              }
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {(u.profile.full_name || u.profile.email)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{u.profile.full_name || u.profile.email}</p>
                      {u.lastBattery !== null && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          {u.lastCharging ? <BatteryCharging className="h-3.5 w-3.5 text-success" /> : <Battery className={cn('h-3.5 w-3.5', u.lastBattery <= 20 && 'text-destructive')} />}
                          {u.lastBattery}%
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{u.profile.team_name || 'No team'}</p>

                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <p className="text-base font-bold text-primary">{u.distanceKm.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">km traveled</p>
                      </div>
                      <div>
                        <p className="text-base font-bold">{u.pings}</p>
                        <p className="text-[10px] text-muted-foreground">check-ins</p>
                      </div>
                      <div>
                        <p className="text-base font-bold">
                          {u.punchedInAt
                            ? new Date(u.punchedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {u.punchedOutAt ? `out ${new Date(u.punchedOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'still in'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Route detail */}
                {selectedUserId === u.profile.user_id && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Route className="h-3.5 w-3.5" /> Route history
                    </p>
                    {u.logs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No location pings recorded.</p>
                    ) : (
                      <ol className="space-y-1.5">
                        {u.logs.map((log, idx) => (
                          <li key={log.id} className="flex items-start gap-2 text-xs">
                            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">
                                  {new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-[10px] text-muted-foreground capitalize">
                                  {String(log.source).replace(/_/g, ' ')}
                                </span>
                              </div>
                              <a
                                href={`https://www.openstreetmap.org/?mlat=${log.latitude}&mlon=${log.longitude}#map=18/${log.latitude}/${log.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-primary hover:underline break-all flex items-center gap-1"
                                onClick={e => e.stopPropagation()}
                              >
                                <MapPin className="h-3 w-3 shrink-0" />
                                {log.latitude.toFixed(6)}, {log.longitude.toFixed(6)}
                                {log.accuracy && (
                                  <span className="text-muted-foreground">(±{Math.round(log.accuracy)}m)</span>
                                )}
                              </a>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrackingPage;
