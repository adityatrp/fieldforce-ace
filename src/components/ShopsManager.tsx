import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Store, MapPin, RefreshCw, Loader2, AlertTriangle, FileSpreadsheet, UserCheck, Search, Save, Trash2 } from 'lucide-react';
import { geocodeAddress, geocodeBatch } from '@/lib/geocode';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Shop = {
  id: string;
  team_id: string;
  name: string;
  address: string;
  contact_person: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string;
  geocode_error: string;
  active: boolean;
};

type Assignment = {
  id: string;
  shop_id: string;
  assigned_to: string;
  visits_per_month: number;
  active: boolean;
};

type AssignmentDraft = {
  assignedTo: string;
  visitsPerMonth: number;
};

interface Props {
  teamId: string | null | undefined;
  salespersons: Array<{ user_id: string; full_name: string; email: string }>;
}

const SAMPLE_ROW = [['Shop Name', 'Address', 'Contact Person', 'Phone']];

const ShopsManager: React.FC<Props> = ({ teamId, salespersons }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [uploadAssignTo, setUploadAssignTo] = useState<string>('');
  const [uploadVisitsPerMonth, setUploadVisitsPerMonth] = useState<number>(1);
  const [pendingDelete, setPendingDelete] = useState<Shop | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: shops = [] } = useQuery({
    queryKey: ['shops', teamId],
    queryFn: async () => {
      const q = supabase.from('shops').select('*').eq('active', true).order('name');
      const { data } = teamId ? await q.eq('team_id', teamId) : await q;
      return (data || []) as Shop[];
    },
    enabled: !!teamId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['shop-assignments', teamId],
    queryFn: async () => {
      const ids = shops.map(s => s.id);
      if (ids.length === 0) return [] as Assignment[];
      const { data } = await supabase
        .from('shop_assignments')
        .select('*')
        .in('shop_id', ids)
        .eq('active', true);
      return (data || []) as Assignment[];
    },
    enabled: shops.length > 0,
  });

  const assignmentByShop = useMemo(() => {
    const m = new Map<string, Assignment>();
    assignments.forEach(a => m.set(a.shop_id, a));
    return m;
  }, [assignments]);

  const filteredShops = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.contact_person.toLowerCase().includes(q)
    );
  }, [shops, search]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ...SAMPLE_ROW,
      ['Acme Hardware', '12 MG Road, Bengaluru', 'Ravi Kumar', '+91 98xxxxxx00'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shops');
    XLSX.writeFile(wb, 'shops_template.xlsx');
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!teamId) throw new Error('No team selected.');
      if (!uploadAssignTo) throw new Error('Please select a salesperson.');
      if (!uploadVisitsPerMonth || uploadVisitsPerMonth < 1 || uploadVisitsPerMonth > 5) {
        throw new Error('Please select a valid visit frequency.');
      }

      // ---- File checks ----
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
      const allowedExt = ['.xlsx', '.xls', '.csv'];
      const lname = file.name.toLowerCase();
      if (!allowedExt.some(ext => lname.endsWith(ext))) {
        throw new Error('Unsupported file type. Use .xlsx, .xls or .csv');
      }
      if (file.size > MAX_SIZE) {
        throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      }
      if (file.size === 0) throw new Error('File is empty.');

      const buf = await file.arrayBuffer();
      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(buf, { type: 'array' });
      } catch {
        throw new Error('Could not read file. Make sure it is a valid Excel/CSV.');
      }
      if (!wb.SheetNames.length) throw new Error('Workbook has no sheets.');
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      if (rows.length > 2000) throw new Error('Too many rows (max 2000 per upload).');

      const normalize = (r: Record<string, any>) => {
        const lc: Record<string, any> = {};
        Object.entries(r).forEach(([k, v]) => { lc[k.trim().toLowerCase()] = v; });
        return {
          name: String(lc['shop name'] || lc['name'] || '').trim(),
          address: String(lc['address'] || lc['pin point address'] || '').trim(),
          contact_person: String(lc['contact person'] || lc['contact'] || '').trim(),
          phone: String(lc['phone'] || lc['phone number'] || lc['mobile'] || '').trim(),
        };
      };

      const cleaned = rows.map(normalize).filter(r => r.name && r.address);
      if (cleaned.length === 0) throw new Error('No valid rows. Need columns: Shop Name, Address.');

      // De-duplicate by name (case-insensitive) within the file
      const seen = new Set<string>();
      const unique = cleaned.filter(r => {
        const k = r.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Skip shops that already exist for this team (case-insensitive name match)
      const existingNames = new Set(shops.map(s => s.name.trim().toLowerCase()));
      const toInsert = unique.filter(r => !existingNames.has(r.name.toLowerCase()));
      const skipped = unique.length - toInsert.length;

      if (toInsert.length === 0) {
        return { attempted: unique.length, inserted: 0, assigned: 0, skipped, errors: [] as string[] };
      }

      setUploadProgress({ done: toInsert.length, total: toInsert.length });

      const records = toInsert.map((r) => ({
        team_id: teamId,
        name: r.name,
        address: r.address,
        contact_person: r.contact_person,
        phone: r.phone,
        latitude: null,
        longitude: null,
        geocode_status: 'pending',
        geocode_error: '',
        created_by: user!.id,
      }));

      const errors: string[] = [];
      const insertedIds: string[] = [];
      for (let i = 0; i < records.length; i += 200) {
        const chunk = records.slice(i, i + 200);
        const { data, error } = await supabase.from('shops').insert(chunk).select('id');
        if (error) errors.push(error.message);
        if (data) insertedIds.push(...data.map(d => d.id));
      }

      if (insertedIds.length === 0) {
        throw new Error(
          errors[0] ||
          'No shops were saved. You may not have permission to add shops to this team.'
        );
      }

      // Assign all newly inserted shops to selected salesperson
      const assignRows = insertedIds.map(shop_id => ({
        shop_id,
        assigned_to: uploadAssignTo,
        assigned_by: user!.id,
        visits_per_month: uploadVisitsPerMonth,
        active: true,
      }));
      let assigned = 0;
      for (let i = 0; i < assignRows.length; i += 200) {
        const chunk = assignRows.slice(i, i + 200);
        const { data, error } = await supabase.from('shop_assignments').insert(chunk).select('id');
        if (error) errors.push(error.message);
        assigned += data?.length ?? 0;
      }

      return { attempted: unique.length, inserted: insertedIds.length, assigned, skipped, errors };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shops'] });
      qc.invalidateQueries({ queryKey: ['shop-assignments'] });
      qc.invalidateQueries({ queryKey: ['my-shop-assignments'] });
      const partial = res.inserted < (res.attempted - res.skipped);
      toast({
        title: res.inserted === 0 ? 'No new shops to add' : (partial ? 'Upload partially complete' : 'Upload complete'),
        description:
          `${res.inserted} new shop${res.inserted === 1 ? '' : 's'} added & assigned` +
          (res.skipped ? ` · ${res.skipped} already existed (skipped)` : '') +
          (res.errors.length ? ` · Errors: ${res.errors.slice(0, 2).join('; ')}` : ''),
        variant: partial ? 'destructive' : 'default',
      });
      setUploadOpen(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (e: any) => {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const deleteShop = useMutation({
    mutationFn: async (shop: Shop) => {
      // Soft-delete: deactivate shop + its active assignments. Preserves visit history.
      const { error: aErr } = await supabase
        .from('shop_assignments')
        .update({ active: false })
        .eq('shop_id', shop.id)
        .eq('active', true);
      if (aErr) throw aErr;
      const { error } = await supabase
        .from('shops')
        .update({ active: false })
        .eq('id', shop.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shops'] });
      qc.invalidateQueries({ queryKey: ['shop-assignments'] });
      qc.invalidateQueries({ queryKey: ['my-shop-assignments'] });
      toast({ title: 'Shop deleted' });
      setPendingDelete(null);
    },
    onError: (e: any) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const reGeocode = useMutation({
    mutationFn: async (shop: Shop) => {
      const geo = await geocodeAddress(shop.address);
      await supabase.from('shops').update({
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
        geocode_status: geo ? 'ok' : 'failed',
        geocode_error: geo ? '' : 'No match found',
      }).eq('id', shop.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shops'] });
      toast({ title: 'Coordinates updated' });
    },
  });

  const updateDraft = (shopId: string, current: Assignment | undefined, patch: Partial<AssignmentDraft>) => {
    setDrafts(prev => ({
      ...prev,
      [shopId]: {
        assignedTo: patch.assignedTo ?? prev[shopId]?.assignedTo ?? current?.assigned_to ?? '',
        visitsPerMonth: patch.visitsPerMonth ?? prev[shopId]?.visitsPerMonth ?? current?.visits_per_month ?? 1,
      },
    }));
  };

  const saveAssignment = useMutation({
    mutationFn: async ({ shopId, assignmentId, assignedTo, visitsPerMonth }: { shopId: string; assignmentId?: string; assignedTo: string; visitsPerMonth: number }) => {
      if (!assignedTo) throw new Error('Please select a salesperson.');
      if (!visitsPerMonth || visitsPerMonth < 1 || visitsPerMonth > 5) throw new Error('Please select a valid visit frequency.');

      const payload = {
        assigned_to: assignedTo,
        visits_per_month: visitsPerMonth,
        assigned_by: user!.id,
        active: true,
      };

      const result = assignmentId
        ? await supabase.from('shop_assignments').update(payload).eq('id', assignmentId).select('id').maybeSingle()
        : await supabase.from('shop_assignments').insert({ shop_id: shopId, ...payload }).select('id').maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('Assignment was not saved. Please check your team permissions.');
      return { shopId };
    },
    onSuccess: ({ shopId }) => {
      setDrafts(prev => {
        const next = { ...prev };
        delete next[shopId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['shop-assignments'] });
      qc.invalidateQueries({ queryKey: ['my-shop-assignments'] });
      qc.invalidateQueries({ queryKey: ['visits'] });
      toast({ title: 'Assignment updated' });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  if (!teamId) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        Select a team to manage shops.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Upload Shops (Excel)
        </Button>
        <Button variant="outline" onClick={downloadTemplate} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Template
        </Button>
        <div className="flex-1 min-w-[180px] relative">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shops..." className="pl-8" />
        </div>
        <Badge variant="outline">{shops.length} shop{shops.length === 1 ? '' : 's'}</Badge>
      </div>

      {filteredShops.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Store className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No shops yet. Upload an Excel file to get started.</p>
        </CardContent></Card>
      ) : (
        filteredShops.map(shop => {
          const a = assignmentByShop.get(shop.id);
          const draft = drafts[shop.id];
          const selectedAssignedTo = draft?.assignedTo ?? a?.assigned_to ?? '';
          const selectedVisitsPerMonth = draft?.visitsPerMonth ?? a?.visits_per_month ?? null;
          const hasChanges = !!draft && (
            selectedAssignedTo !== (a?.assigned_to ?? '') ||
            selectedVisitsPerMonth !== (a?.visits_per_month ?? null)
          );
          return (
            <Card key={shop.id} className="field-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{shop.name}</p>
                      {shop.latitude != null && shop.longitude != null ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px] gap-1">
                          <MapPin className="h-3 w-3" /> Pinned
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-muted text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" /> Awaiting first visit
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{shop.address}</p>
                    {(shop.contact_person || shop.phone) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {shop.contact_person}{shop.contact_person && shop.phone ? ' · ' : ''}{shop.phone}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="ghost" disabled={reGeocode.isPending} onClick={() => reGeocode.mutate(shop)} className="h-8 px-2">
                      <RefreshCw className={`h-3.5 w-3.5 ${reGeocode.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPendingDelete(shop)} className="h-8 px-2 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Assigned to</Label>
                    <Select
                      value={selectedAssignedTo}
                      onValueChange={(v) => updateDraft(shop.id, a, { assignedTo: v })}
                    >
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        {salespersons.map(sp => (
                          <SelectItem key={sp.user_id} value={sp.user_id}>
                            {sp.full_name || sp.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Visits / month</Label>
                    <Select
                      value={selectedVisitsPerMonth ? String(selectedVisitsPerMonth) : ''}
                      onValueChange={(v) => updateDraft(shop.id, a, { visitsPerMonth: parseInt(v, 10) })}
                    >
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}× / month</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  size="sm"
                  className="w-full gap-2"
                  disabled={!hasChanges || !selectedAssignedTo || !selectedVisitsPerMonth || saveAssignment.isPending}
                  onClick={() => saveAssignment.mutate({
                    shopId: shop.id,
                    assignmentId: a?.id,
                    assignedTo: selectedAssignedTo,
                    visitsPerMonth: selectedVisitsPerMonth || 1,
                  })}
                >
                  {saveAssignment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>

                {a?.assigned_to && (
                  <div className="flex items-center gap-1.5 text-xs text-success">
                    <UserCheck className="h-3.5 w-3.5" />
                    Assigned to <strong>{salespersons.find(s => s.user_id === a.assigned_to)?.full_name || 'unknown'}</strong> · {a.visits_per_month}×/month
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o && fileInputRef.current) fileInputRef.current.value = ''; }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload shops from Excel</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Required columns: <strong>Shop Name</strong>, <strong>Address</strong>. Optional: Contact Person, Phone.
              All shops in the file will be assigned to the salesperson below. Existing shops (matched by name) are kept as-is and skipped — nothing is overwritten.
            </p>

            <div className="space-y-1">
              <Label className="text-xs">Assign to salesperson</Label>
              <Select value={uploadAssignTo} onValueChange={setUploadAssignTo}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select salesperson" /></SelectTrigger>
                <SelectContent>
                  {salespersons.map(sp => (
                    <SelectItem key={sp.user_id} value={sp.user_id}>
                      {sp.full_name || sp.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Visit frequency</Label>
              <Select value={String(uploadVisitsPerMonth)} onValueChange={(v) => setUploadVisitsPerMonth(parseInt(v, 10))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}× / month</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Shops file</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={uploadMutation.isPending || !uploadAssignTo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMutation.mutate(f);
                }}
              />
              {!uploadAssignTo && (
                <p className="text-[11px] text-muted-foreground">Select a salesperson first to enable upload.</p>
              )}
            </div>

            {uploadProgress && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving {uploadProgress.done} / {uploadProgress.total}...
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Max 5 MB · up to 2000 rows. Coordinates are captured on the salesperson's first verified visit.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shop?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingDelete?.name}</strong> will be removed from the shop list and any active assignment will be cancelled. Past visit history is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteShop.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteShop.isPending}
              onClick={(e) => { e.preventDefault(); if (pendingDelete) deleteShop.mutate(pendingDelete); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteShop.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ShopsManager;
