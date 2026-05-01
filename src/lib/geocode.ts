// OpenStreetMap Nominatim geocoder — single endpoint, polite usage.
// IMPORTANT: never switch to Google Maps (project rule).

export type GeocodeResult = { lat: number; lng: number } | null;

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!address?.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Sequential geocoder with politeness delay (Nominatim asks ≤1 req/s). */
export async function geocodeBatch(
  addresses: string[],
  onProgress?: (done: number, total: number) => void
): Promise<GeocodeResult[]> {
  const out: GeocodeResult[] = [];
  for (let i = 0; i < addresses.length; i++) {
    out.push(await geocodeAddress(addresses[i]));
    onProgress?.(i + 1, addresses.length);
    if (i < addresses.length - 1) await new Promise(r => setTimeout(r, 1100));
  }
  return out;
}
