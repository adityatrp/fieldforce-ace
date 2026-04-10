import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Camera, Clock, CheckCircle2, XCircle, Navigation, Package } from 'lucide-react';

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GPS_THRESHOLD_METERS = 20;

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  assigned: { label: 'Assigned', color: 'bg-accent/10 text-accent border-accent/20', icon: Clock },
  checked_in: { label: 'Checked In', color: 'bg-primary/10 text-primary border-primary/20', icon: Navigation },
  verified: { label: 'Verified ✓', color: 'bg-success/10 text-success border-success/20', icon: CheckCircle2 },
  failed: { label: 'Location Mismatch', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
};

const VisitsPage: React.FC = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checkInDialog, setCheckInDialog] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [orderReceived, setOrderReceived] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Salesperson only sees their assigned visits
  const { data: visits = [], isLoading } = useQuery({
    queryKey: ['visits', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('visits')
        .select('*')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const grabGPS = () => {
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('success');
      },
      () => {
        setGpsStatus('error');
        toast({ title: 'GPS Error', description: 'Could not get location.', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const checkInMutation = useMutation({
    mutationFn: async (visitId: string) => {
      if (!coords) throw new Error('GPS location required');

      const visit = visits.find(v => v.id === visitId);
      if (!visit) throw new Error('Visit not found');

      let photoUrl = '';
      if (photo) {
        const ext = photo.name.split('.').pop();
        const path = `visits/${user!.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('photos').upload(path, photo);
        if (!error) {
          const { data: urlData } = supabase.storage.from('photos').getPublicUrl(path);
          photoUrl = urlData.publicUrl;
        }
      }

      const distance = getDistanceMeters(
        coords.lat, coords.lng,
        visit.target_latitude!, visit.target_longitude!
      );

      const isVerified = distance <= GPS_THRESHOLD_METERS;

      const { error } = await supabase.from('visits').update({
        checked_in_at: new Date().toISOString(),
        latitude: coords.lat,
        longitude: coords.lng,
        photo_url: photoUrl || undefined,
        notes,
        visit_status: isVerified ? 'verified' : 'failed',
        order_received: orderReceived,
        order_notes: orderNotes,
      }).eq('id', visitId);

      if (error) throw error;
      return { isVerified, distance: Math.round(distance) };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      if (result.isVerified) {
        toast({ title: '✅ Visit Verified!', description: `You are within ${result.distance}m of the target location.` });
      } else {
        toast({
          title: '❌ Location Mismatch',
          description: `You are ${result.distance}m away from the target (max ${GPS_THRESHOLD_METERS}m).`,
          variant: 'destructive',
        });
      }
      resetDialog();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase.from('visits').update({
        checked_out_at: new Date().toISOString(),
      }).eq('id', visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast({ title: 'Checked out!' });
    },
  });

  const resetDialog = () => {
    setCheckInDialog(null);
    setNotes('');
    setPhoto(null);
    setCoords(null);
    setGpsStatus('idle');
    setOrderReceived(false);
    setOrderNotes('');
  };

  const selectedVisit = visits.find(v => v.id === checkInDialog);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">My Visits</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'salesperson'
            ? 'Visits assigned to you by your team lead'
            : 'All visits across the team'}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading visits...</div>
      ) : visits.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No visits assigned yet. Your team lead will assign visits to you.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visits.map(v => {
            const config = statusConfig[v.visit_status] || statusConfig.assigned;
            const StatusIcon = config.icon;
            return (
              <Card key={v.id} className="field-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${v.visit_status === 'verified' ? 'bg-success/10' : v.visit_status === 'failed' ? 'bg-destructive/10' : 'bg-accent/10'}`}>
                      <StatusIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{v.customer_name}</p>
                        <Badge variant="outline" className={config.color}>{config.label}</Badge>
                        {v.order_received && (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            <Package className="h-3 w-3 mr-1" /> Order
                          </Badge>
                        )}
                      </div>
                      {v.location_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">📍 {v.location_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(v.created_at).toLocaleDateString()}
                        {v.checked_in_at && v.visit_status !== 'assigned' && ` · Checked in: ${new Date(v.checked_in_at).toLocaleString()}`}
                        {v.checked_out_at && ` · Out: ${new Date(v.checked_out_at).toLocaleTimeString()}`}
                      </p>
                      {v.notes && <p className="text-xs text-muted-foreground mt-1">{v.notes}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {v.visit_status === 'assigned' && role === 'salesperson' && (
                        <Button size="sm" onClick={() => setCheckInDialog(v.id)}>
                          Check In
                        </Button>
                      )}
                      {(v.visit_status === 'verified' || v.visit_status === 'checked_in') && !v.checked_out_at && (
                        <Button size="sm" variant="outline" onClick={() => checkOutMutation.mutate(v.id)}>
                          Check Out
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Check-In Dialog */}
      <Dialog open={!!checkInDialog} onOpenChange={open => !open && resetDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check In: {selectedVisit?.customer_name}</DialogTitle>
          </DialogHeader>
          {selectedVisit && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="font-medium">📍 Target Location</p>
                <p className="text-muted-foreground">{selectedVisit.location_name || 'No name'}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedVisit.target_latitude?.toFixed(5)}, {selectedVisit.target_longitude?.toFixed(5)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Your GPS Location (required)</Label>
                <Button type="button" variant="outline" className="w-full gap-2" onClick={grabGPS} disabled={gpsStatus === 'loading'}>
                  <Navigation className="h-4 w-4" />
                  {gpsStatus === 'loading' ? 'Getting location...' : gpsStatus === 'success' ? `📍 ${coords!.lat.toFixed(5)}, ${coords!.lng.toFixed(5)}` : 'Get My Location'}
                </Button>
                {gpsStatus === 'success' && selectedVisit.target_latitude && (
                  <p className="text-xs text-muted-foreground">
                    Distance: {Math.round(getDistanceMeters(coords!.lat, coords!.lng, selectedVisit.target_latitude, selectedVisit.target_longitude!))}m
                    {getDistanceMeters(coords!.lat, coords!.lng, selectedVisit.target_latitude, selectedVisit.target_longitude!) <= GPS_THRESHOLD_METERS
                      ? ' ✅ Within range'
                      : ` ❌ Outside ${GPS_THRESHOLD_METERS}m range`}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Photo</Label>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                <Button type="button" variant="outline" className="w-full h-16 gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-5 w-5" />
                  {photo ? photo.name : 'Take Photo or Upload'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Visit notes..." rows={2} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="orderReceived"
                    checked={orderReceived}
                    onChange={e => setOrderReceived(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="orderReceived">Order Received (optional)</Label>
                </div>
                {orderReceived && (
                  <Textarea
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    placeholder="Order details..."
                    rows={2}
                  />
                )}
              </div>

              <Button
                className="w-full h-12 text-base"
                disabled={gpsStatus !== 'success' || checkInMutation.isPending}
                onClick={() => checkInMutation.mutate(checkInDialog!)}
              >
                {checkInMutation.isPending ? 'Verifying...' : 'Submit Check-In'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VisitsPage;
