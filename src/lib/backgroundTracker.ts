import { supabase } from '@/integrations/supabase/client';
import { readBattery } from '@/lib/battery';
import { isNativeApp } from '@/lib/native';

// Ping every 5 minutes while punched in.
const PING_INTERVAL_MS = 5 * 60 * 1000;

let webIntervalId: ReturnType<typeof setInterval> | null = null;
let nativeWatcherId: string | null = null;
let activeUserId: string | null = null;

async function logPing(userId: string, lat: number, lng: number, accuracy: number | null) {
  const battery = await readBattery();
  await supabase.from('location_logs').insert({
    user_id: userId,
    latitude: lat,
    longitude: lng,
    accuracy: accuracy ?? null,
    battery_percent: battery.percent,
    battery_charging: battery.charging,
    source: 'background_ping',
  });
}

function getWebPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

/**
 * Starts background pings for the given user. Native: uses Capacitor
 * background-geolocation (works with screen off / app backgrounded).
 * Web fallback: setInterval — only fires while the tab is alive.
 */
export async function startBackgroundTracking(userId: string) {
  if (activeUserId === userId) return;
  await stopBackgroundTracking();
  activeUserId = userId;

  if (isNativeApp()) {
    try {
      const mod = await import('@capacitor-community/background-geolocation');
      const BackgroundGeolocation = mod.default;
      nativeWatcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'FieldForce is tracking your route while you are punched in.',
          backgroundTitle: 'Field Tracking active',
          requestPermissions: true,
          stale: false,
          // distanceFilter is meters; we keep low so the OS hands us updates,
          // and we throttle the actual DB writes to 5-min intervals below.
          distanceFilter: 10,
        },
        async (location, error) => {
          if (error) return;
          if (!location || !activeUserId) return;
          // Throttle writes: only persist if >= 5 min since last write.
          const now = Date.now();
          const last = (window as unknown as { __lastBgPingTs?: number }).__lastBgPingTs ?? 0;
          if (now - last < PING_INTERVAL_MS - 5000) return;
          (window as unknown as { __lastBgPingTs?: number }).__lastBgPingTs = now;
          await logPing(activeUserId, location.latitude, location.longitude, location.accuracy ?? null);
        },
      );
      return;
    } catch (e) {
      console.warn('Native background tracker failed, falling back to web interval', e);
    }
  }

  // Web fallback — only runs while the tab is alive.
  const tick = async () => {
    if (!activeUserId) return;
    try {
      const pos = await getWebPosition();
      await logPing(activeUserId, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    } catch {
      /* swallow — next tick will retry */
    }
  };
  webIntervalId = setInterval(tick, PING_INTERVAL_MS);
}

export async function stopBackgroundTracking() {
  activeUserId = null;
  if (webIntervalId) {
    clearInterval(webIntervalId);
    webIntervalId = null;
  }
  if (nativeWatcherId) {
    try {
      const mod = await import('@capacitor-community/background-geolocation');
      await mod.default.removeWatcher({ id: nativeWatcherId });
    } catch {
      /* ignore */
    }
    nativeWatcherId = null;
  }
}
