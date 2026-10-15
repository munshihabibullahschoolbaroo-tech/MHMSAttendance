"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { Compass, Crosshair, MapPin, Navigation, School, Layers } from "lucide-react";
import { haversineMeters } from "@/lib/geo/haversine";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BASEMAP,
  ESRI_SATELLITE_TILE,
  OSM_TILE,
  type BasemapId,
} from "@/lib/map/tile-layers";
import { BasemapLayerControl } from "@/components/client/map/basemap-layer-control";

type Props = {
  schoolLat: number;
  schoolLng: number;
  radiusMeters: number;
  schoolName: string;
  campusName: string;
  userLat?: number | null;
  userLng?: number | null;
  className?: string;
};

// Helper controller inside Leaflet MapContainer to handle sizing, resizing, and fly-to
function MapController({
  schoolCenter,
  userPos,
  recenterTrigger,
}: {
  schoolCenter: [number, number];
  userPos?: [number, number] | null;
  recenterTrigger: { target: "school" | "user" | "fit"; seq: number };
}) {
  const map = useMap();

  // Invalidate size on mount and staggered intervals to ensure full container tile coverage
  React.useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 350);
    const t3 = setTimeout(() => map.invalidateSize(), 800);

    const onResize = () => {
      map.invalidateSize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);

  // Handle user recenter requests
  React.useEffect(() => {
    if (recenterTrigger.seq === 0) return;

    if (recenterTrigger.target === "school") {
      map.flyTo(schoolCenter, 16, { duration: 1 });
    } else if (recenterTrigger.target === "user" && userPos) {
      map.flyTo(userPos, 17, { duration: 1 });
    } else if (recenterTrigger.target === "fit" && userPos) {
      const bounds = L.latLngBounds([schoolCenter, userPos]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17, animate: true });
    }
  }, [recenterTrigger, schoolCenter, userPos, map]);

  return null;
}

