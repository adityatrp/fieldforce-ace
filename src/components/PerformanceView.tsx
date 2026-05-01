import React, { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';
import { monthPeriods, isoDate } from '@/lib/visitPeriods';

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
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('visits')
        .select('id, shop_id, assigned_to, visit_status, period_index, period_start, checked_in_at')
        .in('shop_id', shopIds)
        .gte('checked_in_at', start.toISOString());
      return data || [];
    },
    enabled: shopIds.length > 0,
  });

  // Per-salesperson summary
  const summary = useMemo(() => {
    const today = new Date();
    const todayIso = isoDate(today);
    const shopsByName = new Map(shops.map(s => [s.id, s.name]));

    return salespersons.map(sp => {
      const myAssignments = assignments.filter(a => a.assigned_to === sp.user_id);
      let expectedSoFar = 0;
      let completedSoFar = 0;
      const missedShops: { shopName: string; missedPeriods: string[] }[] = [];

      for (const a of myAssignments) {
        const periods = monthPeriods(today, a.visits_per_month);
        // Expected = periods whose start has passed
        const elapsed = periods.filter(p => isoDate(p.start) <= todayIso);
        expectedSoFar += elapsed.length;
        const myVisitsForShop = visits.filter(v => v.shop_id === a.shop_id && v.assigned_to === sp.user_id);
        const completedPeriods = new Set<number>();
        myVisitsForShop.forEach(v => {
          if (v.period_index != null && (v.visit_status === 'verified' || v.visit_status === 'checked_in')) {
            completedPeriods.add(v.period_index);
          }
        });
        completedSoFar += elapsed.filter(p => completedPeriods.has(p.index)).length;

        // Missed periods = elapsed periods whose end is in the past and not completed
        const missed = elapsed.filter(p => isoDate(p.end) < todayIso && !completedPeriods.has(p.index));
        if (missed.length > 0) {
          missedShops.push({
            shopName: shopsByName.get(a.shop_id) || 'Shop',
            missedPeriods: missed.map(p =>
              `${p.start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}–${p.end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
            ),
          });
        }
      }

      const pct = expectedSoFar > 0 ? Math.round((completedSoFar / expectedSoFar) * 100) : 100;
      return { sp, expectedSoFar, completedSoFar, pct, missedShops };
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
      {summary.map(({ sp, expectedSoFar, completedSoFar, pct, missedShops }) => {
        const underperforming = pct < 70 && expectedSoFar > 0;
        return (
          <Card key={sp.user_id} className={`field-card ${underperforming ? 'border-destructive/40' : ''}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{sp.full_name || sp.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {completedSoFar} of {expectedSoFar} expected visit{expectedSoFar === 1 ? '' : 's'} completed this month
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

              {missedShops.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Missed periods ({missedShops.length} shop{missedShops.length === 1 ? '' : 's'})</p>
                  {missedShops.slice(0, 6).map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{m.shopName}</p>
                        <p className="text-muted-foreground text-[11px]">{m.missedPeriods.join(' · ')}</p>
                      </div>
                    </div>
                  ))}
                  {missedShops.length > 6 && (
                    <p className="text-[11px] text-muted-foreground">+{missedShops.length - 6} more</p>
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
