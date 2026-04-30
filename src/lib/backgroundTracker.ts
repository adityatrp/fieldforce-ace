import { supabase } from '@/integrations/supabase/client';
import { readBattery } from '@/lib/battery';
import { isNativeApp } from '@/lib/native';

// Ping every 5 minutes while punched in.
const PING_INTERVAL_MS = 5 * 60 * 1000;
// Check the wall-clock every 30s so we still fire roughly on time even if
// the browser throttles setInterval in a backgrounded tab.
const WEB_CHECK_INTERVAL_MS = 30 * 1000;

let webIntervalId: ReturnType<typeof setInterval> | null = null;
let webVisibilityHandler: (() => void) | null = null;
let webPageShowHandler: (() => void) | null = null;
let nativeWatcherId: string | null = null;
let activeUserId: string | null = null;
let lastWebPingTs = 0;
let webTickInFlight = false;
let wakeLock: { release: () => Promise<void> } | null = null;

// Tracks whether the OS has reported a background-permission denial for the
// active watcher. Used by the UI layer to decide if a rationale + settings
// deep-link is still needed.
let backgroundPermissionDenied = false;

async function requestWakeLock() {
  try {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock?.request) return;
    wakeLock = await nav.wakeLock.request('screen');
  } catch {
    /* user may have denied or browser unsupported — that's fine */
  }
}

async function releaseWakeLock() {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

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

type BgGeoPlugin = {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      position?: { latitude: number; longitude: number; accuracy: number | null },
      error?: { code?: string; message: string },
    ) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
};

async function getBgGeoPlugin(): Promise<BgGeoPlugin | null> {
  try {
    const { registerPlugin } = await import('@capacitor/core');
    return registerPlugin<BgGeoPlugin>('BackgroundGeolocation');
  } catch {
    return null;
  }
}

/**
 * STAGE 3 trigger: deep-links the user to system Location settings so they
 * can switch from "While using the app" to "Allow all the time".
 *
 * Android 11+ does not allow apps to request ACCESS_BACKGROUND_LOCATION via
 * a runtime dialog — it MUST be granted via the system settings page. This
 * is the closest thing to a "background permission prompt" available.
 *
 * Should be called ONLY after the user has:
 *   1. Granted foreground (fine + coarse) location, and
 *   2. Agreed to your custom Rationale UI.
 */
export async function requestBackgroundLocationUpgrade(): Promise<void> {
  if (!isNativeApp()) return;
  const plugin = await getBgGeoPlugin();
  if (!plugin) return;
  try {
    await plugin.openSettings();
  } catch {
    /* ignore — user can grant it manually later */
  }
}

/**
 * Returns true if the OS has reported that background location is NOT
 * authorized for the currently-active watcher. The UI layer reads this to
 * know whether to show the rationale dialog.
 */
export function isBackgroundPermissionDenied(): boolean {
  return backgroundPermissionDenied;
}

/**
 * Starts background pings for the given user. Native: uses Capacitor
 * background-geolocation (works with screen off / app backgrounded).
 * Web fallback: setInterval — only fires while the tab is alive.
 *
 * Two-stage permission flow on Android 11+:
 *   STAGE 1: This function calls addWatcher({ requestPermissions: true })
 *            which triggers the FOREGROUND prompt (fine + coarse location).
 *   STAGE 2: When the OS reports a background-denied error, we set the
 *            `backgroundPermissionDenied` flag and invoke the optional
 *            `onNeedsBackgroundUpgrade` callback. The UI layer should then
 *            show its custom Rationale dialog.
 *   STAGE 3: After the user clicks "Agree" on the rationale dialog, the UI
 *            calls `requestBackgroundLocationUpgrade()` to deep-link them
 *            into system settings to pick "Allow all the time".
 */
