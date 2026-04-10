import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Receipt, Target, Clock, CheckCircle2, XCircle, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['hsl(213, 56%, 24%)', 'hsl(152, 55%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

const Dashboard: React.FC = () => {
  const { user, role } = useAuth();

  const { data: visits = [] } = useQuery({
    queryKey: ['visits', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('visits').select('*').order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: targets = [] } = useQuery({
    queryKey: ['targets', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('targets').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  // Only count verified visits for analytics
  const verifiedVisits = visits.filter(v => v.visit_status === 'verified');
  const failedVisits = visits.filter(v => v.visit_status === 'failed');
  const pendingVisits = visits.filter(v => v.visit_status === 'assigned');
  const ordersReceived = verifiedVisits.filter(v => v.order_received).length;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const currentTarget = targets[0];
  const achievementPct = currentTarget ? Math.round((Number(currentTarget.achieved_value) / Number(currentTarget.target_value)) * 100) : 0;

  const todayVerified = verifiedVisits.filter(v =>
    new Date(v.checked_in_at).toDateString() === new Date().toDateString()
  ).length;

  const stats = [
    { label: 'Verified Visits', value: verifiedVisits.length, icon: CheckCircle2, color: 'text-success' },
    { label: 'Today', value: todayVerified, icon: Clock, color: 'text-accent' },
    { label: 'Orders', value: ordersReceived, icon: Package, color: 'text-primary' },
    { label: 'Pending', value: pendingVisits.length, icon: MapPin, color: 'text-warning' },
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
    expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'admin' ? 'Company overview' : role === 'team_lead' ? 'Team overview' : 'Your performance overview'}
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
