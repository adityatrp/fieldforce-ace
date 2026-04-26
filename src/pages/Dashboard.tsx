import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { MapPin, Receipt, Target, Clock, CheckCircle2, XCircle, Package, Users, TrendingUp, IndianRupee, Bell, ArrowLeft, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useToast } from '@/hooks/use-toast';

const COLORS = ['hsl(213, 56%, 24%)', 'hsl(152, 55%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

type DashboardPeriod = 'this_week' | 'this_month' | 'last_month' | 'last_3_months' | 'all_time';

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  this_week: 'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  last_3_months: 'Past 3 Months',
  all_time: 'All Time',
};

function getPeriodRange(period: DashboardPeriod): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (period === 'all_time') return { start: null, end: null };
  if (period === 'this_week') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { start, end: null };
  }
  if (period === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: null };
  }
  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }
  if (period === 'last_3_months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    return { start, end: null };
  }
  return { start: null, end: null };
}

const Dashboard: React.FC = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [selectedSP, setSelectedSP] = useState<string | null>(null);
  const [adminTeamFilter, setAdminTeamFilter] = useState<string>('all');
  const [period, setPeriod] = useState<DashboardPeriod>('this_month');

  const { periodStart, periodEnd } = useMemo(() => {
    const { start, end } = getPeriodRange(period);
    return { periodStart: start, periodEnd: end };
  }, [period]);

  const inPeriod = (dateStr: string | null | undefined) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (periodStart && d < periodStart) return false;
    if (periodEnd && d >= periodEnd) return false;
    return true;
  };

  const { data: visits = [] } = useQuery({
    queryKey: ['dashboard-visits', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('visits').select('*').order('created_at', { ascending: false }).limit(500);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['dashboard-expenses', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(500);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: targets = [] } = useQuery({
    queryKey: ['dashboard-targets', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('targets').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['dashboard-team-members'],
    queryFn: async () => {
      const { data } = await supabase.from('team_members').select('*');
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['dashboard-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name');
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['dashboard-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('*');
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['dashboard-teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('*');
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['dashboard-order-items'],
    queryFn: async () => {
      const { data } = await supabase.from('visit_order_items').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const myTeamMembership = teamMembers.find(tm => tm.user_id === user?.id);
  const myTeamId = myTeamMembership?.team_id;
  const myTeamMemberIds = teamMembers.filter(tm => tm.team_id === myTeamId).map(tm => tm.user_id);

  // Apply admin team filter (only when admin and no SP drill-in)
  const adminTeamMemberIds = useMemo(() => {
    if (role !== 'admin' || adminTeamFilter === 'all') return null;
    return teamMembers.filter(tm => tm.team_id === adminTeamFilter).map(tm => tm.user_id);
  }, [role, adminTeamFilter, teamMembers]);

  const scopedVisits = useMemo(() => {
    let base: any[];
    if (selectedSP) base = visits.filter(v => v.assigned_to === selectedSP);
    else if (role === 'salesperson') base = visits.filter(v => v.assigned_to === user?.id);
    else if (role === 'team_lead') base = visits.filter(v => myTeamMemberIds.includes(v.assigned_to || ''));
    else if (role === 'admin' && adminTeamMemberIds) base = visits.filter(v => adminTeamMemberIds.includes(v.assigned_to || ''));
    else base = visits;
    if (period === 'all_time') return base;
    // For pending visits, use created_at; for completed visits, use checked_in_at
    return base.filter(v => {
      const dateField = v.visit_status === 'assigned' ? v.created_at : v.checked_in_at;
      return inPeriod(dateField);
    });
  }, [visits, role, user, myTeamMemberIds, selectedSP, adminTeamMemberIds, period, periodStart, periodEnd]);

  const scopedExpenses = useMemo(() => {
    let base: any[];
    if (selectedSP) base = expenses.filter(e => e.user_id === selectedSP);
    else if (role === 'salesperson') base = expenses.filter(e => e.user_id === user?.id);
    else if (role === 'team_lead') base = expenses.filter(e => myTeamMemberIds.includes(e.user_id));
    else if (role === 'admin' && adminTeamMemberIds) base = expenses.filter(e => adminTeamMemberIds.includes(e.user_id));
    else base = expenses;
    if (period === 'all_time') return base;
    return base.filter(e => inPeriod(e.created_at));
  }, [expenses, role, user, myTeamMemberIds, selectedSP, adminTeamMemberIds, period, periodStart, periodEnd]);

  const verifiedVisits = scopedVisits.filter(v => v.visit_status === 'verified');
  const failedVisits = scopedVisits.filter(v => v.visit_status === 'failed');
  const pendingVisits = scopedVisits.filter(v => v.visit_status === 'assigned');
  const approvedOrderVisits = verifiedVisits.filter(v => v.order_received && ((v as any).order_approval_status || 'pending') === 'approved');
  const pendingOrderVisits = verifiedVisits.filter(v => v.order_received && ((v as any).order_approval_status || 'pending') === 'pending');
  const ordersReceived = approvedOrderVisits.length;
  const ordersPending = pendingOrderVisits.length;
  const totalExpenses = scopedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const approvedExpenses = scopedExpenses.filter(e => e.approval_status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
  const pendingExpenses = scopedExpenses.filter(e => e.approval_status === 'pending' || e.approval_status === 'flagged').reduce((s, e) => s + Number(e.amount), 0);

  const todayVerified = verifiedVisits.filter(v =>
    new Date(v.checked_in_at).toDateString() === new Date().toDateString()
  ).length;

  const teamMemberCount = role === 'team_lead' ? myTeamMemberIds.filter(id => {
    const r = roles.find(r => r.user_id === id);
    return r?.role === 'salesperson';
  }).length : role === 'admin' ? roles.filter(r => r.role === 'salesperson').length : 0;

  const orderConversionRate = verifiedVisits.length > 0
    ? Math.round((ordersReceived / verifiedVisits.length) * 100)
    : 0;

  // Underperformers detection for lead
  const underperformers = useMemo(() => {
    if (role !== 'team_lead' && role !== 'admin') return [];
    const spIds = role === 'team_lead'
      ? myTeamMemberIds.filter(id => roles.find(r => r.user_id === id)?.role === 'salesperson')
      : roles.filter(r => r.role === 'salesperson').map(r => r.user_id);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return spIds.map(uid => {
      const uVisits = visits.filter(v => v.assigned_to === uid && new Date(v.checked_in_at) >= weekAgo);
      const verified = uVisits.filter(v => v.visit_status === 'verified').length;
      const failed = uVisits.filter(v => v.visit_status === 'failed').length;
      const target = targets.find(t => t.user_id === uid);
      const name = profiles.find(p => p.user_id === uid)?.full_name || 'Unknown';
      const membership = teamMembers.find(tm => tm.user_id === uid);
      const teamName = membership ? teams.find(t => t.id === membership.team_id)?.name || 'Unassigned' : 'Unassigned';
      const achievedPct = target && Number(target.target_value) > 0
        ? Math.round((Number(target.achieved_value) / Number(target.target_value)) * 100) : null;
      return { uid, name, teamName, weeklyVisits: verified, failed, achievedPct };
    }).filter(sp => sp.weeklyVisits < 3 || sp.failed > sp.weeklyVisits);
  }, [visits, roles, myTeamMemberIds, role, targets, profiles, teamMembers, teams]);

  const selectedSPName = selectedSP ? profiles.find(p => p.user_id === selectedSP)?.full_name || 'Unknown' : null;

  const stats = (role === 'salesperson' || selectedSP) ? [
    { label: 'Verified Visits', value: verifiedVisits.length, icon: CheckCircle2, color: 'text-success' },
    { label: 'Today', value: todayVerified, icon: Clock, color: 'text-accent' },
    { label: 'Orders', value: ordersReceived, icon: Package, color: 'text-primary' },
    { label: 'Pending', value: pendingVisits.length, icon: MapPin, color: 'text-warning' },
  ] : [
    { label: 'Total Visits', value: scopedVisits.length, icon: MapPin, color: 'text-primary' },
    { label: 'Verified', value: verifiedVisits.length, icon: CheckCircle2, color: 'text-success' },
    { label: 'Orders', value: ordersReceived, icon: Package, color: 'text-accent' },
    { label: role === 'admin' ? 'All Salespersons' : 'Team Members', value: teamMemberCount, icon: Users, color: 'text-primary' },
  ];

  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toDateString();
    return {
      day: d.toLocaleDateString('en', { weekday: 'short' }),
      verified: verifiedVisits.filter(v => new Date(v.checked_in_at).toDateString() === dayStr).length,
      failed: failedVisits.filter(v => new Date(v.checked_in_at).toDateString() === dayStr).length,
    };
  });

  const expenseByCategory = Object.entries(
    scopedExpenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const sendAlert = (spName: string) => {
    toast({
      title: `Alert sent to ${spName}`,
      description: 'Performance improvement notification has been sent.',
    });
  };

  // Sales achieved (current month) per salesperson, based on visit_order_items totals
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const monthEnd = useMemo(() => {
    const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d;
  }, [monthStart]);

  const visitIdToUser = useMemo(() => {
    const m: Record<string, string> = {};
    visits.forEach(v => { if (v.assigned_to) m[v.id] = v.assigned_to; });
    return m;
  }, [visits]);

  const monthSalesByUser = useMemo(() => {
    const verifiedThisMonth = new Map<string, any>();
    visits
      .filter(v => v.visit_status === 'verified' && new Date(v.checked_in_at) >= monthStart && new Date(v.checked_in_at) < monthEnd)
      .forEach(v => verifiedThisMonth.set(v.id, v));
    const approved: Record<string, number> = {};
    const pending: Record<string, number> = {};
    orderItems.forEach((oi: any) => {
      const v = verifiedThisMonth.get(oi.visit_id);
      if (!v) return;
      const uid = visitIdToUser[oi.visit_id];
      if (!uid) return;
      const status = (v as any).order_approval_status || 'pending';
      if (status === 'rejected') return;
      const amt = Number(oi.price_at_order) * Number(oi.quantity);
      if (status === 'approved') approved[uid] = (approved[uid] || 0) + amt;
      else pending[uid] = (pending[uid] || 0) + amt;
    });
    return { approved, pending };
  }, [orderItems, visits, monthStart, monthEnd, visitIdToUser]);

  // Scoped sales for the headline card
  const scopedUserIds = useMemo(() => {
    if (selectedSP) return [selectedSP];
    if (role === 'salesperson') return user ? [user.id] : [];
    if (role === 'team_lead') return myTeamMemberIds;
    if (role === 'admin' && adminTeamMemberIds) return adminTeamMemberIds;
    return roles.filter(r => r.role === 'salesperson').map(r => r.user_id);
  }, [selectedSP, role, user, myTeamMemberIds, adminTeamMemberIds, roles]);

  const scopedSalesAchieved = scopedUserIds.reduce((s, uid) => s + (monthSalesByUser.approved[uid] || 0), 0);
  const scopedSalesPending = scopedUserIds.reduce((s, uid) => s + (monthSalesByUser.pending[uid] || 0), 0);
  const scopedTargetTotal = scopedUserIds.reduce((s, uid) => {
    const t = targets.find(t => t.user_id === uid);
    return s + (t ? Number(t.target_value) : 0);
  }, 0);
  const scopedTargetPct = scopedTargetTotal > 0 ? Math.round((scopedSalesAchieved / scopedTargetTotal) * 100) : 0;

  // End-of-month non-achievers (only show late in month or after month end)
  const dayOfMonth = new Date().getDate();
  const isMonthEnd = dayOfMonth >= 25;
  const nonAchievers = useMemo(() => {
    if (!isMonthEnd || (role !== 'admin' && role !== 'team_lead')) return [];
    const spIds = role === 'team_lead'
      ? myTeamMemberIds.filter(id => roles.find(r => r.user_id === id)?.role === 'salesperson')
      : (adminTeamMemberIds || roles.filter(r => r.role === 'salesperson').map(r => r.user_id));
    return spIds.map(uid => {
      const target = targets.find(t => t.user_id === uid);
      const targetVal = target ? Number(target.target_value) : 0;
      const achieved = monthSalesByUser[uid] || 0;
      const pct = targetVal > 0 ? Math.round((achieved / targetVal) * 100) : 0;
      const name = profiles.find(p => p.user_id === uid)?.full_name || 'Unknown';
      const membership = teamMembers.find(tm => tm.user_id === uid);
      const teamName = membership ? teams.find(t => t.id === membership.team_id)?.name || 'Unassigned' : 'Unassigned';
      return { uid, name, teamName, targetVal, achieved, pct };
    }).filter(x => x.targetVal > 0 && x.pct < 100);
  }, [isMonthEnd, role, myTeamMemberIds, adminTeamMemberIds, roles, targets, monthSalesByUser, profiles, teamMembers, teams]);

  const periodSelector = (
    <Select value={period} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
      <SelectTrigger className="w-40 h-9">
        <SelectValue placeholder="Period" />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map(p => (
          <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <div>
        {selectedSP ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setSelectedSP(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div>
                <h1 className="page-header">{selectedSPName}'s Dashboard</h1>
                <p className="text-muted-foreground mt-1 text-sm">{PERIOD_LABELS[period]}</p>
              </div>
            </div>
            {periodSelector}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="page-header">Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {role === 'admin'
                  ? (adminTeamFilter === 'all' ? 'All teams overview' : `${teams.find(t => t.id === adminTeamFilter)?.name || ''} team overview`)
                  : role === 'team_lead' ? 'Team performance' : 'Your performance'}
                {' · '}{PERIOD_LABELS[period]}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {periodSelector}
              {role === 'admin' && (
                <Select value={adminTeamFilter} onValueChange={setAdminTeamFilter}>
                  <SelectTrigger className="w-48 h-9">
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
          </div>
        )}
      </div>

      {/* Sales target progress card — monthly target, only shown for this month / all time views */}
      {scopedTargetTotal > 0 && (period === 'this_month' || period === 'all_time') && (
        <Card className="border-primary/20">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Target className="h-5 w-5 text-primary shrink-0" />
                <p className="font-semibold text-sm truncate">Sales Target</p>
              </div>
              <p className="text-sm font-bold whitespace-nowrap">
                ₹{Math.round(scopedSalesAchieved).toLocaleString()} <span className="text-muted-foreground font-medium">/ ₹{scopedTargetTotal.toLocaleString()}</span>
              </p>
            </div>
            <Progress value={Math.min(100, scopedTargetPct)} className="h-2" />
            <p className={`text-xs mt-2 font-medium ${scopedTargetPct >= 100 ? 'text-success' : 'text-muted-foreground'}`}>
              {scopedTargetPct}% achieved {scopedTargetPct >= 100 ? '🎯' : ''} · This Month
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
          </Card>
        ))}
      </div>

      {/* Additional insights for admin/lead */}
      {(role === 'admin' || role === 'team_lead') && !selectedSP && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed Visits</p>
                <p className="text-2xl font-bold mt-1 text-destructive">{failedVisits.length}</p>
              </div>
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Order Conversion</p>
                <p className="text-2xl font-bold mt-1">{orderConversionRate}%</p>
              </div>
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expenses (Approved)</p>
                <p className="text-2xl font-bold mt-1 text-success">₹{approvedExpenses.toLocaleString()}</p>
              </div>
              <IndianRupee className="h-5 w-5 text-success" />
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expenses (Pending)</p>
                <p className="text-2xl font-bold mt-1 text-warning">₹{pendingExpenses.toLocaleString()}</p>
              </div>
              <Clock className="h-5 w-5 text-warning" />
            </div>
          </Card>
        </div>
      )}

      {/* Underperformers alert for lead */}
      {(role === 'team_lead' || role === 'admin') && !selectedSP && underperformers.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bell className="h-5 w-5 text-warning" />
              Underperforming Salespersons (This Week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {underperformers.map(sp => (
                <div key={sp.uid} className="flex items-center justify-between p-3 rounded-lg bg-warning/5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center text-sm font-bold text-warning">
                      {sp.name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{sp.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-primary/80">{sp.teamName}</span>
                        {' · '}{sp.weeklyVisits} verified · {sp.failed} failed
                        {sp.achievedPct !== null && ` · ${sp.achievedPct}% target`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedSP(sp.uid)}>
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="text-warning border-warning/30" onClick={() => sendAlert(sp.name)}>
                      <Bell className="h-3.5 w-3.5 mr-1" /> Alert
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month-end target non-achievers */}
      {nonAchievers.length > 0 && !selectedSP && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Target Not Achieved (Month-End)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nonAchievers.map(sp => (
                <div key={sp.uid} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center text-sm font-bold text-destructive">
                      {sp.name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{sp.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-primary/80">{sp.teamName}</span>
                        {' · '}₹{Math.round(sp.achieved).toLocaleString()} of ₹{sp.targetVal.toLocaleString()} ({sp.pct}%)
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedSP(sp.uid)}>
                    View
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Weekly Visit Results</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="verified" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Verified" />
                <Bar dataKey="failed" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {expenseByCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-muted-foreground">No expense data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top performers / team members clickable for lead */}
      {(role === 'admin' || role === 'team_lead') && !selectedSP && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {role === 'team_lead' ? 'Team Members (Click to view individual dashboard)' : 'Top Performers (All Teams)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const spIds = (role === 'team_lead' ? myTeamMemberIds : roles.filter(r => r.role === 'salesperson').map(r => r.user_id));
              const ranked = spIds.map(uid => {
                const uVisits = scopedVisits.filter(v => v.assigned_to === uid && v.visit_status === 'verified');
                const orders = uVisits.filter(v => v.order_received).length;
                const name = profiles.find(p => p.user_id === uid)?.full_name || 'Unknown';
                const target = targets.find(t => t.user_id === uid);
                const achievedPct = target && Number(target.target_value) > 0
                  ? Math.round((Number(target.achieved_value) / Number(target.target_value)) * 100) : null;
                return { uid, name, visits: uVisits.length, orders, achievedPct };
              }).sort((a, b) => b.visits - a.visits).slice(0, 10);

              if (ranked.length === 0) return <p className="text-center text-muted-foreground py-4">No performance data yet.</p>;

              return (
                <div className="space-y-2">
                  {ranked.map((r, i) => (
                    <div
                      key={r.uid}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => setSelectedSP(r.uid)}
                    >
                      <span className="text-lg font-bold w-6">{i + 1}</span>
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {r.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{r.name}</p>
                        {r.achievedPct !== null && (
                          <p className="text-xs text-muted-foreground">Target: {r.achievedPct}%</p>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span className="text-success font-semibold">{r.visits} visits</span>
                        <span className="text-muted-foreground">{r.orders} orders</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Recent verified visits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent Verified Visits</CardTitle>
        </CardHeader>
        <CardContent>
          {verifiedVisits.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No verified visits yet.</p>
          ) : (
            <div className="space-y-3">
              {verifiedVisits.slice(0, 5).map(v => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{v.customer_name}</p>
                      {v.order_received && (
                        <Badge variant="outline" className="bg-success/10 text-success text-xs">Order ✓</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.checked_in_at).toLocaleDateString()} · {v.location_name || v.notes || 'No notes'}
                    </p>
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

export default Dashboard;
