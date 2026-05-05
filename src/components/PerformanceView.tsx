import React, { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';
import { monthStart } from '@/lib/visitCounter';

interface SP { user_id: string; full_name: string; email: string; }
interface Props { teamId: string | null | undefined; salespersons: SP[]; }

const PerformanceView: React.FC<Props> = ({ teamId, salespersons }) => {
  // Shops (and assignments) for this team
  const { data: shops = [] } = useQuery({
    queryKey: ['perf-shops', teamId],
    queryFn: async () => {
      const { data } = await supabase.from('shops').select('id, name').eq('team_id', teamId!).eq('active', true);
      return data || [];
    },
    enabled: !!teamId,
  });

  const shopIds = shops.map(s => s.id);

  const { data: assignments = [] } = useQuery({
    queryKey: ['perf-assignments', teamId, shopIds.length],
    queryFn: async () => {
      if (shopIds.length === 0) return [];
      const { data } = await supabase
        .from('shop_assignments')
        .select('id, shop_id, assigned_to, visits_per_month')
        .in('shop_id', shopIds).eq('active', true);
      return data || [];
    },
    enabled: shopIds.length > 0,
  });

  // Visits in current month for these shops
  const { data: visits = [] } = useQuery({
    queryKey: ['perf-visits', teamId, shopIds.length],
    queryFn: async () => {
      if (shopIds.length === 0) return [];
      const { data } = await supabase
        .from('visits')
        .select('id, shop_id, assigned_to, visit_status, checked_in_at')
        .in('shop_id', shopIds)
        .gte('checked_in_at', monthStart().toISOString());
      return data || [];
    },
    enabled: shopIds.length > 0,
  });

  // Per-salesperson summary: expected = sum of visits_per_month, completed =
  // verified visits this month at those shops. Shortfall list = shops where
  // completed < target.
  const summary = useMemo(() => {
    const shopsByName = new Map(shops.map(s => [s.id, s.name]));

    return salespersons.map(sp => {
      const myAssignments = assignments.filter(a => a.assigned_to === sp.user_id);
      let expected = 0;
      let completed = 0;
      const shortfall: { shopName: string; done: number; target: number }[] = [];

      for (const a of myAssignments) {
        expected += a.visits_per_month;
        const myVisitsForShop = visits.filter(
          v => v.shop_id === a.shop_id && v.assigned_to === sp.user_id
            && (v.visit_status === 'verified' || v.visit_status === 'checked_in')
        );
        const done = myVisitsForShop.length;
        completed += Math.min(done, a.visits_per_month);
        if (done < a.visits_per_month) {
          shortfall.push({
            shopName: shopsByName.get(a.shop_id) || 'Shop',
            done,
            target: a.visits_per_month,
          });
        }
      }

      const pct = expected > 0 ? Math.round((completed / expected) * 100) : 100;
      return { sp, expected, completed, pct, shortfall };
    });
  }, [salespersons, assignments, visits, shops]);

  if (!teamId) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No team.</CardContent></Card>;
  }

  if (shops.length === 0 || assignments.length === 0) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
      Add shops and assign them to salespersons to see performance.
    </CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {summary.map(({ sp, expected, completed, pct, shortfall }) => {
        const underperforming = pct < 70 && expected > 0;
        return (
          <Card key={sp.user_id} className={`field-card ${underperforming ? 'border-destructive/40' : ''}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{sp.full_name || sp.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {completed} of {expected} visit{expected === 1 ? '' : 's'} done this month
                  </p>
                </div>
                <Badge variant="outline" className={
                  underperforming
                    ? 'bg-destructive/10 text-destructive border-destructive/20 gap-1'
                    : pct >= 90
                      ? 'bg-success/10 text-success border-success/20 gap-1'
                      : 'bg-warning/10 text-warning border-warning/20 gap-1'
                }>
                  {underperforming ? <TrendingDown className="h-3 w-3" /> : pct >= 90 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {pct}%
                </Badge>
              </div>
              <Progress value={pct} className="h-2" />

              {shortfall.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">
                    Shortfall ({shortfall.length} shop{shortfall.length === 1 ? '' : 's'})
                  </p>
                  {shortfall.slice(0, 6).map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                        <p className="font-medium truncate">{m.shopName}</p>
                        <p className="text-muted-foreground text-[11px] shrink-0">{m.done}/{m.target}</p>
                      </div>
                    </div>
                  ))}
                  {shortfall.length > 6 && (
                    <p className="text-[11px] text-muted-foreground">+{shortfall.length - 6} more</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PerformanceView;

