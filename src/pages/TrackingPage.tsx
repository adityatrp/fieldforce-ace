import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Battery, BatteryCharging, ChevronRight, RefreshCw, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { totalDistanceKm } from '@/lib/distance';
import { isNativeApp } from '@/lib/native';
import { workdayBoundsISO } from '@/lib/workday';

const TrackingPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Workday window: 5 AM → 5 AM (matches the salesperson punch-in/out reset).
  const { startISO, endISO } = useMemo(() => workdayBoundsISO(), []);

  // For Team Leads: get the teams this lead belongs to, then everyone in those teams.
  // For Admins: fetch every profile.
  const { data: profiles = [] } = useQuery({
    queryKey: ['tracking-profiles', user?.id, role],
    queryFn: async () => {
      if (role === 'admin') {
        const [{ data: profs }, { data: members }, { data: teams }] = await Promise.all([
          supabase.from('profiles').select('user_id, full_name, email, team_name, avatar_url').order('full_name'),
          supabase.from('team_members').select('user_id, team_id'),
          supabase.from('teams').select('id, name'),
        ]);
        const teamById = new Map((teams || []).map(t => [t.id, t.name]));
        const teamByUser = new Map((members || []).map(m => [m.user_id, teamById.get(m.team_id) || '']));
        return (profs || []).map(p => ({ ...p, team_name: teamByUser.get(p.user_id) || p.team_name || '' }));
      }

      if (role === 'team_lead' && user) {
        // 1. Find the lead's teams
        const { data: leadTeams } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id);
        const teamIds = (leadTeams || []).map(t => t.team_id);
        if (teamIds.length === 0) return [];

        // 2. Find all members of those teams (including the lead themselves)
        const [{ data: allMembers }, { data: teams }] = await Promise.all([
          supabase.from('team_members').select('user_id, team_id').in('team_id', teamIds),
          supabase.from('teams').select('id, name').in('id', teamIds),
        ]);
        const teamById = new Map((teams || []).map(t => [t.id, t.name]));
        const userIds = Array.from(new Set((allMembers || []).map(m => m.user_id))).filter(uid => uid !== user.id);
        if (userIds.length === 0) return [];
        const teamNameByUser = new Map((allMembers || []).map(m => [m.user_id, teamById.get(m.team_id) || '']));

        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, team_name, avatar_url')
          .in('user_id', userIds)
          .order('full_name');

        return (profs || []).map(p => ({ ...p, team_name: teamNameByUser.get(p.user_id) || p.team_name || '' }));
      }

      return [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
    staleTime: 60_000,
  });

  const { data: logs = [], refetch: refetchLogs, isFetching: fetchingLogs } = useQuery({
    queryKey: ['tracking-today-logs', startISO],
    queryFn: async () => {
      const { data } = await supabase
        .from('location_logs')
        .select('user_id, latitude, longitude, logged_at, battery_percent, battery_charging')
        .gte('logged_at', startISO)
        .lt('logged_at', endISO)
        .order('logged_at', { ascending: true });
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000, // poll every 30s as a safety net
  });

  const { data: punches = [], refetch: refetchPunches } = useQuery({
    queryKey: ['tracking-today-punches', startISO],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance_punches')
        .select('user_id, punched_in_at, punched_out_at, battery_percent_in')
        .gte('punched_in_at', startISO)
        .lt('punched_in_at', endISO);
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  // Realtime: invalidate the queries whenever a new ping or punch arrives
  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'team_lead')) return;

    const channel = supabase
      .channel('tracking-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['tracking-today-logs'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_punches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['tracking-today-punches'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, queryClient]);

  const rows = useMemo(() => {
    const byUser = new Map<string, typeof logs>();
    for (const l of logs) {
      const arr = byUser.get(l.user_id) || [];
      arr.push(l);
      byUser.set(l.user_id, arr);
    }
    return profiles
      .map(p => {
        const userLogs = byUser.get(p.user_id) || [];
        const punch = punches.find(pn => pn.user_id === p.user_id);
        const last = userLogs[userLogs.length - 1];
        const distanceKm = totalDistanceKm(userLogs);
        const isActive = !!punch && !punch.punched_out_at;
        return {
          profile: p,
          distanceKm,
          isActive,
          hasActivity: userLogs.length > 0 || !!punch,
          lastBattery: last?.battery_percent ?? punch?.battery_percent_in ?? null,
          lastCharging: last?.battery_charging ?? null,
          lastPingAt: last?.logged_at ?? null,
        };
      })
      .sort((a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        Number(b.hasActivity) - Number(a.hasActivity) ||
        b.distanceKm - a.distanceKm ||
        (a.profile.full_name || a.profile.email).localeCompare(b.profile.full_name || b.profile.email)
      );
  }, [logs, profiles, punches]);

  const refresh = () => {
    refetchLogs();
    refetchPunches();
  };

  if (role !== 'admin' && role !== 'team_lead') {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        You don't have access to this page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-header">Field Tracking</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {role === 'admin' ? 'All salespersons' : 'Your team'} • live distance today
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5 h-9"
          onClick={refresh}
          disabled={fetchingLogs}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', fetchingLogs && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {!isNativeApp() && (
        <Card className="rounded-2xl border-warning/30 bg-warning/5">
          <CardContent className="p-3 flex items-start gap-2 text-xs">
            <Smartphone className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-foreground/80">
              <span className="font-semibold">Background tracking requires the installed mobile app.</span>{' '}
              In a browser, location only updates while a salesperson keeps the tab open. Install the FieldForce native app on each device for true 5-minute background pings (works with screen off).
            </p>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {role === 'team_lead'
              ? "No salespersons in your team yet. Add team members from the Team page."
              : 'No salespersons found.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <button
              key={r.profile.user_id}
              onClick={() => navigate(`/tracking/${r.profile.user_id}`)}
              className="w-full text-left"
            >
              <Card className="rounded-2xl hover:bg-accent/30 transition-colors active:scale-[0.99]">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="relative h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {(r.profile.full_name || r.profile.email)[0]?.toUpperCase()}
                    {r.isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-background animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{r.profile.full_name || r.profile.email}</p>
                      {r.isActive ? (
                        <Badge variant="secondary" className="h-5 text-[10px] bg-success/10 text-success border-success/20">live</Badge>
                      ) : r.hasActivity ? (
                        <Badge variant="outline" className="h-5 text-[10px]">offline</Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">not punched in</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.profile.team_name || 'No team'}
                      {r.lastPingAt && ` • last ping ${new Date(r.lastPingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-primary leading-none">{r.distanceKm.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">km today</p>
                    {r.lastBattery !== null && (
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center justify-end gap-0.5">
                        {r.lastCharging ? <BatteryCharging className="h-3 w-3 text-success" /> : <Battery className={cn('h-3 w-3', r.lastBattery <= 20 && 'text-destructive')} />}
                        {r.lastBattery}%
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrackingPage;
