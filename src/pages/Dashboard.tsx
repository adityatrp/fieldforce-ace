import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Receipt, Target, Clock, CheckCircle2, XCircle, Package, Users, TrendingUp, IndianRupee } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['hsl(213, 56%, 24%)', 'hsl(152, 55%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

const Dashboard: React.FC = () => {
  const { user, role } = useAuth();

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
    enabled: !!user && role === 'admin',
  });

  // Team lead scope
  const myTeamMembership = teamMembers.find(tm => tm.user_id === user?.id);
  const myTeamId = myTeamMembership?.team_id;
  const myTeamMemberIds = teamMembers.filter(tm => tm.team_id === myTeamId).map(tm => tm.user_id);

  // Scoped data based on role
  const scopedVisits = useMemo(() => {
    if (role === 'salesperson') return visits.filter(v => v.assigned_to === user?.id);
    if (role === 'team_lead') return visits.filter(v => myTeamMemberIds.includes(v.assigned_to || ''));
    return visits; // admin sees all
  }, [visits, role, user, myTeamMemberIds]);

  const scopedExpenses = useMemo(() => {
    if (role === 'salesperson') return expenses.filter(e => e.user_id === user?.id);
    if (role === 'team_lead') return expenses.filter(e => myTeamMemberIds.includes(e.user_id));
    return expenses;
  }, [expenses, role, user, myTeamMemberIds]);

  const verifiedVisits = scopedVisits.filter(v => v.visit_status === 'verified');
  const failedVisits = scopedVisits.filter(v => v.visit_status === 'failed');
  const pendingVisits = scopedVisits.filter(v => v.visit_status === 'assigned');
  const ordersReceived = verifiedVisits.filter(v => v.order_received).length;
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

  const stats = role === 'salesperson' ? [
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'admin' ? 'All teams combined overview' : role === 'team_lead' ? 'Your team\'s performance overview' : 'Your performance overview'}
        </p>
      </div>

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
      {(role === 'admin' || role === 'team_lead') && (
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

      {/* Top performers for admin/lead */}
      {(role === 'admin' || role === 'team_lead') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Top Performers {role === 'team_lead' ? '(Your Team)' : '(All Teams)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const spIds = (role === 'team_lead' ? myTeamMemberIds : roles.filter(r => r.role === 'salesperson').map(r => r.user_id));
              const ranked = spIds.map(uid => {
                const uVisits = scopedVisits.filter(v => v.assigned_to === uid && v.visit_status === 'verified');
                const orders = uVisits.filter(v => v.order_received).length;
                const name = profiles.find(p => p.user_id === uid)?.full_name || 'Unknown';
                return { uid, name, visits: uVisits.length, orders };
              }).sort((a, b) => b.visits - a.visits).slice(0, 5);

              if (ranked.length === 0) return <p className="text-center text-muted-foreground py-4">No performance data yet.</p>;

              return (
                <div className="space-y-2">
                  {ranked.map((r, i) => (
                    <div key={r.uid} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <span className="text-lg font-bold w-6">{i + 1}</span>
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {r.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{r.name}</p>
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
