// Best-effort runtime detector for Capacitor. We avoid a hard dep on
// @capacitor/core's `Capacitor` global so the web bundle never breaks if
// the package is tree-shaken away.
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}
