import React, { useEffect, useState, useCallback } from 'react';
import { Bell, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type FailedVisitNotif = {
  id: string;
  visitId: string;
  shopName: string;
  salespersonName: string;
  submittedAt: string; // ISO
  read: boolean;
};

const STORAGE_KEY_PREFIX = 'ff_failed_visit_notifs_';
const READ_KEY_PREFIX = 'ff_failed_visit_read_';
const MAX_NOTIFS = 50;

const FailedVisitNotifications: React.FC = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<FailedVisitNotif[]>([]);

  const storageKey = user ? `${STORAGE_KEY_PREFIX}${user.id}` : '';
  const readKey = user ? `${READ_KEY_PREFIX}${user.id}` : '';

  // Load cached notifications
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setNotifs(JSON.parse(raw));
    } catch {}
  }, [user, storageKey]);

  // Persist
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(notifs.slice(0, MAX_NOTIFS)));
    } catch {}
  }, [notifs, user, storageKey]);

  const enrichAndAdd = useCallback(
    async (visit: any) => {
      if (!visit?.id) return;
      // Avoid duplicates
      if (notifs.some(n => n.visitId === visit.id)) return;

      let shopName = visit.customer_name || 'Unknown shop';
      if (visit.shop_id) {
        const { data: shop } = await supabase
          .from('shops')
          .select('name')
          .eq('id', visit.shop_id)
          .maybeSingle();
        if (shop?.name) shopName = shop.name;
      }

      let salespersonName = 'Unknown';
      if (visit.assigned_to) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', visit.assigned_to)
          .maybeSingle();
        if (prof?.full_name) salespersonName = prof.full_name;
      }

      const submittedAt = visit.checked_in_at || visit.updated_at || new Date().toISOString();
      const readSet = new Set<string>(
        (() => {
          try {
            return JSON.parse(localStorage.getItem(readKey) || '[]');
          } catch {
            return [];
          }
        })()
      );

      const notif: FailedVisitNotif = {
        id: `${visit.id}-${submittedAt}`,
        visitId: visit.id,
        shopName,
        salespersonName,
        submittedAt,
        read: readSet.has(visit.id),
      };

      setNotifs(prev => [notif, ...prev.filter(n => n.visitId !== visit.id)].slice(0, MAX_NOTIFS));

      if (!notif.read) {
        toast({
          title: 'Visit submission failed',
          description: `${shopName} • ${salespersonName}`,
          variant: 'destructive',
        });
      }
    },
    [notifs, toast, readKey]
  );

  // Realtime subscription — only for team leads
  useEffect(() => {
    if (!user || role !== 'team_lead') return;

    const channel = supabase
      .channel(`failed-visits-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visits' },
        payload => {
          const v: any = payload.new;
          if (v.visit_status === 'failed') enrichAndAdd(v);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'visits' },
        payload => {
          const v: any = payload.new;
          const old: any = payload.old;
          if (v.visit_status === 'failed' && old?.visit_status !== 'failed') {
            enrichAndAdd(v);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, enrichAndAdd]);

  if (!user || role !== 'team_lead') return null;

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => {
    const ids = notifs.map(n => n.visitId);
    try {
      localStorage.setItem(readKey, JSON.stringify(ids));
    } catch {}
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifs([]);
    try {
      localStorage.removeItem(readKey);
    } catch {}
  };

  return (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o && unreadCount > 0) markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="relative h-10 w-10 rounded-full flex items-center justify-center text-foreground native-btn hover:bg-muted/60 active:bg-muted"
          aria-label="Failed visit notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Failed Visits</p>
            <p className="text-[11px] text-muted-foreground">Real-time alerts</p>
          </div>
          {notifs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">
              Clear
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No failed visit notifications
            </div>
          ) : (
            <ul className="divide-y">
              {notifs.map(n => {
                const d = new Date(n.submittedAt);
                return (
                  <li key={n.id} className="px-4 py-3 hover:bg-muted/40">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                        <XCircle className="h-5 w-5 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{n.shopName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          by {n.salespersonName}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {d.toLocaleDateString()} • {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default FailedVisitNotifications;
