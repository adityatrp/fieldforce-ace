import React, { useState, useMemo } from 'react';
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
import { Users, MapPin, Plus, Navigation, Search, Pencil, Eye, Package, UserPlus, Trash2, ShieldCheck, ArrowRightLeft, Target, Bell } from 'lucide-react';
import SignedImage from '@/components/SignedImage';

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
  const [scheduledAt, setScheduledAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [noOverdue, setNoOverdue] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // View visit details
  const [viewDialog, setViewDialog] = useState<string | null>(null);

  // Product form
  const [productOpen, setProductOpen] = useState(false);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('pcs');
  const [productPrice, setProductPrice] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productSKU, setProductSKU] = useState('');
  const [productCategory, setProductCategory] = useState('');

  // Create user form
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserTeamId, setNewUserTeamId] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

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
  const [promoteTeamId, setPromoteTeamId] = useState('');

  // Target setting
  const [targetOpen, setTargetOpen] = useState(false);
  const [teamTargetValue, setTeamTargetValue] = useState('');

  // Search filters
  const [spSearch, setSpSearch] = useState('');

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

  const { data: targets = [] } = useQuery({
    queryKey: ['team-targets'],
    queryFn: async () => {
      const { data } = await supabase.from('targets').select('*');
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

  const { data: visitExtraPhotos = [] } = useQuery({
    queryKey: ['visit-extra-photos-team', viewDialog],
    queryFn: async () => {
      if (!viewDialog) return [];
      const { data } = await supabase.from('visit_extra_photos').select('*').eq('visit_id', viewDialog).order('created_at');
      return data || [];
    },
    enabled: !!viewDialog,
  });

  // Team lead's team
  const myTeamMembership = teamMembers.find(tm => tm.user_id === user?.id);
  const myTeamId = myTeamMembership?.team_id;
  const myTeamMemberIds = teamMembers.filter(tm => tm.team_id === myTeamId).map(tm => tm.user_id);

  const salespersons = useMemo(() => {
    return profiles.filter(p => {
      const r = roles.find(r => r.user_id === p.user_id);
      if (r?.role !== 'salesperson') return false;
      if (role === 'team_lead') {
        return myTeamMemberIds.includes(p.user_id);
      }
      return true;
    });
  }, [profiles, roles, role, myTeamMemberIds]);

  const filteredSalespersons = useMemo(() => {
    if (!spSearch.trim()) return salespersons;
    const q = spSearch.toLowerCase();
    return salespersons.filter(sp =>
      (sp.full_name || '').toLowerCase().includes(q) ||
      (sp.email || '').toLowerCase().includes(q)
    );
  }, [salespersons, spSearch]);

  const visibleMembers = useMemo(() => {
    if (role === 'admin') return profiles;
    if (role === 'team_lead') {
      return profiles.filter(p => {
        if (p.user_id === user?.id) return true;
        const r = roles.find(r => r.user_id === p.user_id);
        if (r?.role === 'admin') return false;
        return myTeamMemberIds.includes(p.user_id);
      });
    }
    return profiles;
  }, [profiles, roles, role, myTeamMemberIds, user]);

  const visibleVisits = useMemo(() => {
    if (role === 'admin') return visits;
    if (role === 'team_lead') {
      return visits.filter(v => myTeamMemberIds.includes(v.assigned_to || ''));
    }
    return visits;
  }, [visits, role, myTeamMemberIds]);

  const geocodeAddress = async () => {
    if (!address.trim()) {
      toast({ title: 'Please enter an address', description: 'Type a business name, landmark, or address to auto-detect coordinates.', variant: 'destructive' });
      return;
    }
    setGeocoding(true);
    try {
      // Photon (OSM-backed) handles business names, POIs, and landmarks well — closer to Google-style search.
      const photonRes = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=en`,
        { headers: { 'Accept': 'application/json' } }
      );
      const photonData = await photonRes.json();
      const feature = photonData?.features?.[0];
      if (feature) {
        const [lon, lat] = feature.geometry.coordinates;
        setTargetLat(String(parseFloat(lat)));
        setTargetLng(String(parseFloat(lon)));
        const props = feature.properties || {};
        const label = [props.name, props.street, props.city, props.country].filter(Boolean).join(', ');
        setLocationName(label || address);
        toast({ title: 'Location found', description: label || address });
        return;
      }
      // Fallback to Nominatim if Photon misses
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      const results = await nomRes.json();
      if (results.length > 0) {
        setTargetLat(String(parseFloat(results[0].lat)));
        setTargetLng(String(parseFloat(results[0].lon)));
        setLocationName(results[0].display_name?.split(',').slice(0, 3).join(',') || address);
        toast({ title: 'Location found', description: results[0].display_name?.split(',').slice(0, 2).join(',') });
      } else {
        toast({ title: 'Address not found', description: 'Please try a more specific name (e.g. include city) or enter coordinates manually.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Geocoding failed', description: 'Unable to resolve address. Please check your connection and try again.', variant: 'destructive' });
    } finally {
      setGeocoding(false);
    }
  };

  const resetForm = () => {
    setCustomerName(''); setLocationName(''); setAddress('');
    setTargetLat(''); setTargetLng(''); setAssignedTo('');
    setNotes(''); setEditVisitId(null); setSpSearch('');
    setScheduledAt(''); setDueDate(''); setNoOverdue(false);
  };

  const assignVisitMutation = useMutation({
    mutationFn: async () => {
      const lat = parseFloat(targetLat);
      const lng = parseFloat(targetLng);
      if (isNaN(lat) || isNaN(lng)) throw new Error('Please provide valid GPS coordinates.');
      if (!assignedTo) throw new Error('Please select a salesperson to assign this visit to.');
      const dueIso = !noOverdue && dueDate ? new Date(dueDate).toISOString() : null;
      const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      if (dueIso && scheduledIso && new Date(dueIso) < new Date(scheduledIso)) {
        throw new Error('Due date cannot be before the scheduled date.');
      }
      // If editing a failed visit, treat as reassignment: create new visit and link parent.
      const isReassignFromFailed = !!editVisitId && visits.find(v => v.id === editVisitId)?.visit_status === 'failed';

      const { data: created, error } = await supabase.from('visits').insert({
        customer_name: customerName, location_name: locationName,
        target_latitude: lat, target_longitude: lng,
        assigned_to: assignedTo, assigned_by: user!.id,
        user_id: user!.id, visit_status: 'assigned', notes,
        due_date: dueIso,
        scheduled_at: scheduledIso,
      } as any).select().single();
      if (error) throw error;

      if (isReassignFromFailed && created) {
        await supabase.from('visits').update({ reassigned_to_visit_id: created.id } as any).eq('id', editVisitId!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-visits'] });
      toast({ title: 'Visit assigned successfully' });
      setOpen(false); setEditOpen(false); resetForm();
    },
    onError: (err: Error) => toast({ title: 'Failed to assign visit', description: err.message, variant: 'destructive' }),
  });

  const editVisitMutation = useMutation({
    mutationFn: async () => {
      if (!editVisitId) throw new Error('No visit selected for editing.');
      const lat = parseFloat(targetLat);
      const lng = parseFloat(targetLng);
      if (isNaN(lat) || isNaN(lng)) throw new Error('Please provide valid GPS coordinates.');
      const dueIso = !noOverdue && dueDate ? new Date(dueDate).toISOString() : null;
      const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      if (dueIso && scheduledIso && new Date(dueIso) < new Date(scheduledIso)) {
        throw new Error('Due date cannot be before the scheduled date.');
      }
      const { error } = await supabase.from('visits').update({
        customer_name: customerName, location_name: locationName,
        target_latitude: lat, target_longitude: lng,
        assigned_to: assignedTo, notes,
        visit_status: 'assigned',
        due_date: dueIso,
        scheduled_at: scheduledIso,
      } as any).eq('id', editVisitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-visits'] });
      toast({ title: 'Visit updated successfully' });
      setEditOpen(false); resetForm();
    },
    onError: (err: Error) => toast({ title: 'Failed to update visit', description: err.message, variant: 'destructive' }),
  });

  const addProductMutation = useMutation({
    mutationFn: async () => {
      let teamId = myTeamId;
      if (role === 'admin') {
        teamId = teams[0]?.id;
      }
      if (!teamId) throw new Error('No team found. Please create a team first.');
      const price = parseFloat(productPrice);
      if (isNaN(price) || price < 0) throw new Error('Please enter a valid price.');
      const { error } = await supabase.from('products').insert({
        name: productName, unit: productUnit, price,
        sku: productSKU, category: productCategory, description: productDescription,
        created_by: user!.id,
        team_id: teamId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Product added successfully' });
      setProductOpen(false); setProductName(''); setProductUnit('pcs'); setProductPrice('');
      setProductDescription(''); setProductSKU(''); setProductCategory('');
    },
    onError: (err: Error) => toast({ title: 'Failed to add product', description: err.message, variant: 'destructive' }),
  });

  const setTeamTargetMutation = useMutation({
    mutationFn: async () => {
      const targetVal = parseFloat(teamTargetValue);
      if (isNaN(targetVal) || targetVal <= 0) throw new Error('Please enter a valid target value.');

      const spIds = role === 'team_lead' ? salespersons.map(s => s.user_id) : [];
      if (spIds.length === 0) throw new Error('No salespersons found in your team.');

      for (const uid of spIds) {
        const existing = targets.find(t => t.user_id === uid);
        if (existing) {
          await supabase.from('targets').update({ target_value: targetVal }).eq('id', existing.id);
        } else {
          await supabase.from('targets').insert({ user_id: uid, target_value: targetVal, achieved_value: 0 });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-targets'] });
      toast({ title: 'Target set for all team members successfully' });
      setTargetOpen(false); setTeamTargetValue('');
    },
    onError: (err: Error) => toast({ title: 'Failed to set targets', description: err.message, variant: 'destructive' }),
  });

  const createTeamMutation = useMutation({
    mutationFn: async () => {
      if (!newTeamName.trim()) throw new Error('Please enter a team name.');
      const { data: team, error } = await supabase.from('teams').insert({ name: newTeamName }).select().single();
      if (error) throw error;
      if (newTeamLeadId) {
        await supabase.from('team_members').insert({ team_id: team.id, user_id: newTeamLeadId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', 'team-members'] });
      toast({ title: 'Team created successfully' });
      setCreateTeamOpen(false); setNewTeamName(''); setNewTeamLeadId('');
    },
    onError: (err: Error) => toast({ title: 'Failed to create team', description: err.message, variant: 'destructive' }),
  });

  const shiftMemberMutation = useMutation({
    mutationFn: async () => {
      const currentMemberships = teamMembers.filter(tm => tm.user_id === shiftUserId);
      for (const m of currentMemberships) {
        await supabase.from('team_members').delete().eq('id', m.id);
      }
      await supabase.from('team_members').insert({ team_id: shiftTeamId, user_id: shiftUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Member shifted to new team successfully' });
      setShiftOpen(false); setShiftUserId(''); setShiftTeamId('');
    },
    onError: (err: Error) => toast({ title: 'Failed to shift member', description: err.message, variant: 'destructive' }),
  });

  const promoteToLeadMutation = useMutation({
    mutationFn: async () => {
      if (!promoteUserId) throw new Error('Please select a user to promote.');
      if (!promoteTeamId) throw new Error('Please select a team for the new lead.');
      const { error } = await supabase.from('user_roles').update({ role: 'team_lead' }).eq('user_id', promoteUserId);
      if (error) throw error;
      const existing = teamMembers.find(tm => tm.user_id === promoteUserId && tm.team_id === promoteTeamId);
      if (!existing) {
        const currentMemberships = teamMembers.filter(tm => tm.user_id === promoteUserId);
        for (const m of currentMemberships) {
          await supabase.from('team_members').delete().eq('id', m.id);
        }
        await supabase.from('team_members').insert({ team_id: promoteTeamId, user_id: promoteUserId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-roles', 'team-members'] });
      toast({ title: 'User promoted to Team Lead successfully' });
      setPromoteOpen(false); setPromoteUserId(''); setPromoteTeamId('');
    },
    onError: (err: Error) => toast({ title: 'Failed to promote user', description: err.message, variant: 'destructive' }),
  });

  const orderApprovalMutation = useMutation({
    mutationFn: async ({ visitId, status }: { visitId: string; status: 'approved' | 'rejected' }) => {
      const { error } = await supabase.from('visits').update({
        order_approval_status: status,
        order_approved_by: user!.id,
        order_approved_at: new Date().toISOString(),
      }).eq('id', visitId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['team-visits'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast({ title: vars.status === 'approved' ? 'Order approved' : 'Order rejected' });
    },
    onError: (err: Error) => toast({ title: 'Could not update order', description: err.message, variant: 'destructive' }),
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
    const dd = (visit as any).due_date;
    setDueDate(dd ? new Date(dd).toISOString().slice(0, 16) : '');
    setNoOverdue(!dd);
    const sa = (visit as any).scheduled_at;
    setScheduledAt(sa ? new Date(sa).toISOString().slice(0, 16) : '');
    setEditOpen(true);
  };

  const grabCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'GPS unavailable', description: 'Geolocation not supported on this device.', variant: 'destructive' });
      return;
    }
    const TARGET = 10; // ±10m
    const HARD_TIMEOUT = 25000;
    let best: GeolocationPosition | null = null;
    let done = false;
    toast({ title: 'Locking GPS…', description: 'Hold still while we get a ±10m fix.' });

    const finish = (errMsg?: string) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) {
        setTargetLat(String(best.coords.latitude));
        setTargetLng(String(best.coords.longitude));
        const acc = Math.round(best.coords.accuracy);
        if (best.coords.accuracy <= TARGET) {
          toast({ title: '✅ Precise location captured', description: `Accuracy: ±${acc}m` });
        } else {
          toast({
            title: '⚠️ Best available fix',
            description: `Accuracy: ±${acc}m (target ±${TARGET}m). Move to open sky and retry for better precision.`,
            variant: 'destructive',
          });
        }
      } else {
        toast({ title: 'GPS Error', description: errMsg || 'Unable to capture location. Check GPS permissions.', variant: 'destructive' });
      }
    };

    const timer = setTimeout(() => finish(), HARD_TIMEOUT);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (best.coords.accuracy <= TARGET) finish();
      },
      (err) => { if (!best) finish(err.message); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: HARD_TIMEOUT }
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

  const getTeamNameById = (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    return team?.name || 'Unknown';
  };

  const statusColor: Record<string, string> = {
    assigned: 'bg-accent/10 text-accent',
    verified: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
  };

  const viewVisit = visits.find(v => v.id === viewDialog);

  const renderSalespersonSelect = () => (
    <div className="space-y-2">
      <Label>Assign To</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search salesperson..."
          value={spSearch}
          onChange={e => setSpSearch(e.target.value)}
          className="pl-9 mb-2"
        />
      </div>
      <Select value={assignedTo} onValueChange={setAssignedTo}>
        <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
        <SelectContent>
          {filteredSalespersons.map(sp => (
            <SelectItem key={sp.user_id} value={sp.user_id}>
              {sp.full_name || sp.email} ({getTeamName(sp.user_id)})
            </SelectItem>
          ))}
          {filteredSalespersons.length === 0 && (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">No salespersons found</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );

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
        <p className="text-xs text-muted-foreground">Salesperson must be within 40m of this location to verify.</p>
      </div>
      {renderSalespersonSelect()}
      <div className="space-y-2">
        <Label>Schedule For (optional — visit appears active from this date)</Label>
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
          min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
          className="w-full"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Now', d: () => new Date() },
            { label: 'Tomorrow 9 AM', d: () => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(9, 0, 0, 0); return x; } },
            { label: '+3 days', d: () => { const x = new Date(); x.setDate(x.getDate() + 3); x.setHours(9, 0, 0, 0); return x; } },
            { label: 'Next week', d: () => { const x = new Date(); x.setDate(x.getDate() + 7); x.setHours(9, 0, 0, 0); return x; } },
          ].map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const x = p.d();
                const local = new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                setScheduledAt(local);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground active:scale-95 transition-transform"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Due Date (optional — auto-fails if not done by then)</Label>
        <Input
          type="datetime-local"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          disabled={noOverdue}
          min={(scheduledAt || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))}
          className="w-full"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Today 6 PM', d: () => { const x = new Date(); x.setHours(18, 0, 0, 0); return x; } },
            { label: 'Tomorrow 6 PM', d: () => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(18, 0, 0, 0); return x; } },
            { label: '+3 days', d: () => { const x = new Date(); x.setDate(x.getDate() + 3); x.setHours(18, 0, 0, 0); return x; } },
            { label: '+1 week', d: () => { const x = new Date(); x.setDate(x.getDate() + 7); x.setHours(18, 0, 0, 0); return x; } },
          ].map(p => (
            <button
              key={p.label}
              type="button"
              disabled={noOverdue}
              onClick={() => {
                const x = p.d();
                const local = new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                setDueDate(local);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground active:scale-95 transition-transform disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="noOverdue" checked={noOverdue} onChange={e => { setNoOverdue(e.target.checked); if (e.target.checked) setDueDate(''); }} className="h-4 w-4 rounded border-border" />
          <Label htmlFor="noOverdue" className="text-sm font-normal">No due date (open-ended)</Label>
        </div>
        {!noOverdue && dueDate && (
          <p className="text-xs text-muted-foreground">Visit will auto-fail if no check-in by this time.</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Visit instructions..." rows={2} />
      </div>
      <Button
        className="w-full h-12 text-base"
        disabled={!customerName || !targetLat || !targetLng || !assignedTo || (isEdit ? editVisitMutation.isPending : assignVisitMutation.isPending) || (!noOverdue && !dueDate && !isEdit ? false : false)}
        onClick={() => {
          const isReassignFromFailed = isEdit && visits.find(v => v.id === editVisitId)?.visit_status === 'failed';
          if (isReassignFromFailed) {
            assignVisitMutation.mutate();
          } else if (isEdit) {
            editVisitMutation.mutate();
          } else {
            assignVisitMutation.mutate();
          }
        }}
      >
        {isEdit
          ? (editVisitMutation.isPending || assignVisitMutation.isPending ? 'Saving...' : (visits.find(v => v.id === editVisitId)?.visit_status === 'failed' ? 'Reassign as New Visit' : 'Update Visit'))
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
          {role === 'team_lead' && (
            <Button variant="outline" onClick={() => setTargetOpen(true)} className="gap-2">
              <Target className="h-4 w-4" /> Set Team Target
            </Button>
          )}
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

      {/* Set Target Dialog */}
      <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Set Monthly Target for Team</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              This will set the same monthly target for all {salespersons.length} salesperson(s) in your team.
            </p>
            {salespersons.length > 0 && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                <p className="font-medium">Current team members:</p>
                {salespersons.map(sp => {
                  const existing = targets.find(t => t.user_id === sp.user_id);
                  return (
                    <div key={sp.user_id} className="flex justify-between">
                      <span>{sp.full_name || sp.email}</span>
                      <span className="text-muted-foreground">
                        {existing ? `Current: ₹${Number(existing.target_value).toLocaleString()}` : 'No target'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-2">
              <Label>Monthly Target Amount (₹)</Label>
              <Input
                type="number"
                value={teamTargetValue}
                onChange={e => setTeamTargetValue(e.target.value)}
                placeholder="e.g. 100000"
                min="0"
              />
            </div>
            <Button
              className="w-full"
              disabled={!teamTargetValue || setTeamTargetMutation.isPending}
              onClick={() => setTeamTargetMutation.mutate()}
            >
              {setTeamTargetMutation.isPending ? 'Setting targets...' : `Set Target for ${salespersons.length} Members`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                  <p className="text-muted-foreground">Team</p>
                  <p className="font-medium">{getTeamName(viewVisit.assigned_to || '')}</p>
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
                  <p className="text-muted-foreground break-all">Target: {viewVisit.target_latitude?.toFixed(7)}, {viewVisit.target_longitude?.toFixed(7)}</p>
                  <p className="text-muted-foreground break-all">Actual: {viewVisit.latitude.toFixed(7)}, {viewVisit.longitude?.toFixed(7)}</p>
                </div>
              )}
              {viewVisit.photo_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Visit Photo</p>
                  <SignedImage
                    path={viewVisit.photo_url}
                    alt="Visit photo"
                    className="rounded-lg max-h-64 object-cover w-full cursor-pointer"
                    onResolved={(u) => { (viewVisit as any).__signedPhotoUrl = u; }}
                    onClick={() => {
                      const u = (viewVisit as any).__signedPhotoUrl;
                      if (u) window.open(u, '_blank');
                    }}
                  />
                </div>
              )}
              {visitExtraPhotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Additional Photos ({visitExtraPhotos.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {visitExtraPhotos.map((ep: any) => (
                      <div key={ep.id} className="space-y-1">
                        <SignedImage
                          path={ep.photo_path}
                          alt={ep.caption || 'Extra photo'}
                          className="rounded-lg h-32 object-cover w-full cursor-pointer"
                          onResolved={(u) => { (ep as any).__signedUrl = u; }}
                          onClick={() => {
                            const u = (ep as any).__signedUrl;
                            if (u) window.open(u, '_blank');
                          }}
                        />
                        {ep.caption && <p className="text-xs text-muted-foreground">{ep.caption}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewVisit.notes && (
                <div><p className="text-sm text-muted-foreground">Notes</p><p className="text-sm">{viewVisit.notes}</p></div>
              )}
              {viewVisit.order_received && (
                <div>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <p className="text-sm font-medium text-success">📦 Order Received</p>
                    <Badge
                      variant="outline"
                      className={
                        (viewVisit as any).order_approval_status === 'approved'
                          ? 'bg-success/10 text-success border-success/20'
                          : (viewVisit as any).order_approval_status === 'rejected'
                            ? 'bg-destructive/10 text-destructive border-destructive/20'
                            : 'bg-warning/10 text-warning border-warning/20'
                      }
                    >
                      {(viewVisit as any).order_approval_status || 'pending'}
                    </Badge>
                  </div>
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
                  {(role === 'team_lead' || role === 'admin') && (viewVisit as any).order_approval_status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={orderApprovalMutation.isPending}
                        onClick={() => orderApprovalMutation.mutate({ visitId: viewVisit.id, status: 'approved' })}
                      >
                        Approve Order
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-destructive"
                        disabled={orderApprovalMutation.isPending}
                        onClick={() => orderApprovalMutation.mutate({ visitId: viewVisit.id, status: 'rejected' })}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
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
              <Label>Product Name *</Label>
              <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Premium Widget" />
            </div>
            <div className="space-y-2">
              <Label>SKU / Product Code</Label>
              <Input value={productSKU} onChange={e => setProductSKU(e.target.value)} placeholder="e.g. WDG-001" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={productCategory} onChange={e => setProductCategory(e.target.value)} placeholder="e.g. Electronics, FMCG" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={productDescription} onChange={e => setProductDescription(e.target.value)} placeholder="Product details..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unit *</Label>
                <Select value={productUnit} onValueChange={setProductUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['pcs', 'kg', 'ltr', 'box', 'pack', 'dozen', 'unit'].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price (₹) *</Label>
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
                    <SelectItem key={sp.user_id} value={sp.user_id}>{sp.full_name || sp.email} ({getTeamName(sp.user_id)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign as Lead for Team</Label>
              <Select value={promoteTeamId} onValueChange={setPromoteTeamId}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={!promoteUserId || !promoteTeamId || promoteToLeadMutation.isPending} onClick={() => promoteToLeadMutation.mutate()}>
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
          {visibleVisits.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">No visits assigned yet.</p>
              </CardContent>
            </Card>
          ) : (
            visibleVisits.map(v => (
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
                        Assigned to: <strong>{getAssigneeName(v.assigned_to!)}</strong>
                        {role === 'admin' && ` · Team: ${getTeamName(v.assigned_to || '')}`}
                        {' · '}{new Date(v.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(v.visit_status === 'verified' || v.visit_status === 'failed') && (
                        <Button size="sm" variant="outline" onClick={() => setViewDialog(v.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(v.visit_status === 'assigned' || (v.visit_status === 'failed' && !(v as any).reassigned_to_visit_id)) && (
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
          {(role === 'team_lead' || role === 'admin') && (
            <div className="flex justify-end">
              <Button onClick={() => setProductOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Add Product
              </Button>
            </div>
          )}
          {products.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No products yet. {role === 'team_lead' || role === 'admin' ? 'Add products so salespersons can take orders.' : 'Your team lead will add products.'}</p>
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
          {/* Create User Dialog */}
          <Dialog open={createUserOpen} onOpenChange={(o) => { setCreateUserOpen(o); if (!o) { setNewUserTeamId(''); } }}>
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
                {role === 'admin' && (
                  <div className="space-y-2">
                    <Label>Assign to Team</Label>
                    <Select value={newUserTeamId} onValueChange={setNewUserTeamId}>
                      <SelectTrigger><SelectValue placeholder="Select a team" /></SelectTrigger>
                      <SelectContent>
                        {teams.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {teams.length === 0 && (
                      <p className="text-xs text-warning">No teams found. Please create a team first in the Teams tab.</p>
                    )}
                  </div>
                )}
                {role === 'team_lead' && (
                  <p className="text-xs text-muted-foreground">
                    The new salesperson will be automatically added to your team
                    {myTeamId ? ` (${getTeamNameById(myTeamId)}).` : '.'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">The user will be created with salesperson role. They can log in with these credentials after email verification.</p>
                <Button
                  className="w-full"
                  disabled={
                    !newUserEmail || !newUserPassword || !newUserName || creatingUser ||
                    (role === 'admin' && !newUserTeamId) ||
                    (role === 'team_lead' && !myTeamId)
                  }
                  onClick={async () => {
                    setCreatingUser(true);
                    try {
                      const targetTeamId = role === 'admin' ? newUserTeamId : myTeamId;
                      if (!targetTeamId) throw new Error('A team is required to create a salesperson.');

                      // Preserve current admin/lead session — sign-up auto-logs-in the new user.
                      const { data: sessionData } = await supabase.auth.getSession();
                      const currentSession = sessionData.session;

                      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                        email: newUserEmail,
                        password: newUserPassword,
                        options: { data: { full_name: newUserName } },
                      });
                      if (signUpError) throw signUpError;

                      const newUserId = signUpData.user?.id;

                      if (currentSession) {
                        await supabase.auth.setSession({
                          access_token: currentSession.access_token,
                          refresh_token: currentSession.refresh_token,
                        });
                      }

                      if (newUserId) {
                        const { error: tmError } = await supabase.from('team_members').insert({
                          team_id: targetTeamId,
                          user_id: newUserId,
                        });
                        if (tmError && !tmError.message.toLowerCase().includes('duplicate')) {
                          throw new Error(`User created, but team assignment failed: ${tmError.message}`);
                        }
                      }

                      toast({
                        title: 'Salesperson created successfully',
                        description: `${newUserName} has been added to ${role === 'admin' ? teams.find(t => t.id === newUserTeamId)?.name : getTeamNameById(myTeamId!)}. They can log in after email verification.`,
                      });
                      setCreateUserOpen(false);
                      setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserTeamId('');
                      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
                      queryClient.invalidateQueries({ queryKey: ['team-members'] });
                    } catch (err: any) {
                      toast({ title: 'Failed to create salesperson', description: err.message, variant: 'destructive' });
                    } finally {
                      setCreatingUser(false);
                    }
                  }}
                >
                  {creatingUser ? 'Creating...' : 'Create Salesperson'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading team...</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleMembers.map(p => {
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
                          {memberProfiles.length === 0 && (
                            <p className="text-xs text-muted-foreground">No members assigned to this team yet.</p>
                          )}
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
