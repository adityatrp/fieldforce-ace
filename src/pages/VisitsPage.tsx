import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
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
import SignedImage from '@/components/SignedImage';
import { compressImage } from '@/lib/imageCompress';
import CameraCapture from '@/components/CameraCapture';
import { readBattery } from '@/lib/battery';
import { startBackgroundTracking, stopBackgroundTracking } from '@/lib/backgroundTracker';
import { upsertTodaySummary } from '@/lib/dailySummary';
import { workdayBounds } from '@/lib/workday';

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GPS_THRESHOLD_METERS = 40; // verification radius around target
const GPS_TARGET_ACCURACY = 10; // best-effort target; not enforced
const GPS_HARD_TIMEOUT_MS = 15000; // give the GPS chip up to 15s to converge

/**
 * Uses watchPosition to continuously sample GPS until accuracy <= target (10m)
 * or the hard timeout fires. Returns the best (lowest accuracy) reading seen.
 * Rejects only if no reading was received at all.
 */
function getPreciseLocation(
  targetAccuracy: number = GPS_TARGET_ACCURACY
): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;

    const finish = (err?: Error | GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(hardTimer);
      if (best) {
        resolve({
          lat: best.coords.latitude,
          lng: best.coords.longitude,
          accuracy: best.coords.accuracy,
        });
      } else if (err) {
        reject(err);
      } else {
        reject(new Error('Unable to acquire GPS fix'));
      }
    };

    const hardTimer = setTimeout(() => finish(), GPS_HARD_TIMEOUT_MS);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos;
        }
        // Once we hit target accuracy, stop watching and resolve.
        if (best.coords.accuracy <= targetAccuracy) {
          finish();
        }
      },
      (err) => {
        // Only reject if we never got a reading; otherwise let timeout return best
        if (!best) finish(err);
      },
      { enableHighAccuracy: true, timeout: GPS_HARD_TIMEOUT_MS, maximumAge: 0 }
    );
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
  const [extraPhotos, setExtraPhotos] = useState<{ file: File; caption: string }[]>([]);
  const [extraCameraOpen, setExtraCameraOpen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [orderReceived, setOrderReceived] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [mainCameraOpen, setMainCameraOpen] = useState(false);

  // Edit-order dialog state
  const [editOrderDialog, setEditOrderDialog] = useState<string | null>(null);

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

  const { data: visitExtraPhotos = [] } = useQuery({
    queryKey: ['visit-extra-photos', viewDialog],
    queryFn: async () => {
      if (!viewDialog) return [];
      const { data } = await supabase.from('visit_extra_photos').select('*').eq('visit_id', viewDialog).order('created_at');
      return data || [];
    },
    enabled: !!viewDialog,
  });

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  // Separate pending and completed visits, with overdue-first then optimized order
  const pendingVisits = useMemo(() => {
    const now = Date.now();
    // Active pending: assigned + has coords + scheduled_at <= now (or no schedule)
    const pending = visits.filter((v: any) =>
      v.visit_status === 'assigned' &&
      v.target_latitude && v.target_longitude &&
      (!v.scheduled_at || new Date(v.scheduled_at).getTime() <= now)
    );
    const overdueToday = pending.filter((v: any) => v.due_date && new Date(v.due_date).getTime() <= now + 24 * 3600 * 1000);
    const others = pending.filter((v: any) => !v.due_date || new Date(v.due_date).getTime() > now + 24 * 3600 * 1000);
    const sortedOverdue = [...overdueToday].sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    const optimized = currentLocation && dayStarted
      ? optimizeVisitOrder(currentLocation.lat, currentLocation.lng, others)
      : others;
    return [...sortedOverdue, ...optimized];
  }, [visits, currentLocation, dayStarted]);

  // Future scheduled visits (not yet active)
  const upcomingVisits = useMemo(() => {
    const now = Date.now();
    return visits.filter((v: any) =>
      v.visit_status === 'assigned' &&
      v.scheduled_at &&
      new Date(v.scheduled_at).getTime() > now
    ).sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [visits]);

  const completedVisits = useMemo(() => {
    return visits.filter(v => v.visit_status !== 'assigned');
  }, [visits]);

  // Auto-fail visits whose due date passed (no overdue allowed)
  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    const toFail = visits.filter((v: any) =>
      v.visit_status === 'assigned' &&
      v.assigned_to === user.id &&
      v.due_date &&
      new Date(v.due_date).getTime() < now &&
      !v.auto_failed
    );
    if (toFail.length === 0) return;
    (async () => {
      for (const v of toFail) {
        await supabase.from('visits').update({
          visit_status: 'failed',
          auto_failed: true,
          notes: (v.notes ? v.notes + ' | ' : '') + 'Auto-failed: not checked in by due date',
        } as any).eq('id', v.id);
      }
      queryClient.invalidateQueries({ queryKey: ['visits'] });
    })();
  }, [visits, user, queryClient]);

  // Today's attendance: workday window is 5 AM → 5 AM (not midnight).
  const { data: todayPunch } = useQuery({
    queryKey: ['attendance-today', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { start, end } = workdayBounds();
      const { data } = await supabase
        .from('attendance_punches')
        .select('*')
        .eq('user_id', user.id)
        .gte('punched_in_at', start.toISOString())
        .lt('punched_in_at', end.toISOString())
        .order('punched_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (todayPunch && !todayPunch.punched_out_at) {
      setDayStarted(true);
      if (todayPunch.punch_in_latitude && todayPunch.punch_in_longitude) {
        setCurrentLocation({
          lat: todayPunch.punch_in_latitude,
          lng: todayPunch.punch_in_longitude,
          accuracy: todayPunch.punch_in_accuracy ?? 0,
        });
      }
      // Resume background tracker if app was reloaded mid-day.
      if (user) startBackgroundTracking(user.id);
    }
  }, [todayPunch, user]);

  const handleStartDay = useCallback(async () => {
    // Once-per-workday guard: if a punch already exists in this 5 AM window, refuse.
    if (todayPunch) {
      toast({
        title: 'Already punched in today',
        description: todayPunch.punched_out_at
          ? 'You have already completed your day. Resets at 5:00 AM.'
          : "You're already punched in.",
        variant: 'destructive',
      });
      return;
    }
    setPunchingIn(true);
    try {
      const loc = await getPreciseLocation();
      const battery = await readBattery();
      setCurrentLocation(loc);
      setDayStarted(true);
      // Persist punch-in
      await supabase.from('attendance_punches').insert({
        user_id: user!.id,
        punch_in_latitude: loc.lat,
        punch_in_longitude: loc.lng,
        punch_in_accuracy: loc.accuracy,
        battery_percent_in: battery.percent,
      });
      // Also log a starting location ping
      await supabase.from('location_logs').insert({
        user_id: user!.id,
        latitude: loc.lat,
        longitude: loc.lng,
        accuracy: loc.accuracy,
        battery_percent: battery.percent,
        battery_charging: battery.charging,
        source: 'punch_in',
      });
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      // Kick off the 5-min background tracker (native: works with screen off).
      startBackgroundTracking(user!.id);
      toast({
        title: '🚀 Punched In!',
        description: `Tracking started (±${Math.round(loc.accuracy)}m). You can punch out at end of day.`,
      });
    } catch (err: any) {
      toast({ title: 'GPS Error', description: err.message || 'Could not get location', variant: 'destructive' });
    } finally {
      setPunchingIn(false);
    }
  }, [toast, user, queryClient, todayPunch]);

  const handleEndDay = useCallback(async () => {
    if (!todayPunch || todayPunch.punched_out_at) return;
    setPunchingIn(true);
    try {
      const loc = await getPreciseLocation();
      const battery = await readBattery();
      await supabase.from('attendance_punches').update({
        punched_out_at: new Date().toISOString(),
        punch_out_latitude: loc.lat,
        punch_out_longitude: loc.lng,
        punch_out_accuracy: loc.accuracy,
        battery_percent_out: battery.percent,
      }).eq('id', todayPunch.id);
      await supabase.from('location_logs').insert({
        user_id: user!.id,
        latitude: loc.lat,
        longitude: loc.lng,
        accuracy: loc.accuracy,
        battery_percent: battery.percent,
        battery_charging: battery.charging,
        source: 'punch_out',
      });
      setDayStarted(false);
      setCurrentLocation(null);
      // Stop background tracker and write the day's summary row.
      await stopBackgroundTracking();
      await upsertTodaySummary(user!.id, {
        punched_in_at: todayPunch.punched_in_at,
        punched_out_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      toast({ title: '👋 Punched Out', description: 'Tracking stopped. Have a good evening!' });
    } catch (err: any) {
      toast({ title: 'GPS Error', description: err.message, variant: 'destructive' });
    } finally {
      setPunchingIn(false);
    }
  }, [todayPunch, toast, user, queryClient]);

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
      if (role === 'salesperson' && !dayStarted) {
        throw new Error('Punch in for the day before checking into a visit.');
      }
      if (!coords) throw new Error('GPS location required');

      const visit = visits.find(v => v.id === visitId);
      if (!visit) throw new Error('Visit not found');

      let photoUrl = '';
      if (photo) {
        const compressed = await compressImage(photo);
        const path = `visits/${user!.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('photos').upload(path, compressed);
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

      // Upload optional extra photos with captions
      if (extraPhotos.length > 0) {
        const extraRows: { visit_id: string; photo_path: string; caption: string }[] = [];
        for (let i = 0; i < extraPhotos.length; i++) {
          const ep = extraPhotos[i];
          try {
            const compressedExtra = await compressImage(ep.file);
            const epPath = `visits/${user!.id}/${Date.now()}_extra_${i}.jpg`;
            const { error: epErr } = await supabase.storage.from('photos').upload(epPath, compressedExtra);
            if (epErr) continue;
            extraRows.push({ visit_id: visitId, photo_path: epPath, caption: ep.caption || '' });
          } catch { /* skip failed extras */ }
        }
        if (extraRows.length > 0) {
          await supabase.from('visit_extra_photos').insert(extraRows);
        }
      }

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

      // Log location ping for distance/route history (best-effort, non-blocking)
      try {
        const battery = await readBattery();
        await supabase.from('location_logs').insert({
          user_id: user!.id,
          visit_id: visitId,
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: coords.accuracy,
          battery_percent: battery.percent,
          battery_charging: battery.charging,
          source: 'visit_check_in',
        });
      } catch { /* never block check-in on logging */ }

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


  const editOrderMutation = useMutation({
    mutationFn: async (visitId: string) => {
      // Replace existing items with the new cart
      await supabase.from('visit_order_items').delete().eq('visit_id', visitId);
      const finalDiscount = discountPercent;
      if (orderItems.length > 0) {
        const discountMultiplier = 1 - (finalDiscount / 100);
        const items = orderItems.map(oi => ({
          visit_id: visitId,
          product_id: oi.product_id,
          quantity: oi.quantity,
          price_at_order: Math.round(oi.price * discountMultiplier * 100) / 100,
        }));
        const { error: insErr } = await supabase.from('visit_order_items').insert(items);
        if (insErr) throw insErr;
      }
      const { error } = await supabase.from('visits').update({
        order_received: orderItems.length > 0,
        order_notes: orderNotes + (finalDiscount > 0 ? ` | Discount: ${finalDiscount}%` : ''),
      }).eq('id', visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['visit-order-items'] });
      toast({ title: 'Order updated successfully' });
      setEditOrderDialog(null);
      setOrderItems([]); setOrderNotes(''); setDiscountPercent(0); setProductSearch('');
    },
    onError: (err: Error) => toast({ title: 'Failed to update order', description: err.message, variant: 'destructive' }),
  });

  const openEditOrder = async (v: any) => {
    setEditOrderDialog(v.id);
    const { data: existing } = await supabase
      .from('visit_order_items')
      .select('*, products(name, price)')
      .eq('visit_id', v.id);
    if (existing) {
      setOrderItems(existing.map((it: any) => ({
        product_id: it.product_id,
        product_name: it.products?.name || 'Product',
        quantity: Number(it.quantity),
        price: Number(it.price_at_order),
      })));
    }
    setOrderNotes((v.order_notes || '').replace(/\s*\|\s*Discount:.*/, ''));
    setDiscountPercent(0);
    setProductSearch('');
  };

  const resetDialog = () => {
    setCheckInDialog(null);
    setNotes('');
    setPhoto(null);
    setExtraPhotos([]);
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
    const dueMs = v.due_date ? new Date(v.due_date).getTime() : null;
    const now = Date.now();
    const isOverdueToday = dueMs && dueMs <= now + 24 * 3600 * 1000 && v.visit_status === 'assigned';
    const isPastDue = dueMs && dueMs < now && v.visit_status === 'assigned';
    const scheduledMs = v.scheduled_at ? new Date(v.scheduled_at).getTime() : null;
    const isUpcoming = scheduledMs && scheduledMs > now && v.visit_status === 'assigned';

    return (
      <Card key={v.id} className={`field-card ${isOverdueToday ? 'border-warning/50 bg-warning/5' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${v.visit_status === 'verified' ? 'bg-success/10' : v.visit_status === 'failed' ? 'bg-destructive/10' : 'bg-accent/10'}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{v.customer_name}</p>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>{config.label}</Badge>
                {v.order_received && (() => {
                  const s = (v as any).order_approval_status || 'pending';
                  const cls = s === 'approved'
                    ? 'bg-success/10 text-success border-success/20'
                    : s === 'rejected'
                      ? 'bg-destructive/10 text-destructive border-destructive/20'
                      : 'bg-warning/10 text-warning border-warning/30';
                  return (
                    <Badge variant="outline" className={`${cls} text-[10px] px-1.5 py-0`}>
                      <Package className="h-3 w-3 mr-0.5" /> Order · {s}
                    </Badge>
                  );
                })()}
                {isOverdueToday && (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0">
                    {isPastDue ? '⚠ Past due' : '⏰ Due today'}
                  </Badge>
                )}
                {isUpcoming && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                    📅 {new Date(scheduledMs).toLocaleDateString()}
                  </Badge>
                )}
              </div>
              {v.location_name && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">📍 {v.location_name}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString()}
                </p>
                {dueMs && (
                  <p className="text-xs text-muted-foreground">
                    · Due {new Date(dueMs).toLocaleDateString()}
                  </p>
                )}
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
              {v.visit_status === 'verified' && role === 'salesperson' && (
                <Button size="sm" variant="outline" className="h-9 native-btn rounded-xl text-xs" onClick={() => openEditOrder(v)}>
                  <Package className="h-3.5 w-3.5 mr-1" />
                  Edit Order
                </Button>
              )}
              {v.visit_status === 'assigned' && role === 'salesperson' && !isUpcoming && (
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

      {/* Daily Punch In/Out for salesperson — once per workday (resets at 5 AM) */}
      {role === 'salesperson' && !dayStarted && !todayPunch?.punched_out_at && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Play className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Punch In for the Day</p>
                <p className="text-xs text-muted-foreground">
                  One punch in & out per day. Resets at 5:00 AM.
                </p>
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

      {/* Day started indicator + Punch Out */}
      {role === 'salesperson' && dayStarted && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success/10 text-success text-sm font-medium">
          <Route className="h-4 w-4" />
          <span>Punched in • {pending} visit{pending !== 1 ? 's' : ''} remaining</span>
          {currentLocation && (
            <span className="text-xs text-success/70 ml-2">±{Math.round(currentLocation.accuracy)}m</span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 rounded-lg text-xs"
            onClick={handleEndDay}
            disabled={punchingIn}
          >
            {punchingIn ? '…' : 'Punch Out'}
          </Button>
        </div>
      )}

      {/* Day completed — already punched in & out today */}
      {role === 'salesperson' && !dayStarted && todayPunch?.punched_out_at && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          <span>
            Day completed •{' '}
            {new Date(todayPunch.punched_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' → '}
            {new Date(todayPunch.punched_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="ml-auto text-xs">Resets 5:00 AM</span>
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

          {/* Upcoming scheduled visits */}
          {upcomingVisits.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Upcoming (Scheduled)</h3>
              </div>
              <div className="space-y-2">
                {upcomingVisits.map(renderVisitCard)}
              </div>
            </div>
          )}

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
                  <p className="text-xs text-muted-foreground break-all">
                    Target: {viewVisit.target_latitude?.toFixed(7)}, {viewVisit.target_longitude?.toFixed(7)}
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    Actual: {viewVisit.latitude.toFixed(7)}, {viewVisit.longitude?.toFixed(7)}
                  </p>
                  <p className="text-xs mt-1 font-medium">
                    Distance: {Math.round(getDistanceMeters(viewVisit.latitude, viewVisit.longitude!, viewVisit.target_latitude!, viewVisit.target_longitude!))}m
                  </p>
                </div>
              )}

              {viewVisit.photo_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Primary Photo</p>
                  <SignedImage path={viewVisit.photo_url} alt="Visit photo" className="rounded-xl max-h-48 object-cover w-full" />
                </div>
              )}

              {visitExtraPhotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Additional Photos ({visitExtraPhotos.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {visitExtraPhotos.map((ep: any) => (
                      <div key={ep.id} className="space-y-1">
                        <SignedImage path={ep.photo_path} alt={ep.caption || 'Extra photo'} className="rounded-xl h-28 object-cover w-full" />
                        {ep.caption && <p className="text-[10px] text-muted-foreground line-clamp-2">{ep.caption}</p>}
                      </div>
                    ))}
                  </div>
                </div>
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
                <p className="text-xs text-muted-foreground break-all">
                  {selectedVisit.target_latitude?.toFixed(7)}, {selectedVisit.target_longitude?.toFixed(7)}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Your GPS Location</Label>
                <Button type="button" variant="outline" className="w-full gap-2 h-11 rounded-xl native-btn" onClick={grabGPS} disabled={gpsStatus === 'loading'}>
                  <Navigation className="h-4 w-4" />
                  {gpsStatus === 'loading' ? 'Locating…' : gpsStatus === 'success' ? `📍 ${coords!.lat.toFixed(7)}, ${coords!.lng.toFixed(7)} (±${Math.round(coords!.accuracy)}m)` : 'Get My Location'}
                </Button>
                {gpsStatus === 'success' && (
                  <p className="text-[11px] text-muted-foreground">Tap again to refresh your location for a better fix.</p>
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
                <Label className="text-xs">Photo (required)</Label>
                <Button type="button" variant="outline" className="w-full h-14 gap-2 rounded-xl native-btn" onClick={() => setMainCameraOpen(true)}>
                  <Camera className="h-5 w-5" />
                  {photo ? '✓ Photo Captured — Retake' : 'Open Camera'}
                </Button>
                <p className="text-[10px] text-muted-foreground">Live camera only. Gallery uploads are disabled.</p>
              </div>

              {/* Optional additional photos with captions (up to 5) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Additional Photos (optional, up to 5)</Label>
                  <span className="text-[10px] text-muted-foreground">{extraPhotos.length}/5</span>
                </div>
                {extraPhotos.length < 5 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 gap-2 rounded-xl native-btn text-xs"
                    onClick={() => setExtraCameraOpen(true)}
                  >
                    <Camera className="h-4 w-4" /> Capture Another Photo
                  </Button>
                )}
                {extraPhotos.length > 0 && (
                  <div className="space-y-2">
                    {extraPhotos.map((ep, idx) => (
                      <div key={idx} className="p-2 bg-muted/50 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium truncate flex-1">📷 {ep.file.name}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-lg text-destructive"
                            onClick={() => setExtraPhotos(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Input
                          value={ep.caption}
                          onChange={e => {
                            const v = e.target.value;
                            setExtraPhotos(prev => prev.map((p, i) => i === idx ? { ...p, caption: v } : p));
                          }}
                          placeholder="Describe this photo..."
                          className="h-8 text-xs rounded-lg"
                          maxLength={200}
                        />
                      </div>
                    ))}
                  </div>
                )}
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

      {/* Edit Order Dialog (verified visits only) */}
      <Dialog open={!!editOrderDialog} onOpenChange={open => !open && setEditOrderDialog(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-muted-foreground">Visit details are locked. You can only update the order.</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9 rounded-xl" />
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1">
              {filteredProducts.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-muted cursor-pointer text-sm" onClick={() => addProduct(p.id)}>
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
            </div>
            {orderItems.length > 0 && (
              <div className="space-y-2 border-t pt-2">
                {orderItems.map(oi => (
                  <div key={oi.product_id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded-xl">
                    <span className="font-medium text-xs">{oi.product_name}</span>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => updateQuantity(oi.product_id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center font-semibold text-xs">{oi.quantity}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => updateQuantity(oi.product_id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-xs text-muted-foreground ml-1 w-16 text-right">₹{(oi.price * oi.quantity).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-1 border-t">
                  <span>Total</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
              </div>
            )}
            <Textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Order notes..." rows={2} className="rounded-xl" />
            <Button className="w-full h-11 rounded-xl" disabled={editOrderMutation.isPending} onClick={() => editOrderMutation.mutate(editOrderDialog!)}>
              {editOrderMutation.isPending ? 'Saving...' : 'Save Order'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Live camera capture dialogs (gallery uploads disabled) */}
      <CameraCapture
        open={mainCameraOpen}
        onClose={() => setMainCameraOpen(false)}
        onCapture={(file) => setPhoto(file)}
        title="Check-in Photo"
      />
      <CameraCapture
        open={extraCameraOpen}
        onClose={() => setExtraCameraOpen(false)}
        onCapture={(file) => {
          if (extraPhotos.length < 5) setExtraPhotos(prev => [...prev, { file, caption: '' }]);
        }}
        title="Additional Photo"
      />
    </div>
  );
};

export default VisitsPage;