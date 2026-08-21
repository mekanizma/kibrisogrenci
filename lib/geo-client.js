/** Client-side geo helpers for proximity UX. */

export const CITY_COORDS = {
  Girne: { lat: 35.341, lng: 33.317 },
  Lefkoşa: { lat: 35.185, lng: 33.382 },
  Gazimağusa: { lat: 35.125, lng: 33.94 },
  Güzelyurt: { lat: 35.199, lng: 32.993 },
  Lefke: { lat: 35.112, lng: 32.85 },
  İskele: { lat: 35.287, lng: 33.892 },
};

const STORAGE_KEY = 'ko_user_geo_v1';
const PREF_KEY = 'ko_geo_pref_v1';

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters, locale = 'tr') {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) {
    return locale === 'tr' ? `${Math.round(meters)} m` : `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  const n = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return `${n} km`;
}

export function distanceToListing(user, listing) {
  if (!user?.lat || !user?.lng) return null;
  const lat = listing?.approx_lat ?? CITY_COORDS[listing?.city]?.lat;
  const lng = listing?.approx_lng ?? CITY_COORDS[listing?.city]?.lng;
  if (lat == null || lng == null) return null;
  return haversineMeters(user.lat, user.lng, lat, lng);
}

export function nearestCity(lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const [name, c] of Object.entries(CITY_COORDS)) {
    const d = haversineMeters(lat, lng, c.lat, c.lng);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export function loadStoredGeo() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.lat || !data?.lng) return null;
    // Stale after 2 hours
    if (data.ts && Date.now() - data.ts > 2 * 60 * 60 * 1000) return null;
    return { lat: Number(data.lat), lng: Number(data.lng), accuracy: data.accuracy, ts: data.ts };
  } catch {
    return null;
  }
}

export function saveStoredGeo(geo) {
  if (typeof window === 'undefined' || !geo) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lat: geo.lat,
      lng: geo.lng,
      accuracy: geo.accuracy ?? null,
      ts: Date.now(),
    }));
  } catch {
    /* ignore */
  }
}

export function getGeoPref() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

export function setGeoPref(pref) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* ignore */
  }
}

/** Request browser geolocation. Resolves with {lat,lng,accuracy} or rejects. */
export function requestUserLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const geo = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        saveStoredGeo(geo);
        setGeoPref('granted');
        resolve(geo);
      },
      (err) => {
        if (err?.code === 1) setGeoPref('denied');
        reject(err || new Error('denied'));
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 5 * 60 * 1000,
        ...options,
      },
    );
  });
}
