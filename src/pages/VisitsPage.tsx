import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Camera, Clock, CheckCircle2, XCircle, Navigation, Package, Eye, Plus, Minus, Search, Percent, Play, LocateFixed, Route } from 'lucide-react';

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GPS_THRESHOLD_METERS = 40;

function getPreciseLocation(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    let bestResult: GeolocationPosition | null = null;
    let attempts = 0;
    const maxAttempts = 3;

    const tryGet = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          attempts++;
          if (!bestResult || pos.coords.accuracy < bestResult.coords.accuracy) {
            bestResult = pos;
          }
          if (pos.coords.accuracy <= 10 || attempts >= maxAttempts) {
            resolve({
              lat: bestResult!.coords.latitude,
              lng: bestResult!.coords.longitude,
              accuracy: bestResult!.coords.accuracy,
            });
          } else {
            setTimeout(tryGet, 500);
          }
        },
        (err) => {
          if (bestResult) {
            resolve({
              lat: bestResult.coords.latitude,
              lng: bestResult.coords.longitude,
              accuracy: bestResult.coords.accuracy,
            });
          } else {
            reject(err);
          }
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    };
    tryGet();
  });
}

// Nearest-neighbor greedy optimization for visit order
function optimizeVisitOrder(
  currentLat: number,
  currentLng: number,
  pendingVisits: any[]
): any[] {
  if (pendingVisits.length <= 1) return pendingVisits;
  const remaining = [...pendingVisits];
  const ordered: any[] = [];
  let lat = currentLat;
  let lng = currentLng;

  while (remaining.length > 0) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = getDistanceMeters(lat, lng, remaining[i].target_latitude, remaining[i].target_longitude);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    ordered.push(remaining[nearest]);
    lat = remaining[nearest].target_latitude;
    lng = remaining[nearest].target_longitude;
    remaining.splice(nearest, 1);
  }
  return ordered;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  assigned: { label: 'Pending', color: 'bg-accent/10 text-accent border-accent/20', icon: Clock },
  checked_in: { label: 'Checked In', color: 'bg-primary/10 text-primary border-primary/20', icon: Navigation },
  verified: { label: 'Verified', color: 'bg-success/10 text-success border-success/20', icon: CheckCircle2 },
  failed: { label: 'Mismatch', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
};

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

