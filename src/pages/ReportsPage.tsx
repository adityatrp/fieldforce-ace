import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Download, FileText, Users, MapPin, Receipt, Target } from 'lucide-react';

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: profiles = [] } = useQuery({
    queryKey: ['report-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['report-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['report-visits'],
    queryFn: async () => {
      const { data } = await supabase.from('visits').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['report-expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: targets = [] } = useQuery({
    queryKey: ['report-targets'],
    queryFn: async () => {
      const { data } = await supabase.from('targets').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const getName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name || 'Unknown';
  const getTeam = (userId: string) => profiles.find(p => p.user_id === userId)?.team_name || 'Unassigned';
  const getRole = (userId: string) => roles.find(r => r.user_id === userId)?.role || 'salesperson';
  const salespersonIds = roles.filter(r => r.role === 'salesperson').map(r => r.user_id);

  const downloadSalespersonPerformance = () => {
    const headers = ['Salesperson', 'Team', 'Total Visits', 'Verified', 'Failed', 'Orders Received', 'Work Hours', 'Target Achievement %'];
    const rows = salespersonIds.map(uid => {
      const uVisits = visits.filter(v => v.assigned_to === uid);
      const verified = uVisits.filter(v => v.visit_status === 'verified');
      const failed = uVisits.filter(v => v.visit_status === 'failed');
      const orders = verified.filter(v => v.order_received).length;
      const workedMs = verified.reduce((sum, v) => {
        if (v.checked_out_at) return sum + (new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime());
        return sum;
      }, 0);
      const target = targets.find(t => t.user_id === uid);
      const pct = target ? Math.round((Number(target.achieved_value) / Number(target.target_value)) * 100) : 0;
      return [getName(uid), getTeam(uid), uVisits.length.toString(), verified.length.toString(), failed.length.toString(), orders.toString(), (Math.round(workedMs / 3600000 * 10) / 10).toString(), pct.toString()];
    });
    downloadCSV(`salesperson_performance_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadTeamSummary = () => {
    const teams = [...new Set(salespersonIds.map(uid => getTeam(uid)))];
    const headers = ['Team', 'Members', 'Total Visits', 'Verified Visits', 'Orders', 'Avg Visits/Person', 'Total Expenses (₹)'];
    const rows = teams.map(team => {
      const members = salespersonIds.filter(uid => getTeam(uid) === team);
      const tVisits = visits.filter(v => members.includes(v.assigned_to || ''));
      const verified = tVisits.filter(v => v.visit_status === 'verified');
      const orders = verified.filter(v => v.order_received).length;
      const teamExpenses = expenses.filter(e => members.includes(e.user_id)).reduce((s, e) => s + Number(e.amount), 0);
      return [team, members.length.toString(), tVisits.length.toString(), verified.length.toString(), orders.toString(), members.length > 0 ? (verified.length / members.length).toFixed(1) : '0', teamExpenses.toLocaleString()];
    });
    downloadCSV(`team_summary_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadVisitsDetail = () => {
    const headers = ['Date', 'Customer', 'Location', 'Assigned To', 'Team', 'Status', 'Order Received', 'Check-in Time', 'Check-out Time', 'Notes'];
    const rows = visits.map(v => [
      new Date(v.created_at).toLocaleDateString(),
      v.customer_name,
      v.location_name || '',
      getName(v.assigned_to || ''),
      getTeam(v.assigned_to || ''),
      v.visit_status,
      v.order_received ? 'Yes' : 'No',
      v.visit_status !== 'assigned' ? new Date(v.checked_in_at).toLocaleString() : '',
      v.checked_out_at ? new Date(v.checked_out_at).toLocaleString() : '',
      v.notes || '',
    ]);
    downloadCSV(`visits_detail_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadExpensesReport = () => {
    const headers = ['Date', 'Salesperson', 'Team', 'Category', 'Amount (₹)', 'Status', 'Notes', 'Validation'];
    const rows = expenses.map(e => [
      new Date(e.created_at).toLocaleDateString(),
      getName(e.user_id),
      getTeam(e.user_id),
      e.category,
      Number(e.amount).toLocaleString(),
      e.approval_status,
      e.notes || '',
      e.validation_result || '',
    ]);
    downloadCSV(`expenses_report_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadAttendanceReport = () => {
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const headers = ['Salesperson', 'Team', 'Days Active (30d)', 'Total Check-ins', 'Avg Check-ins/Day', 'Total Hours Worked'];
    const rows = salespersonIds.map(uid => {
      const uVisits = visits.filter(v => v.assigned_to === uid && v.visit_status === 'verified' && new Date(v.checked_in_at) >= last30);
      const uniqueDays = new Set(uVisits.map(v => new Date(v.checked_in_at).toDateString())).size;
      const totalHours = uVisits.reduce((sum, v) => {
        if (v.checked_out_at) return sum + (new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime()) / 3600000;
        return sum;
      }, 0);
      return [getName(uid), getTeam(uid), uniqueDays.toString(), uVisits.length.toString(), uniqueDays > 0 ? (uVisits.length / uniqueDays).toFixed(1) : '0', totalHours.toFixed(1)];
    });
    downloadCSV(`attendance_report_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const reports = [
    { title: 'Salesperson Performance', description: 'Individual metrics: visits, orders, hours, target achievement', icon: Target, action: downloadSalespersonPerformance },
    { title: 'Team Summary', description: 'Team-level aggregates: members, visits, orders, expenses', icon: Users, action: downloadTeamSummary },
    { title: 'Visits Detail', description: 'All visits with dates, locations, status, and check-in/out times', icon: MapPin, action: downloadVisitsDetail },
    { title: 'Expenses Report', description: 'All expenses with salesperson, category, amounts, and approval status', icon: Receipt, action: downloadExpensesReport },
    { title: 'Attendance Report (30 days)', description: 'Days active, check-ins per day, total hours for last 30 days', icon: FileText, action: downloadAttendanceReport },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">Reports</h1>
        <p className="text-muted-foreground mt-1">Download performance and analytics reports</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map(r => (
          <Card key={r.title} className="field-card hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <r.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                  <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={r.action}>
                    <Download className="h-3.5 w-3.5" /> Download CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ReportsPage;
