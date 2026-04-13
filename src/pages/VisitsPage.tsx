import React, { useState, useRef, useMemo } from 'react';
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
import { MapPin, Camera, Clock, CheckCircle2, XCircle, Navigation, Package, Eye, Plus, Minus, Search, Percent } from 'lucide-react';

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

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  assigned: { label: 'Assigned', color: 'bg-accent/10 text-accent border-accent/20', icon: Clock },
  checked_in: { label: 'Checked In', color: 'bg-primary/10 text-primary border-primary/20', icon: Navigation },
  verified: { label: 'Verified ✓', color: 'bg-success/10 text-success border-success/20', icon: CheckCircle2 },
  failed: { label: 'Location Mismatch', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
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
    return products.filter(p =>
      p.name.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const grabGPS = () => {
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsStatus('success');
        toast({
          title: 'Location acquired',
          description: `Accuracy: ±${Math.round(pos.coords.accuracy)}m`,
        });
      },
      (err) => {
        setGpsStatus('error');
        toast({ title: 'GPS Error', description: `Could not get location: ${err.message}`, variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
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

  const removeProduct = (productId: string) => {
    setOrderItems(prev => prev.filter(oi => oi.product_id !== productId));
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">My Visits</h1>
        <p className="text-muted-foreground mt-1">
          Visits assigned to you by your team lead
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="stat-card">
          <div className="text-center">
            <p className="text-2xl font-bold">{totalVisits}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="text-center">
            <p className="text-2xl font-bold text-success">{verified}</p>
            <p className="text-xs text-muted-foreground">Verified</p>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="text-center">
            <p className="text-2xl font-bold text-destructive">{failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="text-center">
            <p className="text-2xl font-bold text-warning">{pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
        </Card>
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
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(v.visit_status === 'verified' || v.visit_status === 'failed') && (
                        <Button size="sm" variant="outline" onClick={() => setViewDialog(v.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
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

      {/* View Visit Details Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={open => !open && setViewDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visit Details: {viewVisit?.customer_name}</DialogTitle>
          </DialogHeader>
          {viewVisit && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusConfig[viewVisit.visit_status]?.color}>
                    {statusConfig[viewVisit.visit_status]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Checked In</p>
                  <p className="font-medium">{new Date(viewVisit.checked_in_at).toLocaleString()}</p>
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
                  <p className="font-medium">📍 GPS Coordinates</p>
                  <p className="text-muted-foreground">
                    Target: {viewVisit.target_latitude?.toFixed(5)}, {viewVisit.target_longitude?.toFixed(5)}
                  </p>
                  <p className="text-muted-foreground">
                    Actual: {viewVisit.latitude.toFixed(5)}, {viewVisit.longitude?.toFixed(5)}
                  </p>
                  <p className="text-xs mt-1">
                    Distance: {Math.round(getDistanceMeters(viewVisit.latitude, viewVisit.longitude!, viewVisit.target_latitude!, viewVisit.target_longitude!))}m
                  </p>
                </div>
              )}

              {viewVisit.photo_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Photo</p>
                  <img src={viewVisit.photo_url} alt="Visit photo" className="rounded-lg max-h-48 object-cover w-full" />
                </div>
              )}

              {viewVisit.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewVisit.notes}</p>
                </div>
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

      {/* Check-In Dialog */}
      <Dialog open={!!checkInDialog} onOpenChange={open => !open && resetDialog()}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                  {gpsStatus === 'loading' ? 'Getting precise location...' : gpsStatus === 'success' ? `📍 ${coords!.lat.toFixed(5)}, ${coords!.lng.toFixed(5)} (±${Math.round(coords!.accuracy)}m)` : 'Get My Location'}
                </Button>
                {gpsStatus === 'success' && coords!.accuracy > 40 && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    ⚠️ Low GPS accuracy (±{Math.round(coords!.accuracy)}m). Try moving to an open area and tap again.
                  </p>
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
                  <div className="space-y-3 mt-2 p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Search Products</Label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by product name..."
                          value={productSearch}
                          onChange={e => setProductSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {filteredProducts.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-background cursor-pointer text-sm"
                          onClick={() => addProduct(p.id)}
                        >
                          <div>
                            <span className="font-medium">{p.name}</span>
                            <span className="text-muted-foreground ml-1">({p.unit})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">₹{Number(p.price)}</span>
                            <Plus className="h-4 w-4 text-primary" />
                          </div>
                        </div>
                      ))}
                      {filteredProducts.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {products.length === 0 ? 'No products available. Ask your team lead to add products.' : 'No matching products found.'}
                        </p>
                      )}
                    </div>

                    {orderItems.length > 0 && (
                      <div className="space-y-2 mt-2 border-t pt-2">
                        <Label className="text-xs font-semibold">Order Items</Label>
                        {orderItems.map(oi => (
                          <div key={oi.product_id} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                            <span className="font-medium">{oi.product_name}</span>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => updateQuantity(oi.product_id, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center font-medium">{oi.quantity}</span>
                              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => updateQuantity(oi.product_id, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                              <span className="text-muted-foreground ml-2 w-20 text-right">₹{(oi.price * oi.quantity).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}

                        <div className="text-right text-sm">
                          <span className="text-muted-foreground">Subtotal: </span>
                          <span className="font-medium">₹{subtotal.toLocaleString()}</span>
                        </div>

                        {/* Discount section */}
                        <div className="p-2 bg-background rounded space-y-2">
                          <div className="flex items-center gap-2">
                            <Percent className="h-4 w-4 text-muted-foreground" />
                            <Label className="text-xs">Bulk Discount (max 8%)</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              max="8"
                              step="0.5"
                              value={discountPercent || ''}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setDiscountPercent(Math.min(8, Math.max(0, val)));
                              }}
                              placeholder="0"
                              className="w-20 h-8 text-sm"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            {discountPercent > 0 && (
                              <span className="text-xs text-success ml-auto">-₹{discountAmount.toLocaleString()}</span>
                            )}
                          </div>
                          {discountPercent > 5 && (
                            <p className="text-xs text-warning">High discount applied — ensure bulk order qualifies.</p>
                          )}
                        </div>

                        <div className="flex justify-between text-sm font-bold pt-1 border-t">
                          <span>Grand Total</span>
                          <span>₹{grandTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    <Textarea
                      value={orderNotes}
                      onChange={e => setOrderNotes(e.target.value)}
                      placeholder="Additional order notes..."
                      rows={2}
                    />
                  </div>
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
