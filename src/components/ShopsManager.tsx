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
import { Upload, Store, MapPin, RefreshCw, Loader2, AlertTriangle, FileSpreadsheet, UserCheck, Search } from 'lucide-react';
import { geocodeAddress, geocodeBatch } from '@/lib/geocode';

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

      // Wipe existing shops for this team
      await supabase.from('shops').update({ active: false }).eq('team_id', teamId);

      setUploadProgress({ done: 0, total: unique.length });

      // Parallel batch geocode (Photon + Nominatim fallback, 6 concurrent)
      const geos = await geocodeBatch(
        unique.map(r => r.address),
        (done, total) => setUploadProgress({ done, total })
      );

      const records = unique.map((r, i) => ({
        team_id: teamId,
        name: r.name,
        address: r.address,
        contact_person: r.contact_person,
        phone: r.phone,
        latitude: geos[i]?.lat ?? null,
        longitude: geos[i]?.lng ?? null,
        geocode_status: geos[i] ? 'ok' : 'failed',
        geocode_error: geos[i] ? '' : 'No match found',
        created_by: user!.id,
      }));

      const errors: string[] = [];
      for (let i = 0; i < records.length; i += 200) {
        const chunk = records.slice(i, i + 200);
        const { error } = await supabase.from('shops').insert(chunk);
        if (error) errors.push(error.message);
      }

      const failed = geos.filter(g => !g).length;
      return { count: unique.length, errors, failed };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shops'] });
      toast({
        title: 'Upload complete',
        description: `${res.count} shop${res.count === 1 ? '' : 's'} processed.${res.failed ? ` ${res.failed} address(es) couldn't be geocoded.` : ''}${res.errors.length ? ' ' + res.errors.length + ' insert error(s).' : ''}`,
      });
      setUploadOpen(false);
      setUploadProgress(null);
    },
    onError: (e: any) => {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
      setUploadProgress(null);
    },
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

  const setAssignment = useMutation({
    mutationFn: async ({ shopId, assignedTo, visitsPerMonth }: { shopId: string; assignedTo: string | null; visitsPerMonth: number | null }) => {
      await supabase.from('shop_assignments').update({ active: false }).eq('shop_id', shopId).eq('active', true);
      if (assignedTo && visitsPerMonth) {
        const { error } = await supabase.from('shop_assignments').insert({
          shop_id: shopId,
          assigned_to: assignedTo,
          visits_per_month: visitsPerMonth,
          assigned_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shop-assignments'] });
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
          return (
            <Card key={shop.id} className="field-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{shop.name}</p>
                      {shop.geocode_status === 'ok' ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px] gap-1">
                          <MapPin className="h-3 w-3" /> Geocoded
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" /> No coords
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
                  <Button size="sm" variant="ghost" disabled={reGeocode.isPending} onClick={() => reGeocode.mutate(shop)} className="shrink-0 h-8 px-2">
                    <RefreshCw className={`h-3.5 w-3.5 ${reGeocode.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Assigned to</Label>
                    <Select
                      value={a?.assigned_to || ''}
                      onValueChange={(v) => setAssignment.mutate({
                        shopId: shop.id,
                        assignedTo: v || null,
                        visitsPerMonth: a?.visits_per_month || 1,
                      })}
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
                      value={String(a?.visits_per_month || '')}
                      onValueChange={(v) => {
                        if (!a?.assigned_to) {
                          toast({ title: 'Select a salesperson first', variant: 'destructive' });
                          return;
                        }
                        setAssignment.mutate({
                          shopId: shop.id,
                          assignedTo: a.assigned_to,
                          visitsPerMonth: parseInt(v, 10),
                        });
                      }}
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

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload shops from Excel</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Required columns: <strong>Shop Name</strong>, <strong>Address</strong>. Optional: Contact Person, Phone.
              <strong>Note:</strong> This will replace all existing shops for this team.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={uploadMutation.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMutation.mutate(f);
              }}
            />
            {uploadProgress && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Geocoding {uploadProgress.done} / {uploadProgress.total}...
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Geocoding takes ~1 second per shop. Don't close this window.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShopsManager;
