import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Camera, Plus, Clock, CheckCircle2, XCircle } from 'lucide-react';

const VisitsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ['visits', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('visits').select('*').order('checked_in_at', { ascending: false });
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
        toast({ title: 'GPS Error', description: 'Could not get location. Please enable location services.', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const checkInMutation = useMutation({
    mutationFn: async () => {
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

      const { error } = await supabase.from('visits').insert({
        user_id: user!.id,
        customer_name: customerName,
        photo_url: photoUrl,
        latitude: coords?.lat || null,
        longitude: coords?.lng || null,
        notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast({ title: 'Checked in!', description: `Visit to ${customerName} recorded.` });
      setOpen(false);
      setCustomerName('');
      setNotes('');
      setPhoto(null);
      setCoords(null);
      setGpsStatus('idle');
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase.from('visits').update({ checked_out_at: new Date().toISOString() }).eq('id', visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast({ title: 'Checked out!' });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Visits</h1>
          <p className="text-muted-foreground mt-1">Record and manage your field visits</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="h-12 px-6 text-base gap-2">
              <Plus className="h-5 w-5" /> Check In
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Visit Check-In</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Acme Corp" />
              </div>

              <div className="space-y-2">
                <Label>Photo</Label>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                <Button type="button" variant="outline" className="w-full h-20 gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-5 w-5" />
                  {photo ? photo.name : 'Take Photo or Upload'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>GPS Location</Label>
                <Button type="button" variant="outline" className="w-full gap-2" onClick={grabGPS} disabled={gpsStatus === 'loading'}>
                  <MapPin className="h-4 w-4" />
                  {gpsStatus === 'loading' ? 'Getting location...' : gpsStatus === 'success' ? `${coords!.lat.toFixed(4)}, ${coords!.lng.toFixed(4)}` : 'Grab GPS Coordinates'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Visit notes..." rows={3} />
              </div>

              <Button className="w-full h-12 text-base" disabled={!customerName || checkInMutation.isPending} onClick={() => checkInMutation.mutate()}>
                {checkInMutation.isPending ? 'Saving...' : 'Submit Check-In'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading visits...</div>
      ) : visits.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No visits yet. Tap "Check In" to record your first visit.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visits.map(v => (
            <Card key={v.id} className="field-card">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${v.checked_out_at ? 'bg-success/10' : 'bg-accent/10'}`}>
                  {v.checked_out_at ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Clock className="h-5 w-5 text-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{v.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.checked_in_at).toLocaleString()}
                    {v.checked_out_at && ` — ${new Date(v.checked_out_at).toLocaleTimeString()}`}
                  </p>
                  {v.notes && <p className="text-xs text-muted-foreground mt-1">{v.notes}</p>}
                </div>
                {v.latitude && (
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    📍 {v.latitude.toFixed(3)}, {v.longitude?.toFixed(3)}
                  </span>
                )}
                {!v.checked_out_at && (
                  <Button size="sm" variant="outline" onClick={() => checkOutMutation.mutate(v.id)}>
                    Check Out
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default VisitsPage;
