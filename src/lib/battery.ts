// Best-effort battery reader. Web Battery API is only supported on Android Chrome
// (and Edge on Android). On iOS Safari and most desktops it returns null.
export interface BatterySnapshot {
  percent: number | null;
  charging: boolean | null;
}

export async function readBattery(): Promise<BatterySnapshot> {
  try {
    const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    if (typeof nav.getBattery !== 'function') return { percent: null, charging: null };
    const b = await nav.getBattery();
    const pct = Math.round((b.level ?? 0) * 100);
    return { percent: Number.isFinite(pct) ? pct : null, charging: !!b.charging };
  } catch {
    return { percent: null, charging: null };
  }
}