const VisitsPage: React.FC = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checkInDialog, setCheckInDialog] = useState<string | null>(null);
  const [viewDialog, setViewDialog] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [orderReceived, setOrderReceived] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Day start punch-in state
  const [dayStarted, setDayStarted] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [punchingIn, setPunchingIn] = useState(false);

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

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('active', true);
      return data || [];
    },
    enabled: !!user && role === 'salesperson',
  });

  const { data: visitOrderItems = [] } = useQuery({
    queryKey: ['visit-order-items', viewDialog],
    queryFn: async () => {
      if (!viewDialog) return [];
      const { data } = await supabase.from('visit_order_items').select('*, products(name, unit)').eq('visit_id', viewDialog);
      return data || [];
    },
    enabled: !!viewDialog,
  });

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  // Separate pending and completed visits, optimize pending order
  const pendingVisits = useMemo(() => {
    const pending = visits.filter(v => v.visit_status === 'assigned' && v.target_latitude && v.target_longitude);
    if (currentLocation && dayStarted) {
      return optimizeVisitOrder(currentLocation.lat, currentLocation.lng, pending);
    }
    return pending;
  }, [visits, currentLocation, dayStarted]);

  const completedVisits = useMemo(() => {
    return visits.filter(v => v.visit_status !== 'assigned');
  }, [visits]);

  const handleStartDay = useCallback(async () => {
    setPunchingIn(true);
    try {
      const loc = await getPreciseLocation();
      setCurrentLocation(loc);
      setDayStarted(true);
      toast({
        title: '🚀 Day Started!',
        description: `Location locked (±${Math.round(loc.accuracy)}m). Visits optimized by route.`,
      });
    } catch (err: any) {
      toast({ title: 'GPS Error', description: err.message || 'Could not get location', variant: 'destructive' });
    } finally {
      setPunchingIn(false);
    }
  }, [toast]);

  const grabGPS = async () => {
    setGpsStatus('loading');
    try {
      const loc = await getPreciseLocation();
      setCoords(loc);
      setGpsStatus('success');
      toast({
        title: 'Location acquired',
        description: `Accuracy: ±${Math.round(loc.accuracy)}m`,
      });
    } catch (err: any) {
      setGpsStatus('error');
      toast({ title: 'GPS Error', description: err.message || 'Could not get location', variant: 'destructive' });
    }
  };

  const addProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = orderItems.find(oi => oi.product_id === productId);
    if (existing) {
      setOrderItems(orderItems.map(oi => oi.product_id === productId ? { ...oi, quantity: oi.quantity + 1 } : oi));
    } else {
      setOrderItems([...orderItems, { product_id: productId, product_name: product.name, quantity: 1, price: Number(product.price) }]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setOrderItems(prev => prev.map(oi => {
      if (oi.product_id !== productId) return oi;
      const newQty = oi.quantity + delta;
      return newQty > 0 ? { ...oi, quantity: newQty } : oi;
    }).filter(oi => oi.quantity > 0));
  };

  const subtotal = orderItems.reduce((s, oi) => s + oi.price * oi.quantity, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const grandTotal = subtotal - discountAmount;

  const checkInMutation = useMutation({
    mutationFn: async (visitId: string) => {
      if (!coords) throw new Error('GPS location required');

      const visit = visits.find(v => v.id === visitId);
      if (!visit) throw new Error('Visit not found');

      let photoUrl = '';
      if (photo) {
        const ext = photo.name.split('.').pop();
        const path = `visits/${user!.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('photos').upload(path, photo);
        if (uploadError) {
          throw new Error(`Could not upload visit photo: ${uploadError.message}`);
        }
        // Store the storage path; viewers resolve to short-lived signed URLs.
        photoUrl = path;
      }

      const distance = getDistanceMeters(
        coords.lat, coords.lng,
        visit.target_latitude!, visit.target_longitude!
      );

      const isVerified = distance <= GPS_THRESHOLD_METERS;
      const now = new Date().toISOString();
      const finalDiscount = orderReceived && orderItems.length > 0 ? discountPercent : 0;

      const { error } = await supabase.from('visits').update({
        checked_in_at: now,
        latitude: coords.lat,
        longitude: coords.lng,
        photo_url: photoUrl || undefined,
        notes,
        visit_status: isVerified ? 'verified' : 'failed',
        order_received: orderReceived && orderItems.length > 0,
        order_notes: orderNotes + (finalDiscount > 0 ? ` | Discount: ${finalDiscount}%` : ''),
      }).eq('id', visitId);

      if (error) throw error;

      if (orderReceived && orderItems.length > 0) {
        const discountMultiplier = 1 - (finalDiscount / 100);
        const items = orderItems.map(oi => ({
          visit_id: visitId,
          product_id: oi.product_id,
          quantity: oi.quantity,
          price_at_order: Math.round(oi.price * discountMultiplier * 100) / 100,
        }));
        await supabase.from('visit_order_items').insert(items);
      }

      return { isVerified, distance: Math.round(distance) };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      if (result.isVerified) {
        toast({ title: '✅ Visit Verified!', description: `Within ${result.distance}m of target.` });
      } else {
        toast({
          title: '❌ Location Mismatch',
          description: `${result.distance}m away (max ${GPS_THRESHOLD_METERS}m).`,
          variant: 'destructive',
        });
      }
      // Re-optimize route after check-in
      if (dayStarted) {
        try {
          const loc = await getPreciseLocation();
          setCurrentLocation(loc);
        } catch { /* keep old location */ }
      }
      resetDialog();
    },
    onError: (err: Error) => toast({ title: 'Check-in failed', description: err.message, variant: 'destructive' }),
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
      toast({ title: 'Checked out successfully' });
    },
  });

  const resetDialog = () => {
    setCheckInDialog(null);
    setNotes('');
    setPhoto(null);
    setCoords(null);
    setGpsStatus('idle');
    setOrderReceived(false);
    setOrderItems([]);
    setOrderNotes('');
    setProductSearch('');
    setDiscountPercent(0);
  };

  const selectedVisit = visits.find(v => v.id === checkInDialog);
  const viewVisit = visits.find(v => v.id === viewDialog);

  const totalVisits = visits.length;
  const verified = visits.filter(v => v.visit_status === 'verified').length;
  const failed = visits.filter(v => v.visit_status === 'failed').length;
  const pending = visits.filter(v => v.visit_status === 'assigned').length;

  const renderVisitCard = (v: any) => {
    const config = statusConfig[v.visit_status] || statusConfig.assigned;
    const StatusIcon = config.icon;
    const distFromCurrent = currentLocation && v.target_latitude
      ? Math.round(getDistanceMeters(currentLocation.lat, currentLocation.lng, v.target_latitude, v.target_longitude))
      : null;

    return (
      <Card key={v.id} className="field-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${v.visit_status === 'verified' ? 'bg-success/10' : v.visit_status === 'failed' ? 'bg-destructive/10' : 'bg-accent/10'}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{v.customer_name}</p>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>{config.label}</Badge>
                {v.order_received && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px] px-1.5 py-0">
                    <Package className="h-3 w-3 mr-0.5" /> Order
                  </Badge>
                )}
              </div>
              {v.location_name && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">📍 {v.location_name}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString()}
                </p>
                {distFromCurrent !== null && v.visit_status === 'assigned' && (
                  <span className="text-xs text-primary font-medium">{distFromCurrent < 1000 ? `${distFromCurrent}m away` : `${(distFromCurrent / 1000).toFixed(1)}km away`}</span>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {(v.visit_status === 'verified' || v.visit_status === 'failed') && (
                <Button size="sm" variant="ghost" className="h-9 w-9 p-0 native-btn" onClick={() => setViewDialog(v.id)}>
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              {v.visit_status === 'assigned' && role === 'salesperson' && (
                <Button size="sm" className="h-9 native-btn rounded-xl text-xs" onClick={() => setCheckInDialog(v.id)}>
                  <Navigation className="h-3.5 w-3.5 mr-1" />
                  Check In
                </Button>
              )}
              {(v.visit_status === 'verified' || v.visit_status === 'checked_in') && !v.checked_out_at && (
                <Button size="sm" variant="outline" className="h-9 native-btn rounded-xl text-xs" onClick={() => checkOutMutation.mutate(v.id)}>
                  Check Out
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-header">My Visits</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {role === 'salesperson' ? 'Visits assigned by your team lead' : 'All visits overview'}
        </p>
      </div>

      {/* Start Day Button for salesperson */}
      {role === 'salesperson' && !dayStarted && pending > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Play className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Start Your Day</p>
                <p className="text-xs text-muted-foreground">Punch in your location to optimize {pending} pending visit{pending > 1 ? 's' : ''} by shortest route.</p>
              </div>
              <Button
                className="h-10 rounded-xl native-btn"
                onClick={handleStartDay}
                disabled={punchingIn}
              >
                <LocateFixed className="h-4 w-4 mr-1.5" />
                {punchingIn ? 'Locating...' : 'Punch In'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day started indicator */}
      {dayStarted && currentLocation && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success/10 text-success text-sm font-medium">
          <Route className="h-4 w-4" />
          Route optimized • {pending} visit{pending !== 1 ? 's' : ''} remaining
          <span className="text-xs text-success/70 ml-auto">±{Math.round(currentLocation.accuracy)}m</span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { v: totalVisits, l: 'Total', c: '' },
          { v: verified, l: 'Verified', c: 'text-success' },
          { v: failed, l: 'Failed', c: 'text-destructive' },
          { v: pending, l: 'Pending', c: 'text-warning' },
        ].map(s => (
          <Card key={s.l} className="stat-card text-center py-3 px-2">
            <p className={`text-xl font-bold ${s.c}`}>{s.v}</p>
            <p className="text-[10px] text-muted-foreground">{s.l}</p>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading visits...</div>
      ) : visits.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-sm">No visits assigned yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Pending visits (optimized) */}
          {pendingVisits.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Clock className="h-4 w-4 text-warning" />
                <h3 className="text-sm font-semibold">Pending Visits</h3>
                {dayStarted && <span className="text-[10px] text-muted-foreground ml-auto">Sorted by nearest</span>}
              </div>
              <div className="space-y-2">
                {pendingVisits.map(renderVisitCard)}
              </div>
            </div>
          )}

          {/* Completed visits */}
          {completedVisits.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <h3 className="text-sm font-semibold">Completed</h3>
              </div>
              <div className="space-y-2">
                {completedVisits.map(renderVisitCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* View Visit Details Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={open => !open && setViewDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{viewVisit?.customer_name}</DialogTitle>
          </DialogHeader>
          {viewVisit && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant="outline" className={statusConfig[viewVisit.visit_status]?.color}>
                    {statusConfig[viewVisit.visit_status]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Checked In</p>
                  <p className="font-medium text-sm">{new Date(viewVisit.checked_in_at).toLocaleString()}</p>
                </div>
                {viewVisit.checked_out_at && (
                  <div>
                    <p className="text-muted-foreground text-xs">Checked Out</p>
                    <p className="font-medium text-sm">{new Date(viewVisit.checked_out_at).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Location</p>
                  <p className="font-medium text-sm">{viewVisit.location_name || 'N/A'}</p>
                </div>
              </div>

              {viewVisit.latitude && (
                <div className="p-3 bg-muted/50 rounded-xl text-sm">
                  <p className="font-medium text-xs">📍 GPS</p>
                  <p className="text-xs text-muted-foreground">
                    Target: {viewVisit.target_latitude?.toFixed(6)}, {viewVisit.target_longitude?.toFixed(6)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Actual: {viewVisit.latitude.toFixed(6)}, {viewVisit.longitude?.toFixed(6)}
                  </p>
                  <p className="text-xs mt-1 font-medium">
                    Distance: {Math.round(getDistanceMeters(viewVisit.latitude, viewVisit.longitude!, viewVisit.target_latitude!, viewVisit.target_longitude!))}m
                  </p>
                </div>
              )}

              {viewVisit.photo_url && (
                <img src={viewVisit.photo_url} alt="Visit photo" className="rounded-xl max-h-48 object-cover w-full" />
              )}

              {viewVisit.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewVisit.notes}</p>
                </div>
              )}

              {viewVisit.order_received && (
                <div>
                  <p className="text-sm font-medium text-success mb-2">📦 Order</p>
                  {visitOrderItems.length > 0 && (
                    <div className="space-y-1">
                      {visitOrderItems.map((item: any) => (
                        <div key={item.id} className="flex justify-between text-sm p-2 bg-muted/50 rounded-xl">
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

      {/* Check-In Dialog */}
      <Dialog open={!!checkInDialog} onOpenChange={open => !open && resetDialog()}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Check In: {selectedVisit?.customer_name}</DialogTitle>
          </DialogHeader>
          {selectedVisit && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-muted/50 rounded-xl text-sm">
                <p className="font-medium text-xs">📍 Target Location</p>
                <p className="text-muted-foreground text-sm">{selectedVisit.location_name || 'No name'}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedVisit.target_latitude?.toFixed(6)}, {selectedVisit.target_longitude?.toFixed(6)}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Your GPS Location</Label>
                <Button type="button" variant="outline" className="w-full gap-2 h-11 rounded-xl native-btn" onClick={grabGPS} disabled={gpsStatus === 'loading'}>
                  <Navigation className="h-4 w-4" />
                  {gpsStatus === 'loading' ? 'Getting precise location...' : gpsStatus === 'success' ? `📍 ${coords!.lat.toFixed(6)}, ${coords!.lng.toFixed(6)} (±${Math.round(coords!.accuracy)}m)` : 'Get My Location'}
                </Button>
                {gpsStatus === 'success' && coords!.accuracy > 40 && (
                  <p className="text-xs text-warning">⚠️ Low accuracy (±{Math.round(coords!.accuracy)}m). Move to open area.</p>
                )}
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
                <Label className="text-xs">Photo</Label>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                <Button type="button" variant="outline" className="w-full h-14 gap-2 rounded-xl native-btn" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-5 w-5" />
                  {photo ? photo.name : 'Take Photo'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Visit notes..." rows={2} className="rounded-xl" />
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
                  <Label htmlFor="orderReceived" className="text-sm">Order Received</Label>
                </div>
                {orderReceived && (
                  <div className="space-y-3 mt-2 p-3 bg-muted/50 rounded-xl">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search products..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        className="pl-9 rounded-xl"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {filteredProducts.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-background cursor-pointer text-sm native-btn"
                          onClick={() => addProduct(p.id)}
                        >
                          <div>
                            <span className="font-medium">{p.name}</span>
                            <span className="text-muted-foreground text-xs ml-1">({p.unit})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">₹{Number(p.price)}</span>
                            <Plus className="h-4 w-4 text-primary" />
                          </div>
                        </div>
                      ))}
                      {filteredProducts.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {products.length === 0 ? 'No products available.' : 'No match.'}
                        </p>
                      )}
                    </div>

                    {orderItems.length > 0 && (
                      <div className="space-y-2 mt-2 border-t pt-2">
                        <Label className="text-xs font-semibold">Cart</Label>
                        {orderItems.map(oi => (
                          <div key={oi.product_id} className="flex items-center justify-between text-sm p-2 bg-background rounded-xl">
                            <span className="font-medium text-xs">{oi.product_name}</span>
                            <div className="flex items-center gap-1.5">
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg native-btn" onClick={() => updateQuantity(oi.product_id, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center font-semibold text-xs">{oi.quantity}</span>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg native-btn" onClick={() => updateQuantity(oi.product_id, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                              <span className="text-xs text-muted-foreground ml-1 w-16 text-right">₹{(oi.price * oi.quantity).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}

                        <div className="text-right text-xs">
                          <span className="text-muted-foreground">Subtotal: </span>
                          <span className="font-medium">₹{subtotal.toLocaleString()}</span>
                        </div>

                        <div className="p-2 bg-background rounded-xl space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                            <Label className="text-xs">Bulk Discount (max 8%)</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number" min="0" max="8" step="0.5"
                              value={discountPercent || ''}
                              onChange={e => setDiscountPercent(Math.min(8, Math.max(0, parseFloat(e.target.value) || 0)))}
                              placeholder="0" className="w-16 h-8 text-sm rounded-lg"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            {discountPercent > 0 && <span className="text-xs text-success ml-auto">-₹{discountAmount.toLocaleString()}</span>}
                          </div>
                        </div>

                        <div className="flex justify-between text-sm font-bold pt-1 border-t">
                          <span>Total</span>
                          <span>₹{grandTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    <Textarea
                      value={orderNotes}
                      onChange={e => setOrderNotes(e.target.value)}
                      placeholder="Order notes..."
                      rows={2}
                      className="rounded-xl"
                    />
                  </div>
                )}
              </div>

              <Button
                className="w-full h-12 text-sm font-semibold rounded-xl native-btn"
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