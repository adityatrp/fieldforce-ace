import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, TrendingUp, MapPin, Clock } from 'lucide-react';

const LeaderboardPage: React.FC = () => {
  const { user, role } = useAuth();

  // For admins/leads, fetch all profiles + their visits count
  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      // Fetch profiles (admins/leads see all, salesperson sees own)
      const { data: profiles } = await supabase.from('profiles').select('*');
      const { data: visits } = await supabase.from('visits').select('*');
      const { data: targets } = await supabase.from('targets').select('*');

      if (!profiles) return [];

      return profiles.map(p => {
        const userVisits = (visits || []).filter(v => v.user_id === p.user_id);
        const userTarget = (targets || []).find(t => t.user_id === p.user_id);
        const thisWeek = userVisits.filter(v => {
          const d = new Date(v.checked_in_at);
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return d >= weekAgo;
        });

        // Calculate work hours from check-in/out pairs
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
          team: p.team_name || '',
          totalVisits: userVisits.length,
          weeklyVisits: thisWeek.length,
          workHours: Math.round(workedMs / (1000 * 60 * 60) * 10) / 10,
          achievementPct,
        };
      }).sort((a, b) => b.achievementPct - a.achievementPct || b.weeklyVisits - a.weeklyVisits);
    },
    enabled: !!user,
  });

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">Leaderboard</h1>
        <p className="text-muted-foreground mt-1">Top performers this week</p>
      </div>

      {/* Top 3 podium */}
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
                    <p className="text-lg font-bold text-primary">{entry.achievementPct}%</p>
                    <p className="text-[10px] text-muted-foreground">Target</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{entry.weeklyVisits}</p>
                    <p className="text-[10px] text-muted-foreground">Visits</p>
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

      {/* Full ranking table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Full Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : leaderboard.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No data available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">#</th>
                    <th className="text-left py-3 px-2">Name</th>
                    <th className="text-right py-3 px-2">Achievement</th>
                    <th className="text-right py-3 px-2">Visits (Week)</th>
                    <th className="text-right py-3 px-2">Total Visits</th>
                    <th className="text-right py-3 px-2">Work Hours</th>
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
                          <div>
                            <p className="font-medium">{entry.name}</p>
                            {entry.team && <p className="text-xs text-muted-foreground">{entry.team}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className={`font-semibold ${entry.achievementPct >= 100 ? 'text-success' : entry.achievementPct >= 50 ? 'text-primary' : 'text-warning'}`}>
                          {entry.achievementPct}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">{entry.weeklyVisits}</td>
                      <td className="py-3 px-2 text-right">{entry.totalVisits}</td>
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
