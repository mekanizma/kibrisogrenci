'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Free OpenStreetMap map with approximate area circle (privacy-safe).
 */
export default function ListingMap({ lat, lng, label, radiusM = 300 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || lat == null || lng == null) return undefined;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
      zoomControl: true,
    }).setView([lat, lng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.circle([lat, lng], {
      radius: radiusM,
      color: '#0a4d68',
      weight: 2,
      fillColor: '#0a4d68',
      fillOpacity: 0.16,
    }).addTo(map);

    L.circleMarker([lat, lng], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#0a4d68',
      fillOpacity: 1,
    }).addTo(map);

    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 80);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, radiusM]);

  if (lat == null || lng == null) {
    return (
      <div className="relative h-56 w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center text-sm text-slate-500 px-4 text-center">
        {label || 'Konum bilgisi henüz yok'}
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="h-56 sm:h-64 w-full z-0" />
      {label && (
        <div className="absolute bottom-2 start-2 z-[500] rounded-lg bg-white/95 backdrop-blur px-2.5 py-1.5 text-xs text-slate-600 shadow-sm max-w-[min(90%,20rem)] truncate">
          {label}
        </div>
      )}
    </div>
  );
}
