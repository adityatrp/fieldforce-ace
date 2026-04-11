import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Users, MapPin, Plus, Navigation, Search, Pencil, Eye, Package, UserPlus, Trash2, ShieldCheck, ArrowRightLeft } from 'lucide-react';

const TeamPage: React.FC = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Visit form state
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editVisitId, setEditVisitId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [targetLat, setTargetLat] = useState('');
  const [targetLng, setTargetLng] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  // View visit details
  const [viewDialog, setViewDialog] = useState<string | null>(null);

  // Product form
  const [productOpen, setProductOpen] = useState(false);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('pcs');
  const [productPrice, setProductPrice] = useState('');

  // Create user form
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');

  // Admin: team management
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeadId, setNewTeamLeadId] = useState('');

  // Admin: shift salesperson
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftUserId, setShiftUserId] = useState('');
  const [shiftTeamId, setShiftTeamId] = useState('');

  // Admin: promote to lead
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteUserId, setPromoteUserId] = useState('');

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['all-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['team-visits'],
    queryFn: async () => {
      const { data } = await supabase.from('visits').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data } = await supabase.from('team_members').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  // View visit order items
  const { data: visitOrderItems = [] } = useQuery({
    queryKey: ['visit-order-items-team', viewDialog],
    queryFn: async () => {
      if (!viewDialog) return [];
      const { data } = await supabase.from('visit_order_items').select('*, products(name, unit)').eq('visit_id', viewDialog);
      return data || [];
    },
    enabled: !!viewDialog,
  });

  const salespersons = profiles.filter(p => {
    const r = roles.find(r => r.user_id === p.user_id);
    return r?.role === 'salesperson';
  });

  const geocodeAddress = async () => {
    if (!address.trim()) {
      toast({ title: 'Enter an address first', variant: 'destructive' });
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      const results = await res.json();
      if (results.length > 0) {
        setTargetLat(parseFloat(results[0].lat).toFixed(6));
        setTargetLng(parseFloat(results[0].lon).toFixed(6));
        setLocationName(results[0].display_name?.split(',').slice(0, 3).join(',') || address);
        toast({ title: '📍 Location found', description: results[0].display_name?.split(',').slice(0, 2).join(',') });
      } else {
        toast({ title: 'Address not found', description: 'Try a more specific address.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Geocoding failed', variant: 'destructive' });
    } finally {
      setGeocoding(false);
    }
  };

  const resetForm = () => {
    setCustomerName(''); setLocationName(''); setAddress('');
    setTargetLat(''); setTargetLng(''); setAssignedTo('');
    setNotes(''); setEditVisitId(null);
  };

  const assignVisitMutation = useMutation({
    mutationFn: async () => {
      const lat = parseFloat(targetLat);
      const lng = parseFloat(targetLng);
      if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid coordinates');
      const { error } = await supabase.from('visits').insert({
        customer_name: customerName, location_name: locationName,
        target_latitude: lat, target_longitude: lng,
        assigned_to: assignedTo, assigned_by: user!.id,
        user_id: user!.id, visit_status: 'assigned', notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-visits'] });
      toast({ title: 'Visit Assigned' });
      setOpen(false); resetForm();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const editVisitMutation = useMutation({
    mutationFn: async () => {
      if (!editVisitId) throw new Error('No visit selected');
      const lat = parseFloat(targetLat);
      const lng = parseFloat(targetLng);
      if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid coordinates');
      const { error } = await supabase.from('visits').update({
        customer_name: customerName, location_name: locationName,
        target_latitude: lat, target_longitude: lng,
        assigned_to: assignedTo, notes,
        visit_status: 'assigned', // re-assign resets status
      }).eq('id', editVisitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-visits'] });
      toast({ title: 'Visit Updated' });
      setEditOpen(false); resetForm();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const addProductMutation = useMutation({
    mutationFn: async () => {
      // Get team for this lead
      const myTeam = teamMembers.find(tm => tm.user_id === user!.id);
      const { error } = await supabase.from('products').insert({
        name: productName, unit: productUnit, price: parseFloat(productPrice),
        created_by: user!.id,
        team_id: myTeam?.team_id || teams[0]?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Product added' });
      setProductOpen(false); setProductName(''); setProductUnit('pcs'); setProductPrice('');
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const createTeamMutation = useMutation({
    mutationFn: async () => {
      const { data: team, error } = await supabase.from('teams').insert({ name: newTeamName }).select().single();
      if (error) throw error;
      // Add lead to team
      if (newTeamLeadId) {
        await supabase.from('team_members').insert({ team_id: team.id, user_id: newTeamLeadId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', 'team-members'] });
      toast({ title: 'Team created' });
      setCreateTeamOpen(false); setNewTeamName(''); setNewTeamLeadId('');
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const shiftMemberMutation = useMutation({
    mutationFn: async () => {
      // Remove from current teams
      const currentMemberships = teamMembers.filter(tm => tm.user_id === shiftUserId);
      for (const m of currentMemberships) {
        await supabase.from('team_members').delete().eq('id', m.id);
      }
      // Add to new team
      await supabase.from('team_members').insert({ team_id: shiftTeamId, user_id: shiftUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Member shifted to new team' });
      setShiftOpen(false); setShiftUserId(''); setShiftTeamId('');
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const promoteToLeadMutation = useMutation({
    mutationFn: async () => {
      // Update role to team_lead
      const { error } = await supabase.from('user_roles').update({ role: 'team_lead' }).eq('user_id', promoteUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-roles'] });
      toast({ title: 'User promoted to Team Lead' });
      setPromoteOpen(false); setPromoteUserId('');
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const openEditDialog = (visit: typeof visits[0]) => {
    setEditVisitId(visit.id);
    setCustomerName(visit.customer_name);
    setLocationName(visit.location_name || '');
    setTargetLat(visit.target_latitude?.toString() || '');
    setTargetLng(visit.target_longitude?.toString() || '');
    setAssignedTo(visit.assigned_to || '');
    setNotes(visit.notes || '');
    setAddress('');
    setEditOpen(true);
  };

  const grabCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        setTargetLat(pos.coords.latitude.toFixed(6));
        setTargetLng(pos.coords.longitude.toFixed(6));
        toast({ title: 'Location captured' });
      },
      () => toast({ title: 'GPS Error', variant: 'destructive' }),
      { enableHighAccuracy: true }
    );
  };

  const getAssigneeName = (userId: string) => {
    const p = profiles.find(p => p.user_id === userId);
    return p?.full_name || 'Unknown';
  };

  const getTeamName = (userId: string) => {
    const membership = teamMembers.find(tm => tm.user_id === userId);
    if (!membership) return 'Unassigned';
    const team = teams.find(t => t.id === membership.team_id);
    return team?.name || 'Unassigned';
  };

  const statusColor: Record<string, string> = {
    assigned: 'bg-accent/10 text-accent',
    verified: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
  };

  const viewVisit = visits.find(v => v.id === viewDialog);

  const renderVisitForm = (isEdit: boolean) => (
    <div className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label>Customer / Location Name</Label>
        <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Acme Corp Office" />
      </div>
      <div className="space-y-2">
        <Label>Address (auto-detect coordinates)</Label>
        <div className="flex gap-2">
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. MG Road, Bangalore" className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={geocodeAddress} disabled={geocoding} className="shrink-0 gap-1">
            <Search className="h-4 w-4" />
            {geocoding ? 'Searching...' : 'Find'}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Location Description</Label>
        <Input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Auto-filled from address" />
      </div>
      <div className="space-y-2">
        <Label>GPS Coordinates</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input value={targetLat} onChange={e => setTargetLat(e.target.value)} placeholder="Latitude" type="number" step="any" />
          <Input value={targetLng} onChange={e => setTargetLng(e.target.value)} placeholder="Longitude" type="number" step="any" />
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={grabCurrentLocation}>
          <Navigation className="h-4 w-4" /> Use My Current Location
        </Button>
        <p className="text-xs text-muted-foreground">Salesperson must be within 20m of this location to verify.</p>
      </div>
      <div className="space-y-2">
        <Label>Assign To</Label>
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
          <SelectContent>
            {salespersons.map(sp => (
              <SelectItem key={sp.user_id} value={sp.user_id}>
                {sp.full_name || sp.email} ({getTeamName(sp.user_id)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Visit instructions..." rows={2} />
      </div>
      <Button
        className="w-full h-12 text-base"
        disabled={!customerName || !targetLat || !targetLng || !assignedTo || (isEdit ? editVisitMutation.isPending : assignVisitMutation.isPending)}
        onClick={() => isEdit ? editVisitMutation.mutate() : assignVisitMutation.mutate()}
      >
        {isEdit
          ? (editVisitMutation.isPending ? 'Updating...' : 'Update Visit')
          : (assignVisitMutation.isPending ? 'Assigning...' : 'Assign Visit')
        }
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Team Management</h1>
          <p className="text-muted-foreground mt-1">Assign visits, manage products and your team</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="lg" className="h-12 px-6 text-base gap-2">
                <Plus className="h-5 w-5" /> Assign Visit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Assign Visit to Salesperson</DialogTitle></DialogHeader>
              {renderVisitForm(false)}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Visit Dialog */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit / Reassign Visit</DialogTitle></DialogHeader>
          {renderVisitForm(true)}
        </DialogContent>
      </Dialog>

      {/* View Visit Details Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={open => !open && setViewDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Visit Details: {viewVisit?.customer_name}</DialogTitle></DialogHeader>
          {viewVisit && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusColor[viewVisit.visit_status] || 'bg-muted'}>{viewVisit.visit_status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Assigned To</p>
                  <p className="font-medium">{getAssigneeName(viewVisit.assigned_to || '')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Checked In</p>
                  <p className="font-medium">{viewVisit.visit_status !== 'assigned' ? new Date(viewVisit.checked_in_at).toLocaleString() : 'Not yet'}</p>
                </div>
                {viewVisit.checked_out_at && (
                  <div>
                    <p className="text-muted-foreground">Checked Out</p>
                    <p className="font-medium">{new Date(viewVisit.checked_out_at).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Location</p>
                  <p className="font-medium">{viewVisit.location_name || 'N/A'}</p>
                </div>
              </div>
              {viewVisit.latitude && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  <p className="font-medium">📍 GPS</p>
                  <p className="text-muted-foreground">Target: {viewVisit.target_latitude?.toFixed(5)}, {viewVisit.target_longitude?.toFixed(5)}</p>
                  <p className="text-muted-foreground">Actual: {viewVisit.latitude.toFixed(5)}, {viewVisit.longitude?.toFixed(5)}</p>
                </div>
              )}
              {viewVisit.photo_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Photo</p>
                  <img src={viewVisit.photo_url} alt="Visit" className="rounded-lg max-h-48 object-cover w-full" />
                </div>
              )}
              {viewVisit.notes && (
                <div><p className="text-sm text-muted-foreground">Notes</p><p className="text-sm">{viewVisit.notes}</p></div>
              )}
              {viewVisit.order_received && (
                <div>
                  <p className="text-sm font-medium text-success mb-2">📦 Order Received</p>
                  {visitOrderItems.length > 0 && (
                    <div className="space-y-1">
                      {visitOrderItems.map((item: any) => (
                        <div key={item.id} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                          <span>{(item.products as any)?.name || 'Product'} × {item.quantity}</span>
                          <span className="font-medium">₹{(Number(item.price_at_order) * Number(item.quantity)).toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-bold pt-1 border-t">
                        <span>Total</span>
                        <span>₹{visitOrderItems.reduce((s: number, i: any) => s + Number(i.price_at_order) * Number(i.quantity), 0).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {viewVisit.order_notes && <p className="text-xs text-muted-foreground mt-2">{viewVisit.order_notes}</p>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Widget A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={productUnit} onChange={e => setProductUnit(e.target.value)} placeholder="pcs" />
              </div>
              <div className="space-y-2">
                <Label>Price (₹)</Label>
                <Input type="number" value={productPrice} onChange={e => setProductPrice(e.target.value)} placeholder="0" min="0" />
              </div>
            </div>
            <Button className="w-full" disabled={!productName || !productPrice || addProductMutation.isPending} onClick={() => addProductMutation.mutate()}>
              {addProductMutation.isPending ? 'Adding...' : 'Add Product'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin: Create Team Dialog */}
      <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create New Team</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="e.g. North Region" />
            </div>
            <div className="space-y-2">
              <Label>Team Lead (optional)</Label>
              <Select value={newTeamLeadId} onValueChange={setNewTeamLeadId}>
                <SelectTrigger><SelectValue placeholder="Select a lead" /></SelectTrigger>
                <SelectContent>
                  {profiles.filter(p => {
                    const r = roles.find(r => r.user_id === p.user_id);
                    return r?.role === 'team_lead';
                  }).map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={!newTeamName || createTeamMutation.isPending} onClick={() => createTeamMutation.mutate()}>
              {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin: Shift salesperson */}
      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Shift Salesperson to Team</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Salesperson</Label>
              <Select value={shiftUserId} onValueChange={setShiftUserId}>
                <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
                <SelectContent>
                  {salespersons.map(sp => (
                    <SelectItem key={sp.user_id} value={sp.user_id}>{sp.full_name || sp.email} ({getTeamName(sp.user_id)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Move to Team</Label>
              <Select value={shiftTeamId} onValueChange={setShiftTeamId}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={!shiftUserId || !shiftTeamId || shiftMemberMutation.isPending} onClick={() => shiftMemberMutation.mutate()}>
              {shiftMemberMutation.isPending ? 'Shifting...' : 'Shift Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin: Promote to lead */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Promote to Team Lead</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Select Salesperson</Label>
              <Select value={promoteUserId} onValueChange={setPromoteUserId}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {salespersons.map(sp => (
                    <SelectItem key={sp.user_id} value={sp.user_id}>{sp.full_name || sp.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={!promoteUserId || promoteToLeadMutation.isPending} onClick={() => promoteToLeadMutation.mutate()}>
              {promoteToLeadMutation.isPending ? 'Promoting...' : 'Promote to Team Lead'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="visits" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {role === 'admin' && <TabsTrigger value="teams">Teams</TabsTrigger>}
        </TabsList>

        <TabsContent value="visits" className="space-y-3">
          {visits.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">No visits assigned yet.</p>
              </CardContent>
            </Card>
          ) : (
            visits.map(v => (
              <Card key={v.id} className="field-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{v.customer_name}</p>
                        <Badge variant="outline" className={statusColor[v.visit_status] || 'bg-muted'}>{v.visit_status}</Badge>
                        {v.order_received && <Badge variant="outline" className="bg-success/10 text-success">Order ✓</Badge>}
                      </div>
                      {v.location_name && <p className="text-xs text-muted-foreground">📍 {v.location_name}</p>}
                      <p className="text-xs text-muted-foreground">
                        Assigned to: <strong>{getAssigneeName(v.assigned_to!)}</strong> · {new Date(v.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(v.visit_status === 'verified' || v.visit_status === 'failed') && (
                        <Button size="sm" variant="outline" onClick={() => setViewDialog(v.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(v.visit_status === 'assigned' || v.visit_status === 'failed') && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => openEditDialog(v)}>
                          <Pencil className="h-3.5 w-3.5" /> {v.visit_status === 'failed' ? 'Reassign' : 'Edit'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="products" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setProductOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </div>
          {products.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No products yet. Add products so salespersons can take orders.</p>
            </CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.filter(p => p.active).map(p => (
                <Card key={p.id} className="field-card">
                  <CardContent className="p-4">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.unit} · ₹{Number(p.price).toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members">
          <div className="flex justify-end gap-2 mb-4 flex-wrap">
            {(role === 'team_lead' || role === 'admin') && (
              <Button variant="outline" onClick={() => setCreateUserOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" /> Create Salesperson
              </Button>
            )}
            {role === 'admin' && (
              <>
                <Button variant="outline" onClick={() => setPromoteOpen(true)} className="gap-2">
                  <ShieldCheck className="h-4 w-4" /> Promote to Lead
                </Button>
                <Button variant="outline" onClick={() => setShiftOpen(true)} className="gap-2">
                  <ArrowRightLeft className="h-4 w-4" /> Shift Member
                </Button>
              </>
            )}
          </div>
          {/* Create User Dialog (lead creates salesperson) */}
          <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Create New Salesperson</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="user@company.com" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} />
                </div>
                <p className="text-xs text-muted-foreground">The user will be created with salesperson role. They can log in with these credentials.</p>
                <Button className="w-full" disabled={!newUserEmail || !newUserPassword || !newUserName}
                  onClick={async () => {
                    try {
                      const { error } = await supabase.auth.signUp({
                        email: newUserEmail, password: newUserPassword,
                        options: { data: { full_name: newUserName } },
                      });
                      if (error) throw error;
                      toast({ title: 'Salesperson created', description: 'They can now log in. Check email for verification.' });
                      setCreateUserOpen(false); setNewUserEmail(''); setNewUserPassword(''); setNewUserName('');
                      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
                    } catch (err: any) {
                      toast({ title: 'Error', description: err.message, variant: 'destructive' });
                    }
                  }}
                >Create Salesperson</Button>
              </div>
            </DialogContent>
          </Dialog>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading team...</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map(p => {
                const userRole = roles.find(r => r.user_id === p.user_id);
                const memberVisits = visits.filter(v => v.assigned_to === p.user_id);
                const verified = memberVisits.filter(v => v.visit_status === 'verified').length;
                return (
                  <Card key={p.id} className="field-card">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {(p.full_name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{p.full_name || 'Unnamed'}</p>
                          <p className="text-sm text-muted-foreground">{p.email}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="secondary" className="capitalize text-xs">
                              {(userRole?.role || 'salesperson').replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{getTeamName(p.user_id)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Visits: {memberVisits.length} · Verified: {verified}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {role === 'admin' && (
          <TabsContent value="teams" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreateTeamOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Create Team
              </Button>
            </div>
            {teams.length === 0 ? (
              <Card><CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">No teams created yet.</p>
              </CardContent></Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {teams.map(t => {
                  const members = teamMembers.filter(tm => tm.team_id === t.id);
                  const memberProfiles = members.map(m => {
                    const p = profiles.find(p => p.user_id === m.user_id);
                    const r = roles.find(r => r.user_id === m.user_id);
                    return { ...p, role: r?.role };
                  });
                  return (
                    <Card key={t.id} className="field-card">
                      <CardContent className="p-5">
                        <p className="font-bold text-lg">{t.name}</p>
                        <p className="text-sm text-muted-foreground mb-3">{members.length} members</p>
                        <div className="space-y-2">
                          {memberProfiles.map((mp, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {(mp?.full_name || 'U')[0]}
                              </div>
                              <span>{mp?.full_name || 'Unknown'}</span>
                              <Badge variant="secondary" className="text-[10px] capitalize">{(mp?.role || 'salesperson').replace('_', ' ')}</Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default TeamPage;
