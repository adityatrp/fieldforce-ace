import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Download, FileText, Users, MapPin, Receipt, Target, ShoppingCart, Wallet, Activity, FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isLead = role === 'team_lead';

  const { data: profiles = [] } = useQuery({
    queryKey: ['report-profiles'],
    queryFn: async () => (await supabase.from('profiles').select('*')).data || [],
    enabled: !!user,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['report-roles'],
    queryFn: async () => (await supabase.from('user_roles').select('*')).data || [],
    enabled: !!user,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['report-visits'],
    queryFn: async () => (await supabase.from('visits').select('*')).data || [],
    enabled: !!user,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['report-expenses'],
    queryFn: async () => (await supabase.from('expenses').select('*')).data || [],
    enabled: !!user,
  });

  const { data: targets = [] } = useQuery({
    queryKey: ['report-targets'],
    queryFn: async () => (await supabase.from('targets').select('*')).data || [],
    enabled: !!user,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['report-team-members'],
    queryFn: async () => (await supabase.from('team_members').select('*')).data || [],
    enabled: !!user,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['report-teams'],
    queryFn: async () => (await supabase.from('teams').select('*')).data || [],
    enabled: !!user,
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['report-order-items'],
    queryFn: async () => (await supabase.from('visit_order_items').select('*')).data || [],
    enabled: !!user,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['report-products'],
    queryFn: async () => (await supabase.from('products').select('*')).data || [],
    enabled: !!user,
  });

  const { data: dailySummaries = [] } = useQuery({
    queryKey: ['report-daily-summaries'],
    queryFn: async () => (await supabase.from('attendance_daily_summary').select('*').order('work_date', { ascending: false })).data || [],
    enabled: !!user,
  });

  const { data: shops = [] } = useQuery({
    queryKey: ['report-shops'],
    queryFn: async () => (await supabase.from('shops').select('*')).data || [],
    enabled: !!user,
  });

  // Determine the team-lead's own team scope (if applicable)
  const leadTeamIds = useMemo(() => {
    if (!isLead || !user) return [];
    return teamMembers.filter(tm => tm.user_id === user.id).map(tm => tm.team_id);
  }, [isLead, user, teamMembers]);

  const leadTeamName = useMemo(() => {
    if (!isLead) return '';
    return teams.filter(t => leadTeamIds.includes(t.id)).map(t => t.name).join(', ') || 'My Team';
  }, [isLead, teams, leadTeamIds]);

  // Restrict salesperson universe to lead's team if Team Lead
  const allSalespersonIds = roles.filter(r => r.role === 'salesperson').map(r => r.user_id);
  const salespersonIds = useMemo(() => {
    if (!isLead) return allSalespersonIds;
    const teamUserIds = new Set(
      teamMembers.filter(tm => leadTeamIds.includes(tm.team_id)).map(tm => tm.user_id)
    );
    return allSalespersonIds.filter(uid => teamUserIds.has(uid));
  }, [isLead, allSalespersonIds, teamMembers, leadTeamIds]);

  const getName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name || 'Unknown';
  const getTeam = (userId: string) => {
    const m = teamMembers.find(tm => tm.user_id === userId);
    if (!m) return 'Unassigned';
    return teams.find(t => t.id === m.team_id)?.name || 'Unassigned';
  };

  // Scoped datasets
  const scopedVisits = useMemo(
    () => (isLead ? visits.filter(v => v.assigned_to && salespersonIds.includes(v.assigned_to)) : visits),
    [isLead, visits, salespersonIds]
  );
  const scopedExpenses = useMemo(
    () => (isLead ? expenses.filter(e => salespersonIds.includes(e.user_id)) : expenses),
    [isLead, expenses, salespersonIds]
  );
  const scopedSummaries = useMemo(
    () => (isLead ? dailySummaries.filter(s => salespersonIds.includes(s.user_id)) : dailySummaries),
    [isLead, dailySummaries, salespersonIds]
  );
  const scopedShops = useMemo(
    () => (isLead ? shops.filter(s => leadTeamIds.includes(s.team_id)) : shops),
    [isLead, shops, leadTeamIds]
  );

  // ---------- Existing CSV reports (now team-scoped automatically) ----------

  const downloadSalespersonPerformance = () => {
    const headers = ['Salesperson', 'Team', 'Total Visits', 'Verified', 'Failed', 'Orders Approved', 'Orders Pending', 'Work Hours', 'Target Achievement %'];
    const rows = salespersonIds.map(uid => {
      const uVisits = scopedVisits.filter(v => v.assigned_to === uid);
      const verified = uVisits.filter(v => v.visit_status === 'verified');
      const failed = uVisits.filter(v => v.visit_status === 'failed');
      const ordersApproved = verified.filter(v => v.order_received && (((v as any).order_approval_status || 'pending') === 'approved')).length;
      const ordersPending = verified.filter(v => v.order_received && (((v as any).order_approval_status || 'pending') === 'pending')).length;
      const workedMs = verified.reduce((sum, v) => v.checked_out_at ? sum + (new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime()) : sum, 0);
      const target = targets.find(t => t.user_id === uid);
      const pct = target ? Math.round((Number(target.achieved_value) / Number(target.target_value)) * 100) : 0;
      return [getName(uid), getTeam(uid), uVisits.length.toString(), verified.length.toString(), failed.length.toString(), ordersApproved.toString(), ordersPending.toString(), (Math.round(workedMs / 3600000 * 10) / 10).toString(), pct.toString()];
    });
    downloadCSV(`salesperson_performance_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadTeamSummary = () => {
    const teamNames = [...new Set(salespersonIds.map(uid => getTeam(uid)))];
    const headers = ['Team', 'Members', 'Total Visits', 'Verified Visits', 'Orders Approved', 'Orders Pending', 'Avg Visits/Person', 'Total Expenses (₹)'];
    const rows = teamNames.map(team => {
      const members = salespersonIds.filter(uid => getTeam(uid) === team);
      const tVisits = scopedVisits.filter(v => members.includes(v.assigned_to || ''));
      const verified = tVisits.filter(v => v.visit_status === 'verified');
      const ordersApproved = verified.filter(v => v.order_received && (((v as any).order_approval_status || 'pending') === 'approved')).length;
      const ordersPending = verified.filter(v => v.order_received && (((v as any).order_approval_status || 'pending') === 'pending')).length;
      const teamExpenses = scopedExpenses.filter(e => members.includes(e.user_id)).reduce((s, e) => s + Number(e.amount), 0);
      return [team, members.length.toString(), tVisits.length.toString(), verified.length.toString(), ordersApproved.toString(), ordersPending.toString(), members.length > 0 ? (verified.length / members.length).toFixed(1) : '0', teamExpenses.toLocaleString()];
    });
    downloadCSV(`team_summary_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadVisitsDetail = () => {
    const headers = ['Date', 'Customer', 'Location', 'Assigned To', 'Team', 'Status', 'Order Received', 'Order Approval', 'Check-in Time', 'Check-out Time', 'Notes'];
    const rows = scopedVisits.map(v => [
      new Date(v.created_at).toLocaleDateString(),
      v.customer_name,
      v.location_name || '',
      getName(v.assigned_to || ''),
      getTeam(v.assigned_to || ''),
      v.visit_status,
      v.order_received ? 'Yes' : 'No',
      v.order_received ? ((v as any).order_approval_status || 'pending') : '',
      v.visit_status !== 'assigned' ? new Date(v.checked_in_at).toLocaleString() : '',
      v.checked_out_at ? new Date(v.checked_out_at).toLocaleString() : '',
      v.notes || '',
    ]);
    downloadCSV(`visits_detail_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadExpensesReport = () => {
    const headers = ['Date', 'Salesperson', 'Team', 'Category', 'Amount (₹)', 'Status', 'Notes', 'Validation'];
    const rows = scopedExpenses.map(e => [
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
      const uVisits = scopedVisits.filter(v => v.assigned_to === uid && v.visit_status === 'verified' && new Date(v.checked_in_at) >= last30);
      const uniqueDays = new Set(uVisits.map(v => new Date(v.checked_in_at).toDateString())).size;
      const totalHours = uVisits.reduce((sum, v) => v.checked_out_at ? sum + (new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime()) / 3600000 : sum, 0);
      return [getName(uid), getTeam(uid), uniqueDays.toString(), uVisits.length.toString(), uniqueDays > 0 ? (uVisits.length / uniqueDays).toFixed(1) : '0', totalHours.toFixed(1)];
    });
    downloadCSV(`attendance_report_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadSalesOrdersReport = () => {
    const headers = ['Visit Date', 'Team', 'Salesperson', 'Customer', 'Product', 'SKU', 'Quantity', 'Unit Price (₹)', 'Line Total (₹)', 'Order Status', 'Visit Status'];
    const rows: string[][] = [];
    const visitIdSet = new Set(scopedVisits.map(v => v.id));
    orderItems.forEach(oi => {
      if (!visitIdSet.has(oi.visit_id)) return;
      const v = scopedVisits.find(vv => vv.id === oi.visit_id);
      if (!v) return;
      const p = products.find(pp => pp.id === oi.product_id);
      const qty = Number(oi.quantity) || 0;
      const price = Number(oi.price_at_order) || 0;
      rows.push([
        new Date(v.created_at).toLocaleDateString(),
        getTeam(v.assigned_to || ''),
        getName(v.assigned_to || ''),
        v.customer_name,
        p?.name || 'Unknown',
        p?.sku || '',
        qty.toString(),
        price.toLocaleString(),
        (qty * price).toLocaleString(),
        ((v as any).order_approval_status || 'pending'),
        v.visit_status,
      ]);
    });
    rows.sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]));
    downloadCSV(`sales_orders_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadTeamExpensesReport = () => {
    const headers = ['Team', 'Members', 'Total Claims', 'Approved (₹)', 'Pending (₹)', 'Rejected (₹)', 'Total (₹)'];
    const teamNames = [...new Set(salespersonIds.map(uid => getTeam(uid)))];
    const rows = teamNames.map(team => {
      const members = salespersonIds.filter(uid => getTeam(uid) === team);
      const tExp = scopedExpenses.filter(e => members.includes(e.user_id));
      const sumBy = (status: string) => tExp.filter(e => e.approval_status === status).reduce((s, e) => s + Number(e.amount), 0);
      const approved = sumBy('approved');
      const pending = sumBy('pending');
      const rejected = sumBy('rejected');
      return [team, members.length.toString(), tExp.length.toString(), approved.toLocaleString(), pending.toLocaleString(), rejected.toLocaleString(), (approved + pending + rejected).toLocaleString()];
    });
    downloadCSV(`team_expenses_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  const downloadDailyTrackingReport = () => {
    const headers = ['Date', 'Salesperson', 'Team', 'Punch In', 'Punch Out', 'Total Distance (km)', 'Idle Time (min)', 'Active Visit Time (min)', 'Ping Count'];
    const rows = scopedSummaries.map(s => [
      s.work_date,
      getName(s.user_id),
      getTeam(s.user_id),
      s.punched_in_at ? new Date(s.punched_in_at).toLocaleTimeString() : '',
      s.punched_out_at ? new Date(s.punched_out_at).toLocaleTimeString() : '',
      Number(s.total_distance_km).toFixed(2),
      String(s.total_idle_minutes ?? 0),
      String(s.total_active_visit_minutes ?? 0),
      String(s.ping_count ?? 0),
    ]);
    downloadCSV(`daily_tracking_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast({ title: 'Report downloaded' });
  };

  // ---------- Consolidated MIS Report (multi-sheet XLSX) ----------

  const downloadMISReport = () => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const teamNames = [...new Set(salespersonIds.map(uid => getTeam(uid)))].sort();

    // Sheet 1: Cover / Summary
    const totalVisits = scopedVisits.length;
    const totalVerified = scopedVisits.filter(v => v.visit_status === 'verified').length;
    const totalFailed = scopedVisits.filter(v => v.visit_status === 'failed').length;
    const totalAssigned = scopedVisits.filter(v => v.visit_status === 'assigned').length;
    const totalExpenseAmt = scopedExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalApprovedExp = scopedExpenses.filter(e => e.approval_status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
    const totalOrders = scopedVisits.filter(v => v.order_received).length;
    const totalApprovedOrders = scopedVisits.filter(v => v.order_received && ((v as any).order_approval_status === 'approved')).length;

    const cover = [
      ['MIS Report'],
      ['Scope', isLead ? `Team Lead — ${leadTeamName}` : 'All Teams (Admin)'],
      ['Generated By', getName(user!.id)],
      ['Generated On', today.toLocaleString()],
      [],
      ['Headline Metrics'],
      ['Teams Covered', teamNames.length],
      ['Salespersons', salespersonIds.length],
      ['Total Shops', scopedShops.length],
      ['Total Visits (All Time)', totalVisits],
      ['Verified Visits', totalVerified],
      ['Failed Visits', totalFailed],
      ['Pending / Assigned Visits', totalAssigned],
      ['Visits with Order', totalOrders],
      ['Orders Approved', totalApprovedOrders],
      ['Total Expense Claims (₹)', totalExpenseAmt.toLocaleString()],
      ['Approved Expenses (₹)', totalApprovedExp.toLocaleString()],
    ];

    // Sheet 2: Team Summary
    const teamSummary = [
      ['Team', 'Members', 'Total Visits', 'Verified', 'Failed', 'Visits with Order', 'Orders Approved', 'Total Expenses (₹)', 'Approved Expenses (₹)'],
      ...teamNames.map(team => {
        const members = salespersonIds.filter(uid => getTeam(uid) === team);
        const tv = scopedVisits.filter(v => members.includes(v.assigned_to || ''));
        const verified = tv.filter(v => v.visit_status === 'verified').length;
        const failed = tv.filter(v => v.visit_status === 'failed').length;
        const orders = tv.filter(v => v.order_received).length;
        const approvedOrders = tv.filter(v => v.order_received && ((v as any).order_approval_status === 'approved')).length;
        const exp = scopedExpenses.filter(e => members.includes(e.user_id));
        const expTotal = exp.reduce((s, e) => s + Number(e.amount), 0);
        const expApproved = exp.filter(e => e.approval_status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
        return [team, members.length, tv.length, verified, failed, orders, approvedOrders, expTotal, expApproved];
      }),
    ];

    // Sheet 3: Salesperson Performance
    const salesPerf = [
      ['Salesperson', 'Team', 'Total Visits', 'Verified', 'Failed', 'Orders', 'Orders Approved', 'Work Hours', 'Target', 'Achieved', 'Target %'],
      ...salespersonIds.map(uid => {
        const uv = scopedVisits.filter(v => v.assigned_to === uid);
        const verified = uv.filter(v => v.visit_status === 'verified');
        const failed = uv.filter(v => v.visit_status === 'failed').length;
        const orders = uv.filter(v => v.order_received).length;
        const approvedOrders = uv.filter(v => v.order_received && ((v as any).order_approval_status === 'approved')).length;
        const workHrs = verified.reduce((s, v) => v.checked_out_at ? s + (new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime()) / 3600000 : s, 0);
        const target = targets.find(t => t.user_id === uid);
        const tgt = target ? Number(target.target_value) : 0;
        const ach = target ? Number(target.achieved_value) : 0;
        const pct = tgt > 0 ? Math.round((ach / tgt) * 100) : 0;
        return [getName(uid), getTeam(uid), uv.length, verified.length, failed, orders, approvedOrders, Number(workHrs.toFixed(1)), tgt, ach, pct];
      }),
    ];

    // Sheet 4: Visits Detail
    const visitsSheet = [
      ['Date', 'Customer', 'Location', 'Salesperson', 'Team', 'Status', 'Order Received', 'Order Approval', 'Check-in', 'Check-out', 'Notes'],
      ...scopedVisits
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(v => [
          new Date(v.created_at).toLocaleDateString(),
          v.customer_name,
          v.location_name || '',
          getName(v.assigned_to || ''),
          getTeam(v.assigned_to || ''),
          v.visit_status,
          v.order_received ? 'Yes' : 'No',
          v.order_received ? ((v as any).order_approval_status || 'pending') : '',
          v.visit_status !== 'assigned' ? new Date(v.checked_in_at).toLocaleString() : '',
          v.checked_out_at ? new Date(v.checked_out_at).toLocaleString() : '',
          v.notes || '',
        ]),
    ];

    // Sheet 5: Sales Orders (line items)
    const visitIdSet = new Set(scopedVisits.map(v => v.id));
    const orderRows: any[][] = [];
    orderItems.forEach(oi => {
      if (!visitIdSet.has(oi.visit_id)) return;
      const v = scopedVisits.find(vv => vv.id === oi.visit_id);
      if (!v) return;
      const p = products.find(pp => pp.id === oi.product_id);
      const qty = Number(oi.quantity) || 0;
      const price = Number(oi.price_at_order) || 0;
      orderRows.push([
        new Date(v.created_at).toLocaleDateString(),
        getTeam(v.assigned_to || ''),
        getName(v.assigned_to || ''),
        v.customer_name,
        p?.name || 'Unknown',
        p?.sku || '',
        qty,
        price,
        qty * price,
        ((v as any).order_approval_status || 'pending'),
        v.visit_status,
      ]);
    });
    orderRows.sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]));
    const ordersSheet = [
      ['Visit Date', 'Team', 'Salesperson', 'Customer', 'Product', 'SKU', 'Quantity', 'Unit Price (₹)', 'Line Total (₹)', 'Order Status', 'Visit Status'],
      ...orderRows,
    ];

    // Sheet 6: Expenses
    const expensesSheet = [
      ['Date', 'Salesperson', 'Team', 'Category', 'Amount (₹)', 'Status', 'Notes', 'Validation'],
      ...scopedExpenses.map(e => [
        new Date(e.created_at).toLocaleDateString(),
        getName(e.user_id),
        getTeam(e.user_id),
        e.category,
        Number(e.amount),
        e.approval_status,
        e.notes || '',
        e.validation_result || '',
      ]),
    ];

    // Sheet 7: Attendance / Daily Tracking
    const attendanceSheet = [
      ['Date', 'Salesperson', 'Team', 'Punch In', 'Punch Out', 'Distance (km)', 'Idle (min)', 'Active Visit (min)', 'Pings'],
      ...scopedSummaries.map(s => [
        s.work_date,
        getName(s.user_id),
        getTeam(s.user_id),
        s.punched_in_at ? new Date(s.punched_in_at).toLocaleTimeString() : '',
        s.punched_out_at ? new Date(s.punched_out_at).toLocaleTimeString() : '',
        Number(Number(s.total_distance_km).toFixed(2)),
        s.total_idle_minutes ?? 0,
        s.total_active_visit_minutes ?? 0,
        s.ping_count ?? 0,
      ]),
    ];

    // Sheet 8: Shops
    const shopsSheet = [
      ['Shop', 'Team', 'Address', 'Contact', 'Phone', 'Geocode Status', 'Active'],
      ...scopedShops.map(s => [
        s.name,
        teams.find(t => t.id === s.team_id)?.name || '',
        s.address,
        s.contact_person || '',
        s.phone || '',
        s.geocode_status,
        s.active ? 'Yes' : 'No',
      ]),
    ];

    // Sheet 9: Month-to-Date snapshot
    const mtdVisits = scopedVisits.filter(v => new Date(v.created_at) >= monthStart);
    const mtdExp = scopedExpenses.filter(e => new Date(e.created_at) >= monthStart);
    const mtdSheet = [
      ['Month-to-Date Snapshot', `From ${monthStart.toLocaleDateString()} to ${today.toLocaleDateString()}`],
      [],
      ['Salesperson', 'Team', 'MTD Visits', 'Verified', 'Failed', 'MTD Orders', 'MTD Expenses (₹)'],
      ...salespersonIds.map(uid => {
        const uv = mtdVisits.filter(v => v.assigned_to === uid);
        const verified = uv.filter(v => v.visit_status === 'verified').length;
        const failed = uv.filter(v => v.visit_status === 'failed').length;
        const orders = uv.filter(v => v.order_received).length;
        const exp = mtdExp.filter(e => e.user_id === uid).reduce((s, e) => s + Number(e.amount), 0);
        return [getName(uid), getTeam(uid), uv.length, verified, failed, orders, exp];
      }),
    ];

    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, data: any[][]) => {
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };
    addSheet('Summary', cover);
    addSheet('Team Summary', teamSummary);
    addSheet('Salesperson Performance', salesPerf);
    addSheet('Month-to-Date', mtdSheet);
    addSheet('Visits Detail', visitsSheet);
    addSheet('Sales Orders', ordersSheet);
    addSheet('Expenses', expensesSheet);
    addSheet('Attendance', attendanceSheet);
    addSheet('Shops', shopsSheet);

    const dateTag = today.toISOString().split('T')[0];
    const scopeTag = isLead ? leadTeamName.replace(/[^a-z0-9]+/gi, '_') : 'All_Teams';
    XLSX.writeFile(wb, `MIS_Report_${scopeTag}_${dateTag}.xlsx`);
    toast({ title: 'MIS report downloaded' });
  };

  const reports = [
    { title: 'Salesperson Performance', description: 'Individual metrics: visits, orders, hours, target achievement', icon: Target, action: downloadSalespersonPerformance },
    { title: 'Team Summary', description: 'Team-level aggregates: members, visits, orders, expenses', icon: Users, action: downloadTeamSummary },
    { title: 'Sales Orders (Team & Salesman)', description: 'Line-item orders grouped by team and salesperson with totals', icon: ShoppingCart, action: downloadSalesOrdersReport },
    { title: 'Team Expenses', description: 'Team-wise expense totals split by approved, pending, and rejected', icon: Wallet, action: downloadTeamExpensesReport },
    { title: 'Daily Tracking (Per Salesperson)', description: 'Daily distance, idle time, and punch in/out times', icon: Activity, action: downloadDailyTrackingReport },
    { title: 'Visits Detail', description: 'All visits with dates, locations, status, and check-in/out times', icon: MapPin, action: downloadVisitsDetail },
    { title: 'Expenses Report', description: 'All expenses with salesperson, category, amounts, and approval status', icon: Receipt, action: downloadExpensesReport },
    { title: 'Attendance Report (30 days)', description: 'Days active, check-ins per day, total hours for last 30 days', icon: FileText, action: downloadAttendanceReport },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">Reports</h1>
        <p className="text-muted-foreground mt-1">
          {isLead
            ? `Download reports for your team — ${leadTeamName}`
            : 'Download performance and analytics reports across all teams'}
        </p>
      </div>

      {/* Featured: Consolidated MIS Report */}
      <Card className="field-card border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-base">MIS Report</p>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  {isLead ? 'Team-wise' : 'All Teams Combined'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Consolidated multi-sheet workbook: summary, team aggregates, salesperson performance,
                month-to-date, visits, orders, expenses, attendance, and shops.
              </p>
              <Button size="sm" className="mt-3 gap-2" onClick={downloadMISReport}>
                <Download className="h-3.5 w-3.5" /> Download MIS (.xlsx)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Individual reports
        </h2>
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
    </div>
  );
};

export default ReportsPage;
