import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Plus, AlertTriangle, CheckCircle2, Clock, XCircle, IndianRupee } from 'lucide-react';
import { compressImage } from '@/lib/imageCompress';
import CameraCapture from '@/components/CameraCapture';
import SignedImage from '@/components/SignedImage';

const CATEGORIES = ['Food', 'Travel', 'Accommodation', 'Communication', 'Office Supplies', 'Other'];
const FOOD_LIMIT = 500;

const statusConfig: Record<string, { icon: React.ElementType; className: string }> = {
  pending: { icon: Clock, className: 'bg-warning/10 text-warning border-warning/20' },
  approved: { icon: CheckCircle2, className: 'bg-success/10 text-success border-success/20' },
  rejected: { icon: XCircle, className: 'bg-destructive/10 text-destructive border-destructive/20' },
  flagged: { icon: AlertTriangle, className: 'bg-warning/10 text-warning border-warning/20' },
};

const ExpensesPage: React.FC = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [zoomReceipt, setZoomReceipt] = useState<string | null>(null);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['expense-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name, email');
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['expense-team-members'],
    queryFn: async () => {
      const { data } = await supabase.from('team_members').select('*');
      return data || [];
    },
    enabled: !!user && (role === 'admin' || role === 'team_lead'),
  });

  // Team lead: only see expenses from their team members
  const myTeamMembership = teamMembers.find(tm => tm.user_id === user?.id);
  const myTeamId = myTeamMembership?.team_id;
  const myTeamMemberIds = teamMembers.filter(tm => tm.team_id === myTeamId).map(tm => tm.user_id);

  const visibleExpenses = useMemo(() => {
    if (role === 'admin') return expenses;
    if (role === 'team_lead') {
      return expenses.filter(e => myTeamMemberIds.includes(e.user_id) || e.user_id === user?.id);
    }
    return expenses; // salesperson already filtered by RLS
  }, [expenses, role, myTeamMemberIds, user]);

  const getSubmitterName = (userId: string) => {
    if (userId === user?.id) return 'You';
    const p = profiles.find(p => p.user_id === userId);
    return p?.full_name || p?.email || 'Unknown';
  };

  const getApproverName = (approvedBy: string | null) => {
    if (!approvedBy) return null;
    const p = profiles.find(p => p.user_id === approvedBy);
    return p?.full_name || p?.email || 'Unknown';
  };

  const createExpense = useMutation({
    mutationFn: async () => {
      let receiptUrl = '';
      if (receipt) {
        const compressed = await compressImage(receipt);
        const path = `receipts/${user!.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('photos').upload(path, compressed);
        if (uploadError) {
          throw new Error(`Could not upload receipt: ${uploadError.message}`);
        }
        // Store the storage path; viewers resolve to short-lived signed URLs.
        receiptUrl = path;
      }

      const amt = parseFloat(amount);
      let approvalStatus = 'pending';
      let validationResult = '';

      if (category === 'Food' && amt > FOOD_LIMIT) {
        approvalStatus = 'flagged';
        validationResult = `Food expense ₹${amt} exceeds the daily limit of ₹${FOOD_LIMIT}. This has been flagged for review.`;
      }

      const { error } = await supabase.from('expenses').insert({
        user_id: user!.id, category, amount: amt,
        receipt_photo_url: receiptUrl, approval_status: approvalStatus,
        validation_result: validationResult, notes,
      });
      if (error) throw error;
      return { approvalStatus, validationResult };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      if (result.approvalStatus === 'flagged') {
        toast({ title: 'Expense Flagged', description: result.validationResult });
      } else {
        toast({ title: 'Expense submitted successfully' });
      }
      setOpen(false); setCategory(''); setAmount(''); setNotes(''); setReceipt(null);
    },
    onError: (err: Error) => toast({ title: 'Failed to submit expense', description: err.message, variant: 'destructive' }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('expenses').update({
        approval_status: status,
        approved_by: user!.id,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'Expense status updated successfully' });
    },
    onError: (err: Error) => toast({ title: 'Failed to update expense', description: err.message, variant: 'destructive' }),
  });

  const canApprove = role === 'admin' || role === 'team_lead';

  // Aggregate stats
  const totalApproved = visibleExpenses.filter(e => e.approval_status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
  const totalPending = visibleExpenses.filter(e => e.approval_status === 'pending' || e.approval_status === 'flagged').reduce((s, e) => s + Number(e.amount), 0);
  const totalRejected = visibleExpenses.filter(e => e.approval_status === 'rejected').reduce((s, e) => s + Number(e.amount), 0);
  const totalAll = visibleExpenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Expenses</h1>
          <p className="text-muted-foreground mt-1">
            {canApprove ? 'Review and approve expense reports' : 'Submit and track expense reports'}
          </p>
        </div>
        {role === 'salesperson' && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="h-12 px-6 text-base gap-2">
                <Plus className="h-5 w-5" /> New Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Submit Expense</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  {category === 'Food' && parseFloat(amount) > FOOD_LIMIT && (
                    <p className="text-xs text-warning flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Exceeds ₹{FOOD_LIMIT} — will be flagged for review
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Receipt Photo</Label>
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setCameraOpen(true)}>
                    <Receipt className="h-4 w-4" />
                    {receipt ? '✓ Receipt Captured — Retake' : 'Open Camera'}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">Live camera only. Gallery uploads are disabled.</p>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Description..." rows={2} />
                </div>
                <Button className="w-full h-12 text-base" disabled={!category || !amount || createExpense.isPending} onClick={() => createExpense.mutate()}>
                  {createExpense.isPending ? 'Submitting...' : 'Submit Expense'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Aggregate cards for admin/lead */}
      {canApprove && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="stat-card">
            <div className="text-center">
              <p className="text-xl font-bold">₹{totalAll.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total {role === 'team_lead' ? '(My Team)' : '(All Teams)'}</p>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="text-center">
              <p className="text-xl font-bold text-success">₹{totalApproved.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="text-center">
              <p className="text-xl font-bold text-warning">₹{totalPending.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="text-center">
              <p className="text-xl font-bold text-destructive">₹{totalRejected.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading expenses...</div>
      ) : visibleExpenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No expenses to display.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleExpenses.map(e => {
            const config = statusConfig[e.approval_status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const approverName = getApproverName((e as any).approved_by);
            return (
              <Card key={e.id} className="field-card">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${e.approval_status === 'flagged' ? 'bg-warning/10' : e.approval_status === 'approved' ? 'bg-success/10' : 'bg-muted'}`}>
                    <StatusIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{e.category}</p>
                      <Badge variant="outline" className={config.className}>{e.approval_status}</Badge>
                    </div>
                    <p className="text-lg font-bold">₹{Number(e.amount).toLocaleString()}</p>
                    {canApprove && (
                      <p className="text-xs font-medium text-primary">
                        Submitted by: {getSubmitterName(e.user_id)}
                      </p>
                    )}
                    {canApprove && approverName && (e.approval_status === 'approved' || e.approval_status === 'rejected') && (
                      <p className="text-xs text-muted-foreground">
                        {e.approval_status === 'approved' ? 'Approved' : 'Rejected'} by: {approverName}
                      </p>
                    )}
                    {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
                    {e.validation_result && <p className="text-xs text-warning mt-1">{e.validation_result}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</p>
                    {canApprove && (e.approval_status === 'pending' || e.approval_status === 'flagged') && (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="outline" className="text-success" onClick={() => updateStatus.mutate({ id: e.id, status: 'approved' })}>Approve</Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => updateStatus.mutate({ id: e.id, status: 'rejected' })}>Reject</Button>
                      </div>
                    )}
                  </div>
                  {e.receipt_photo_url ? (
                    <button
                      type="button"
                      onClick={() => setZoomReceipt(e.receipt_photo_url)}
                      className="shrink-0 rounded-lg overflow-hidden border border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label="View receipt"
                    >
                      <SignedImage
                        path={e.receipt_photo_url}
                        alt="Receipt"
                        className="h-16 w-16 object-cover"
                      />
                    </button>
                  ) : (
                    <div className="shrink-0 h-16 w-16 rounded-lg border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">
                      No receipt
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => setReceipt(file)}
        title="Receipt Photo"
      />
    </div>
  );
};

export default ExpensesPage;
