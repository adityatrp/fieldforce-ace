// Geocoder: Photon (komoot, OSM-based, fast, no strict rate limit) as primary,
// Nominatim as fallback for accuracy. Never use Google Maps (project rule).

export type GeocodeResult = { lat: number; lng: number; display?: string } | null;

const PHOTON_URL = 'https://photon.komoot.io/api';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Bias toward India by default (most users); easily overridable later.
const DEFAULT_COUNTRY = 'in';

async function tryPhoton(address: string): Promise<GeocodeResult> {
  try {
    const url = `${PHOTON_URL}?limit=1&lang=en&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const f = data?.features?.[0];
    if (!f?.geometry?.coordinates) return null;
    const [lng, lat] = f.geometry.coordinates;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    const p = f.properties || {};
    const display = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', ');
    return { lat, lng, display };
  } catch {
    return null;
  }
}

async function tryNominatim(address: string): Promise<GeocodeResult> {
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&addressdetails=1&countrycodes=${DEFAULT_COUNTRY}&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng, display: data[0].display_name };
  } catch {
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!address?.trim()) return null;
  const a = address.trim();
  // Photon is fast and parallel-friendly; fall back to Nominatim for misses.
  const photon = await tryPhoton(a);
  if (photon) return photon;
  return await tryNominatim(a);
}

/**
 * Parallel geocoder with bounded concurrency.
 * Photon allows multiple parallel requests, so we run up to 6 at a time.
 */
export async function geocodeBatch(
  addresses: string[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 6
): Promise<GeocodeResult[]> {
  const out: GeocodeResult[] = new Array(addresses.length).fill(null);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= addresses.length) return;
      out[i] = await geocodeAddress(addresses[i]);
      done++;
      onProgress?.(done, addresses.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, addresses.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
