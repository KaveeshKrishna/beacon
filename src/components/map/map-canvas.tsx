"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/map/map.css";

// MapLibre 6 derives its worker URL from `import.meta.url`. Inside the Next
// bundle that resolves to the document URL, so the worker request comes back
// as HTML and the map never finishes loading. The worker is copied into
// /public by scripts/copy-maplibre-worker.mjs at install time.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.js");

export type MapPoint = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  recordedAt: string;
  batteryLevel?: number | null;
};

export type MapFence = {
  id?: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusM: number;
};

const LIGHT_FALLBACK = "https://tiles.openfreemap.org/styles/positron";
const DARK_FALLBACK = "https://tiles.openfreemap.org/styles/dark";

function currentTheme(): "light" | "dark" {
  const stored = document.documentElement.dataset.theme;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function styleUrl(theme: "light" | "dark"): string {
  return theme === "dark"
    ? (process.env.NEXT_PUBLIC_MAP_STYLE_DARK || DARK_FALLBACK)
    : (process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || LIGHT_FALLBACK);
}

function circlePolygon(
  latitude: number,
  longitude: number,
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const points = 64;
  const coordinates: [number, number][] = [];
  const latRad = (latitude * Math.PI) / 180;
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const dLat = (radiusM * Math.cos(angle)) / 111_320;
    const dLon =
      (radiusM * Math.sin(angle)) / (111_320 * Math.max(0.2, Math.cos(latRad)));
    coordinates.push([longitude + dLon, latitude + dLat]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

function trailData(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features:
      points.length > 1
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: points.map((point) => [point.longitude, point.latitude]),
              },
            },
          ]
        : [],
  };
}

function accuracyData(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const latest = points[points.length - 1];
  if (!latest) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      circlePolygon(latest.latitude, latest.longitude, Math.max(6, latest.accuracyM)),
    ],
  };
}

function fenceData(fences: MapFence[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: fences.map((fence) =>
      circlePolygon(fence.centerLat, fence.centerLon, fence.radiusM),
    ),
  };
}

function addLayers(map: MapLibreMap) {
  if (!map.getSource("beacon-accuracy")) {
    map.addSource("beacon-accuracy", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "beacon-accuracy-fill",
      type: "fill",
      source: "beacon-accuracy",
      paint: { "fill-color": "#ff6a45", "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: "beacon-accuracy-line",
      type: "line",
      source: "beacon-accuracy",
      paint: { "line-color": "#ff6a45", "line-opacity": 0.4, "line-width": 1 },
    });
  }

  if (!map.getSource("beacon-fences")) {
    map.addSource("beacon-fences", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "beacon-fences-fill",
      type: "fill",
      source: "beacon-fences",
      paint: { "fill-color": "#7cb2f2", "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: "beacon-fences-line",
      type: "line",
      source: "beacon-fences",
      paint: {
        "line-color": "#7cb2f2",
        "line-opacity": 0.6,
        "line-width": 1.5,
        "line-dasharray": [2, 2],
      },
    });
  }

  if (!map.getSource("beacon-trail")) {
    map.addSource("beacon-trail", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "beacon-trail-casing",
      type: "line",
      source: "beacon-trail",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ff6a45",
        "line-opacity": 0.18,
        "line-width": 5,
        "line-blur": 1,
      },
    });
    map.addLayer({
      id: "beacon-trail-line",
      type: "line",
      source: "beacon-trail",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ff6a45",
        "line-opacity": 0.9,
        "line-width": 1.75,
      },
    });
  }
}

function setSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSON.FeatureCollection,
) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

export default function MapCanvas({
  points,
  fences,
  focus,
  fitToken,
  interactive,
}: {
  points: MapPoint[];
  fences: MapFence[];
  focus?: { latitude: number; longitude: number } | null;
  fitToken: number;
  interactive: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const initialTheme = useMemo(() => currentTheme(), []);
  const themeRef = useRef(initialTheme);
  const [theme, setTheme] = useState(initialTheme);
  const [ready, setReady] = useState(false);
  const [styleEpoch, setStyleEpoch] = useState(0);
  const [failed, setFailed] = useState(false);
  const lastFit = useRef<string>("");
  const appliedTheme = useRef(initialTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = currentTheme();
      themeRef.current = next;
      setTheme(next);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (document.documentElement.dataset.theme) return;
      const next = currentTheme();
      themeRef.current = next;
      setTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const latest = points[points.length - 1];
    const center: [number, number] = focus
      ? [focus.longitude, focus.latitude]
      : latest
        ? [latest.longitude, latest.latitude]
        : [4.9, 30];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(themeRef.current),
      center,
      zoom: latest ? 14.5 : 1.7,
      attributionControl: { compact: true },
      cooperativeGestures: !interactive,
      fadeDuration: 0,
    });
    mapRef.current = map;

    if (interactive) {
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
    }

    map.on("error", (event) => {
      if (event.error?.message?.includes("style")) setFailed(true);
    });

    map.on("load", () => {
      addLayers(map);
      setReady(true);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // The map is created once. Data and theme are applied by later effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    map.setStyle(styleUrl(theme), { diff: false });
    map.once("style.load", () => {
      addLayers(map);
      setStyleEpoch((value) => value + 1);
    });
  }, [theme, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    addLayers(map);
    setSourceData(map, "beacon-accuracy", accuracyData(points));
    setSourceData(map, "beacon-trail", trailData(points));
    setSourceData(map, "beacon-fences", fenceData(fences));

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const latest = points[points.length - 1];
    if (latest) {
      const element = document.createElement("div");
      element.className = "beacon-marker";
      element.innerHTML =
        '<span class="beacon-marker__pulse"></span><span class="beacon-marker__dot"></span>';
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([latest.longitude, latest.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (points.length > 0) {
      const signature = `${fitToken}:has-points`;
      if (signature !== lastFit.current) {
        lastFit.current = signature;
        if (points.length === 1) {
          map.easeTo({
            center: [points[0].longitude, points[0].latitude],
            zoom: 15.5,
            duration: 500,
          });
        } else {
          const bounds = new maplibregl.LngLatBounds();
          points.forEach((point) =>
            bounds.extend([point.longitude, point.latitude]),
          );
          map.fitBounds(bounds, {
            padding: 64,
            maxZoom: 16,
            duration: 600,
          });
        }
      }
    } else if (focus) {
      map.easeTo({
        center: [focus.longitude, focus.latitude],
        zoom: 14,
        duration: 500,
      });
    }
  }, [points, fences, ready, fitToken, styleEpoch, focus]);

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" ref={containerRef} />
      {!ready && !failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
          <div className="flex items-center gap-2 text-[11px] text-faint">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            Loading map
          </div>
        </div>
      ) : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2 p-6">
          <p className="max-w-[260px] text-center text-[12px] leading-5 text-muted">
            The map style could not be loaded. Check the connection to
            OpenFreeMap, then refresh this page.
          </p>
        </div>
      ) : null}
    </div>
  );
}
