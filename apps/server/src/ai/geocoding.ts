// Real geocoding (Nominatim/OpenStreetMap) + travel time (OSRM public demo
// server) — both free, no API key. Nominatim's usage policy requires a real
// identifying User-Agent and at most ~1 request/sec, which is fine here since
// this only runs once per event creation, never in a loop.

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

const USER_AGENT = "SegundoCerebro/1.0 (uso pessoal, app odontologico local)";

// The event extractor sometimes keeps filler words around the actual address
// ("consultório na Avenida Paulista..."), which makes Nominatim return zero
// results — it matches addresses, not descriptions of a place.
function cleanLocationQuery(address: string): string {
  return address
    .replace(/^(o\s+)?(meu\s+|nosso\s+)?(consultório|clínica|escritório|casa|local|endereço)\s+(fica\s+)?(na|no|em|é\s+na|é\s+no|é\s+em)\s+/i, "")
    .trim();
}

async function searchNominatim(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const results = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (results.length === 0) return null;
  return { lat: Number(results[0].lat), lng: Number(results[0].lon), displayName: results[0].display_name };
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address?.trim()) return null;
  const cleaned = cleanLocationQuery(address);
  try {
    // Try the cleaned query first, then the raw text, then both with ", Brasil"
    // appended — free-text addresses without a country/state are often ambiguous.
    const attempts = [cleaned, `${cleaned}, Brasil`, address, `${address}, Brasil`];
    for (const attempt of attempts) {
      const result = await searchNominatim(attempt);
      if (result) return result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function travelMinutesBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { code: string; routes?: { duration: number }[] };
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return Math.ceil(data.routes[0].duration / 60);
  } catch {
    return null;
  }
}