export async function startBackgroundTracking(
  userId: string,
  opts?: { onNeedsBackgroundUpgrade?: () => void },
) {
  if (activeUserId === userId) return;
  await stopBackgroundTracking();
  activeUserId = userId;
  backgroundPermissionDenied = false;

  if (isNativeApp()) {
    const BackgroundGeolocation = await getBgGeoPlugin();
    if (BackgroundGeolocation) {
      try {
        let upgradeCallbackFired = false;
        nativeWatcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage:
              'FieldForce is tracking your route while you are punched in.',
            backgroundTitle: 'Field Tracking active',
            // STAGE 1: triggers the FOREGROUND fine+coarse prompt.
            requestPermissions: true,
            stale: false,
            // distanceFilter is meters; we keep low so the OS hands us updates,
            // and we throttle the actual DB writes to 5-min intervals below.
            distanceFilter: 10,
          },
          async (location, error) => {
            if (error) {
              // STAGE 2: foreground granted, but background denied.
              // Flag it and tell the UI layer to show its rationale dialog.
              if (
                error.code === 'NOT_AUTHORIZED' ||
                /background/i.test(error.message || '')
              ) {
                backgroundPermissionDenied = true;
                if (!upgradeCallbackFired && opts?.onNeedsBackgroundUpgrade) {
                  upgradeCallbackFired = true;
                  try {
                    opts.onNeedsBackgroundUpgrade();
                  } catch {
                    /* ignore UI errors */
                  }
                }
              }
              return;
            }
            if (!location || !activeUserId) return;
            // Throttle writes: only persist if >= 5 min since last write.
            const now = Date.now();
            const last =
              (window as unknown as { __lastBgPingTs?: number }).__lastBgPingTs ?? 0;
            if (now - last < PING_INTERVAL_MS - 5000) return;
            (window as unknown as { __lastBgPingTs?: number }).__lastBgPingTs = now;
            await logPing(
              activeUserId,
              location.latitude,
              location.longitude,
              location.accuracy ?? null,
            );
          },
        );
        return;
      } catch (e) {
        console.warn('Native background tracker failed, falling back to web interval', e);
      }
    }
  }

  // Web fallback — only runs while the tab is alive. We:
  //  • fire an IMMEDIATE first ping (no 5-min wait on punch-in / resume)
  //  • check wall-clock every 30s (survives Chrome's background throttling)
  //  • catch up on visibility change (screen back on / tab refocus)
  const tick = async (force = false) => {
    if (!activeUserId || webTickInFlight) return;
    const now = Date.now();
    if (!force && now - lastWebPingTs < PING_INTERVAL_MS - 5000) return;
    webTickInFlight = true;
    try {
      const pos = await getWebPosition();
      await logPing(activeUserId, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      lastWebPingTs = Date.now();
    } catch {
      /* swallow — next tick will retry */
    } finally {
      webTickInFlight = false;
    }
  };

  // Immediate first ping so the timer doesn't sit at "Xm ago" for 5 minutes.
  void tick(true);
  webIntervalId = setInterval(() => { void tick(); }, WEB_CHECK_INTERVAL_MS);

  // Best-effort: keep the screen awake so the JS timer keeps running on
  // mobile browsers (prevents Chrome from suspending the tab when the user
  // switches apps but leaves the screen on). Auto-released by the browser
  // when the tab is hidden — we re-acquire on visibilitychange below.
  void requestWakeLock();

  webVisibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      void tick();
      void requestWakeLock();
    }
  };
  document.addEventListener('visibilitychange', webVisibilityHandler);
  window.addEventListener('focus', webVisibilityHandler);

  // Fires when the page is restored from the back-forward cache (e.g.,
  // user swipes back to the app on Android Chrome) — guarantees a catch-up.
  webPageShowHandler = () => { void tick(); void requestWakeLock(); };
  window.addEventListener('pageshow', webPageShowHandler);
}

export async function stopBackgroundTracking() {
  activeUserId = null;
  lastWebPingTs = 0;
  backgroundPermissionDenied = false;
  if (webIntervalId) {
    clearInterval(webIntervalId);
    webIntervalId = null;
  }
  if (webVisibilityHandler) {
    document.removeEventListener('visibilitychange', webVisibilityHandler);
    window.removeEventListener('focus', webVisibilityHandler);
    webVisibilityHandler = null;
  }
  if (webPageShowHandler) {
    window.removeEventListener('pageshow', webPageShowHandler);
    webPageShowHandler = null;
  }
  await releaseWakeLock();
  if (nativeWatcherId) {
    const BackgroundGeolocation = await getBgGeoPlugin();
    if (BackgroundGeolocation) {
      try {
        await BackgroundGeolocation.removeWatcher({ id: nativeWatcherId });
      } catch {
        /* ignore */
      }
    }
    nativeWatcherId = null;
  }
}
