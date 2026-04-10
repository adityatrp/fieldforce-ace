import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const LeaderboardPage: React.FC = () => {
  const { user } = useAuth();

  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const [{ data: profiles }, { data: visits }, { data: targets }] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('visits').select('*'),
        supabase.from('targets').select('*'),
      ]);

      if (!profiles) return [];

      return profiles.map(p => {
        // Only count verified visits
        const userVisits = (visits || []).filter(v => v.assigned_to === p.user_id && v.visit_status === 'verified');
        const userTarget = (targets || []).find(t => t.user_id === p.user_id);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const thisWeek = userVisits.filter(v => new Date(v.checked_in_at) >= weekAgo);
        const orders = userVisits.filter(v => v.order_received).length;

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
          orders,
          workHours: Math.round(workedMs / (1000 * 60 * 60) * 10) / 10,
          achievementPct,
        };
      }).sort((a, b) => b.totalVisits - a.totalVisits || b.orders - a.orders);
    },
    enabled: !!user,
  });

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">Leaderboard</h1>
        <p className="text-muted-foreground mt-1">Top performers by verified visits</p>
      </div>

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