export function SchoolCampusMap({
  schoolLat,
  schoolLng,
  radiusMeters,
  schoolName,
  campusName,
  userLat,
  userLng,
  className,
}: Props) {
  const [mounted, setMounted] = React.useState(false);
  const [basemap, setBasemap] = React.useState<BasemapId>("street");
  const [recenterSeq, setRecenterSeq] = React.useState<{ target: "school" | "user" | "fit"; seq: number }>({
    target: "school",
    seq: 0,
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const hasUserLocation = typeof userLat === "number" && typeof userLng === "number";
  const userPos: [number, number] | null = hasUserLocation ? [userLat, userLng] : null;
  const schoolCenter: [number, number] = [schoolLat, schoolLng];

  const distance = hasUserLocation
    ? Math.round(haversineMeters(userLat, userLng, schoolLat, schoolLng))
    : null;

  const isInside = distance !== null && distance <= radiusMeters;

  // Custom high-definition SVG marker icons
  const schoolIcon = React.useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return L.divIcon({
      className: "custom-school-pin",
      html: `
        <div style="position:relative; display:flex; align-items:center; justify-content:center; width:38px; height:38px; background:linear-gradient(135deg, #2563eb, #1d4ed8); border:3px solid #ffffff; border-radius:50%; box-shadow:0 6px 16px rgba(37,99,235,0.45);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
            <path d="M6 12v5c3 3 9 3 12 0v-5"/>
          </svg>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -20],
    });
  }, []);

  const userIcon = React.useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const color = isInside ? "#10b981" : "#f59e0b";
    return L.divIcon({
      className: "custom-user-pin",
      html: `
        <div style="position:relative; display:flex; align-items:center; justify-content:center; width:32px; height:32px;">
          <div style="position:absolute; width:100%; height:100%; background:${color}; border-radius:50%; opacity:0.35; animation:pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
          <div style="width:16px; height:16px; background:${color}; border:3px solid #ffffff; border-radius:50%; box-shadow:0 3px 10px rgba(0,0,0,0.35);"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  }, [isInside]);

  if (!mounted) {
    return (
      <div
        className={cn(
          "relative flex h-72 sm:h-80 w-full items-center justify-center rounded-2xl bg-zinc-100 border border-zinc-200 dark:bg-zinc-900/60 dark:border-white/10",
          className
        )}
      >
        <div className="flex flex-col items-center gap-2 text-zinc-400">
          <Compass className="h-6 w-6 animate-spin text-cyan-500" />
          <span className="text-xs font-medium">Loading school campus map…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "isolate relative overflow-hidden rounded-2xl border border-zinc-200 shadow-sm dark:border-white/10 dark:bg-zinc-950",
        className
      )}
    >
      {/* Top Left Distance / Geofence Badge */}
      <div className="absolute left-3 top-3 z-[20] flex max-w-[calc(100%-140px)] items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-md dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-white/10">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            distance === null
              ? "bg-zinc-400"
              : isInside
              ? "bg-emerald-500 animate-pulse"
              : "bg-red-500"
          )}
        />
        <div className="text-xs leading-tight truncate">
          {distance === null ? (
            <span className="text-zinc-500">Acquiring your location…</span>
          ) : isInside ? (
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              Inside Campus ({distance}m away)
            </span>
          ) : (
            <span className="font-semibold text-red-600 dark:text-red-400">
              {distance}m away (≤{radiusMeters}m required)
            </span>
          )}
        </div>
      </div>

      {/* Top Right Basemap Layer Control (Map vs Satellite) */}
      <BasemapLayerControl
        value={basemap}
        onChange={setBasemap}
        className="right-3 top-3"
        tone="dark"
      />

      {/* Bottom Right Recenter Navigation Floating Toolbar */}
      <div className="absolute bottom-3 right-3 z-[20] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setRecenterSeq((prev) => ({ target: "school", seq: prev.seq + 1 }))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white hover:text-blue-600 dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
          title="Center on Campus"
          aria-label="Center on School Campus"
        >
          <School className="h-4 w-4" />
        </button>

        {hasUserLocation && (
          <>
            <button
              type="button"
              onClick={() => setRecenterSeq((prev) => ({ target: "user", seq: prev.seq + 1 }))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white hover:text-emerald-600 dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
              title="Center on My Location"
              aria-label="Center on My Location"
            >
              <Navigation className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setRecenterSeq((prev) => ({ target: "fit", seq: prev.seq + 1 }))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white hover:text-cyan-600 dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-cyan-400"
              title="Show Both Campus and Me"
              aria-label="Fit bounds to Campus and My Location"
            >
              <Crosshair className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Map Surface */}
      <div className="h-72 sm:h-80 w-full">
        <MapContainer
          center={schoolCenter}
          zoom={16}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <MapController
            schoolCenter={schoolCenter}
            userPos={userPos}
            recenterTrigger={recenterSeq}
          />

          {basemap === "satellite" ? (
            <TileLayer
              attribution={ESRI_SATELLITE_TILE.attribution}
              url={ESRI_SATELLITE_TILE.url}
              maxZoom={19}
            />
          ) : (
            <TileLayer
              attribution={OSM_TILE.attribution}
              url={OSM_TILE.url}
              maxZoom={19}
            />
          )}

          {/* School Boundary Geofence Circle */}
          <Circle
            center={schoolCenter}
            radius={radiusMeters}
            pathOptions={{
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.16,
              weight: 2.5,
              dashArray: "6, 6",
            }}
          />

          {/* School Campus Center Marker */}
          {schoolIcon && (
            <Marker position={schoolCenter} icon={schoolIcon}>
              <Popup>
                <div className="p-1.5 text-xs">
                  <p className="font-bold text-zinc-950 text-sm">{schoolName}</p>
                  <p className="text-zinc-500 font-medium">{campusName}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    Geofence Radius: {radiusMeters}m
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* User Live Position Marker */}
          {userPos && userIcon && (
            <Marker position={userPos} icon={userIcon}>
              <Popup>
                <div className="p-1.5 text-xs">
                  <p className="font-bold text-zinc-950 text-sm">Your Location</p>
                  <p className={cn("mt-1 font-semibold", isInside ? "text-emerald-600" : "text-amber-600")}>
                    {isInside ? "✓ Within Campus Range" : "⚠ Outside Campus Range"}
                  </p>
                  <p className="text-zinc-500 mt-0.5">
                    {distance !== null ? `${distance}m from center` : ""}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
