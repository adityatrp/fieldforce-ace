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
import { Users, MapPin, Plus, Navigation, Search, Pencil } from 'lucide-react';

const TeamPage: React.FC = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  const salespersons = profiles.filter(p => {
    const r = roles.find(r => r.user_id === p.user_id);
    return r?.role === 'salesperson';
  });

  // Geocode address using OpenStreetMap Nominatim (free, no API key)
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
    setCustomerName('');
    setLocationName('');
    setAddress('');
    setTargetLat('');
    setTargetLng('');
    setAssignedTo('');
    setNotes('');
    setEditVisitId(null);
  };

  const assignVisitMutation = useMutation({
    mutationFn: async () => {
      const lat = parseFloat(targetLat);
      const lng = parseFloat(targetLng);
      if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid coordinates');

      const { error } = await supabase.from('visits').insert({
        customer_name: customerName,
        location_name: locationName,
        target_latitude: lat,
        target_longitude: lng,
        assigned_to: assignedTo,
        assigned_by: user!.id,
        user_id: user!.id,
        visit_status: 'assigned',
        notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-visits'] });
      toast({ title: 'Visit Assigned', description: `Visit to ${customerName} assigned successfully.` });
      setOpen(false);
      resetForm();
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
        customer_name: customerName,
        location_name: locationName,
        target_latitude: lat,
        target_longitude: lng,
        assigned_to: assignedTo,
        notes,
      }).eq('id', editVisitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-visits'] });
      toast({ title: 'Visit Updated' });
      setEditOpen(false);
      resetForm();
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

  const statusColor: Record<string, string> = {
    assigned: 'bg-accent/10 text-accent',
    verified: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
  };

  // Shared form fields for create/edit
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
                {sp.full_name || sp.email} {sp.team_name ? `(${sp.team_name})` : ''}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Team Management</h1>
          <p className="text-muted-foreground mt-1">Assign visits and manage your team</p>
        </div>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="lg" className="h-12 px-6 text-base gap-2">
              <Plus className="h-5 w-5" /> Assign Visit
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Assign Visit to Salesperson</DialogTitle>
            </DialogHeader>
            {renderVisitForm(false)}
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Visit Dialog */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Visit</DialogTitle>
          </DialogHeader>
          {renderVisitForm(true)}
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="visits" className="space-y-4">
        <TabsList>
          <TabsTrigger value="visits">Assigned Visits</TabsTrigger>
          <TabsTrigger value="members">Team Members</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-3">
          {visits.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">No visits assigned yet. Tap "Assign Visit" to get started.</p>
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
                        <Badge variant="outline" className={statusColor[v.visit_status] || 'bg-muted'}>
                          {v.visit_status}
                        </Badge>
                        {v.order_received && (
                          <Badge variant="outline" className="bg-success/10 text-success">Order ✓</Badge>
                        )}
                      </div>
                      {v.location_name && <p className="text-xs text-muted-foreground">📍 {v.location_name}</p>}
                      <p className="text-xs text-muted-foreground">
                        Assigned to: <strong>{getAssigneeName(v.assigned_to!)}</strong> · {new Date(v.created_at).toLocaleDateString()}
                      </p>
                      {v.notes && <p className="text-xs text-muted-foreground mt-1">{v.notes}</p>}
                      {v.visit_status === 'verified' && v.latitude && (
                        <p className="text-xs text-success mt-1">
                          ✅ Verified at {v.latitude.toFixed(4)}, {v.longitude?.toFixed(4)}
                        </p>
                      )}
                      {v.visit_status === 'failed' && v.latitude && (
                        <p className="text-xs text-destructive mt-1">
                          ❌ GPS mismatch — checked in at {v.latitude.toFixed(4)}, {v.longitude?.toFixed(4)}
                        </p>
                      )}
                    </div>
                    {/* Edit button for uncompleted visits */}
                    {(v.visit_status === 'assigned' || v.visit_status === 'failed') && (
                      <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => openEditDialog(v)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="members">
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
                            {p.team_name && (
                              <Badge variant="outline" className="text-xs">{p.team_name}</Badge>
                            )}
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
      </Tabs>
    </div>
  );
};

export default TeamPage;
