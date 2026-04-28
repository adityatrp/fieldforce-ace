import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const LeaderboardPage: React.FC = () => {
  const { user, role } = useAuth();
  const [selectedTeam, setSelectedTeam] = useState<string>('all');

  const { data: profiles = [] } = useQuery({
    queryKey: ['lb-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['lb-visits'],
    queryFn: async () => {
      const { data } = await supabase.from('visits').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: targets = [] } = useQuery({
    queryKey: ['lb-targets'],
    queryFn: async () => {
      const { data } = await supabase.from('targets').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['lb-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['lb-teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['lb-team-members'],
    queryFn: async () => {
      const { data } = await supabase.from('team_members').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const getTeamName = (userId: string) => {
    const membership = teamMembers.find(tm => tm.user_id === userId);
    if (!membership) return 'Unassigned';
    const team = teams.find(t => t.id === membership.team_id);
    return team?.name || 'Unassigned';
  };

  const getTeamId = (userId: string) => {
    const membership = teamMembers.find(tm => tm.user_id === userId);
    return membership?.team_id || '';
  };

  // Current calendar month window — leaderboard resets on the 1st of every month
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const monthEnd = useMemo(() => {
    const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d;
  }, [monthStart]);

  // Team Lead's own team membership
  const myTeamMembership = teamMembers.find(tm => tm.user_id === user?.id);
  const myTeamId = myTeamMembership?.team_id;

  const leaderboard = useMemo(() => {
    const salespersonIds = roles.filter(r => r.role === 'salesperson').map(r => r.user_id);

    return profiles
      .filter(p => salespersonIds.includes(p.user_id))
      .filter(p => {
        // Team Lead is restricted to own team only
        if (role === 'team_lead') return getTeamId(p.user_id) === myTeamId;
        return selectedTeam === 'all' || getTeamId(p.user_id) === selectedTeam;
      })
      .map(p => {
        // Only count visits inside the current month — leaderboard resets monthly
        const userVisits = visits.filter(v =>
          v.assigned_to === p.user_id &&
          v.visit_status === 'verified' &&
          new Date(v.checked_in_at) >= monthStart &&
          new Date(v.checked_in_at) < monthEnd
        );
        const userTarget = targets.find(t => t.user_id === p.user_id);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const thisWeek = userVisits.filter(v => new Date(v.checked_in_at) >= weekAgo);
        const orders = userVisits.filter(v => v.order_received && (((v as any).order_approval_status || 'pending') === 'approved')).length;

        const workedMs = userVisits.reduce((sum, v) => {
          if (v.checked_out_at) {
            return sum + (new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime());
          }
          return sum;
        }, 0);

        const achievementPct = userTarget
          ? Math.round((Number(userTarget.achieved_value) / Number(userTarget.target_value)) * 100)
          : 0;

        return {
          id: p.user_id,
          name: p.full_name || 'Unknown',
          team: getTeamName(p.user_id),
          teamId: getTeamId(p.user_id),
          totalVisits: userVisits.length,
          weeklyVisits: thisWeek.length,
          orders,
          workHours: Math.round(workedMs / (1000 * 60 * 60) * 10) / 10,
          achievementPct,
        };
      }).sort((a, b) => b.totalVisits - a.totalVisits || b.orders - a.orders);
  }, [profiles, visits, targets, roles, selectedTeam, teamMembers, teams, role, myTeamId, monthStart, monthEnd]);

  // Team-wise aggregation for admin
  const teamStats = useMemo(() => {
    if (role !== 'admin') return [];
    const salespersonIds = roles.filter(r => r.role === 'salesperson').map(r => r.user_id);
    return teams.map(t => {
      const memberIds = teamMembers.filter(tm => tm.team_id === t.id).map(tm => tm.user_id).filter(id => salespersonIds.includes(id));
      const teamVisits = visits.filter(v => memberIds.includes(v.assigned_to || '') && v.visit_status === 'verified');
      const teamOrders = teamVisits.filter(v => v.order_received && (((v as any).order_approval_status || 'pending') === 'approved')).length;
      return {
        teamId: t.id,
        teamName: t.name,
        members: memberIds.length,
        totalVisits: teamVisits.length,
        orders: teamOrders,
        conversionRate: teamVisits.length > 0 ? Math.round((teamOrders / teamVisits.length) * 100) : 0,
      };
    }).sort((a, b) => b.totalVisits - a.totalVisits);
  }, [teams, teamMembers, visits, roles, role]);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Leaderboard</h1>
          <p className="text-muted-foreground mt-1">Top performing salespersons by verified visits</p>
        </div>
        {role === 'admin' && teams.length > 0 && (
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Team-wise performance for admin */}
      {role === 'admin' && teamStats.length > 0 && selectedTeam === 'all' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Team-wise Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamStats.map(ts => (
                <div key={ts.teamId} className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <p className="font-bold">{ts.teamName}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Members</p>
                      <p className="font-semibold">{ts.members}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Verified Visits</p>
                      <p className="font-semibold text-success">{ts.totalVisits}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Orders</p>
                      <p className="font-semibold">{ts.orders}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Conversion</p>
                      <p className="font-semibold">{ts.conversionRate}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {leaderboard.length >= 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {leaderboard.slice(0, 3).map((entry, i) => (
            <Card key={entry.id} className={`relative overflow-hidden ${i === 0 ? 'border-accent sm:order-2 ring-2 ring-accent/20' : i === 1 ? 'sm:order-1' : 'sm:order-3'}`}>
              <CardContent className="pt-6 pb-5 text-center">
                <div className="text-3xl mb-2">{medals[i]}</div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <span className="text-lg font-bold text-primary">{entry.name[0]}</span>
                </div>
                <p className="font-bold">{entry.name}</p>
                {entry.team && <p className="text-xs text-muted-foreground">{entry.team}</p>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-success">{entry.totalVisits}</p>
                    <p className="text-[10px] text-muted-foreground">Verified</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{entry.orders}</p>
                    <p className="text-[10px] text-muted-foreground">Orders</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{entry.workHours}h</p>
                    <p className="text-[10px] text-muted-foreground">Hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Full Rankings {selectedTeam !== 'all' ? `— ${teams.find(t => t.id === selectedTeam)?.name}` : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No data available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">#</th>
                    <th className="text-left py-3 px-2">Name</th>
                    <th className="text-left py-3 px-2">Team</th>
                    <th className="text-right py-3 px-2">Verified</th>
                    <th className="text-right py-3 px-2">Orders</th>
                    <th className="text-right py-3 px-2">This Week</th>
                    <th className="text-right py-3 px-2">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-2 font-medium">{i + 1}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {entry.name[0]}
                          </div>
                          <p className="font-medium">{entry.name}</p>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground">{entry.team || '—'}</td>
                      <td className="py-3 px-2 text-right font-semibold text-success">{entry.totalVisits}</td>
                      <td className="py-3 px-2 text-right">{entry.orders}</td>
                      <td className="py-3 px-2 text-right">{entry.weeklyVisits}</td>
                      <td className="py-3 px-2 text-right">{entry.workHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeaderboardPage;
