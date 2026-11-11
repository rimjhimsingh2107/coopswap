import { useEffect, useRef } from 'react';
import { Map as MlMap, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent, type MapLibreEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ListingSummary } from '@coopswap/shared';
import { money } from '@/lib/format';

// OpenFreeMap: free vector tiles, no api key
const STYLE = import.meta.env.VITE_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/positron';
export type BBox = [number, number, number, number];

interface Props {
  listings: ListingSummary[];
  highlighted?: string | null;
  onMove?: (bbox: BBox) => void;
  onSelect?: (id: string) => void;
  initialCenter?: [number, number];
  className?: string;
}

// Pins are the fuzzed public coordinates, drawn as a price label inside a
// soft circle so nobody reads them as an exact address.
export function ListingMap({ listings, highlighted, onMove, onSelect, initialCenter = [-71.0892, 42.3398], className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const handlers = useRef({ onMove, onSelect });
  handlers.current = { onMove, onSelect };

  useEffect(() => {
    if (!el.current) return;
    const m = new MlMap({ container: el.current, style: STYLE, center: initialCenter, zoom: 12, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      m.addSource('listings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'areas', type: 'circle', source: 'listings', paint: { 'circle-radius': 26, 'circle-color': '#c8102e', 'circle-opacity': ['case', ['boolean', ['get', 'hl'], false], 0.22, 0.1] } });
      m.addLayer({
        id: 'prices',
        type: 'symbol',
        source: 'listings',
        layout: { 'text-field': ['get', 'price'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
        paint: { 'text-color': '#7a0a1c', 'text-halo-color': '#fff', 'text-halo-width': 2 },
      });
      m.on('click', 'areas', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) handlers.current.onSelect?.(id);
      });
      m.on('mouseenter', 'areas', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'areas', () => (m.getCanvas().style.cursor = ''));
    });
    m.on('moveend', (e: MapLibreEvent & { originalEvent?: unknown }) => {
      // only react to the user dragging, not to our own fitBounds
      if (!e.originalEvent) return;
      const b = m.getBounds();
      handlers.current.onMove?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => Math.round(n * 1e4) / 1e4) as BBox);
    });
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const src = m.getSource('listings') as GeoJSONSource | undefined;
      src?.setData({
        type: 'FeatureCollection',
        features: listings.map((l) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [l.approxLng, l.approxLat] },
          properties: { id: l.id, price: money(l.monthlyRentCents), hl: l.id === highlighted },
        })),
      });
    };
    if (m.isStyleLoaded()) apply();
    else m.once('load', apply);
  }, [listings, highlighted]);

  return <div ref={el} className={className} role="region" aria-label="Map of listings (approximate locations)" />;
}
