"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type Visitor = {
  _id: string;
  name?: string;
  email?: string;
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  currentUrl?: string;
  title?: string;
  pageCount?: number;
  timeOnSiteMs?: number;
  contactSessionId?: string;
  conversationId?: string | null;
  lastSeen?: number;
};

type Props = {
  visitors: Visitor[];
  selectedId?: string;
};

function fmt(ms?: number) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

const SOURCE_ID = "visitors";
const LAYER_CLUSTERS = "clusters";
const LAYER_CLUSTER_COUNT = "cluster-count";
const LAYER_POINTS = "unclustered";

export default function LiveMap({ visitors, selectedId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const styleUrl = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_MAPTILER_STYLE_URL;
    if (custom && custom.startsWith("http")) return custom;
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    return `https://api.maptiler.com/maps/streets/style.json?key=${key}`;
  }, []);

  const geojson = useMemo(() => {
    const features = visitors
      .filter((v) => typeof v.lat === "number" && typeof v.lng === "number")
      .map((v) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [v.lng as number, v.lat as number],
        },
        properties: {
          id: v._id,
          name: v.name ?? "Visitor",
          email: v.email ?? "",
          city: v.city ?? "",
          countryCode: v.countryCode ?? "",
          url: v.currentUrl ?? "",
          title: v.title ?? "",
          pageCount: v.pageCount ?? 0,
          timeOnSiteMs: v.timeOnSiteMs ?? 0,
          conversationId: v.conversationId ?? "",
        },
      }));

    return { type: "FeatureCollection" as const, features };
  }, [visitors]);

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [2, 48],
      zoom: 3,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    mapRef.current = map;

    return () => {
      try {
        popupRef.current?.remove();
      } catch {}
      popupRef.current = null;

      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
  }, [styleUrl]);

  // add layers once (on load)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const add = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: geojson as any,
          cluster: true,
          clusterMaxZoom: 10,
          clusterRadius: 40,
        });
      }

      if (!map.getLayer(LAYER_CLUSTERS)) {
        map.addLayer({
          id: LAYER_CLUSTERS,
          type: "circle",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#4ade80",
              10,
              "#22c55e",
              50,
              "#16a34a",
            ],
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
          },
        });
      }

      if (!map.getLayer(LAYER_CLUSTER_COUNT)) {
        map.addLayer({
          id: LAYER_CLUSTER_COUNT,
          type: "symbol",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["Open Sans Regular"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });
      }

      if (!map.getLayer(LAYER_POINTS)) {
        map.addLayer({
          id: LAYER_POINTS,
          type: "circle",
          source: SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#2563eb",
            "circle-radius": 6,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.on("click", LAYER_CLUSTERS, (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: [LAYER_CLUSTERS],
          }) as maplibregl.MapGeoJSONFeature[];

          const f = features?.[0];
          if (!f) return;

          const clusterId = (f.properties as any)?.cluster_id;
          if (clusterId == null) return;

          const src = map.getSource(SOURCE_ID) as any;
          src.getClusterExpansionZoom(clusterId, (err: unknown, zoom: number) => {
            if (err) return;
            const coords = (f.geometry as any)?.coordinates as [number, number] | undefined;
            if (!coords) return;
            map.easeTo({ center: coords, zoom });
          });
        });

        map.on("click", LAYER_POINTS, (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: [LAYER_POINTS],
          }) as maplibregl.MapGeoJSONFeature[];
          const f = features?.[0];
          if (!f) return;

          const p = (f.properties ?? {}) as any;
          const coord = ((f.geometry as any)?.coordinates ?? []) as [number, number];
          if (!coord?.length) return;

          const html = buildPopupHTML(p);
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 12 })
            .setLngLat(coord)
            .setHTML(html)
            .addTo(map);
        });

        map.on("mouseenter", LAYER_CLUSTERS, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", LAYER_CLUSTERS, () => (map.getCanvas().style.cursor = ""));
        map.on("mouseenter", LAYER_POINTS, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", LAYER_POINTS, () => (map.getCanvas().style.cursor = ""));
      }
    };

    if (map.isStyleLoaded()) add();
    else map.once("load", add);
  }, [geojson]);

  // ✅ update source data on visitors change (this fixes “dot disappears”)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(geojson as any);
  }, [geojson]);

  // focus selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;

    const v = visitors.find(
      (x) => x._id === selectedId && typeof x.lat === "number" && typeof x.lng === "number",
    );
    if (!v) return;

    const coord: [number, number] = [v.lng as number, v.lat as number];
    map.easeTo({ center: coord, zoom: 6 });

    const html = buildPopupHTML({
      name: v.name ?? "Visitor",
      email: v.email ?? "",
      city: v.city ?? "",
      countryCode: v.countryCode ?? "",
      url: v.currentUrl ?? "",
      title: v.title ?? "",
      pageCount: v.pageCount ?? 0,
      timeOnSiteMs: v.timeOnSiteMs ?? 0,
      conversationId: v.conversationId ?? "",
    });

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 12 })
      .setLngLat(coord)
      .setHTML(html)
      .addTo(map);
  }, [selectedId, visitors]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function buildPopupHTML(p: any) {
  return `
    <div style="font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto;">
      <div style="font-weight:600;margin-bottom:4px">${p.name || "Visitor"}</div>
      ${p.email ? `<div>${p.email}</div>` : ""}
      ${p.city ? `<div>${p.city}${p.countryCode ? `, ${p.countryCode}` : ""}</div>` : ""}
      ${p.title ? `<div style="opacity:.8">${p.title}</div>` : ""}
      ${p.url ? `<div style="margin:6px 0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.url}</div>` : ""}
      <div style="display:flex;gap:8px;opacity:.8">
        <span>${p.pageCount ?? 0} pages</span>
        <span>·</span>
        <span>${fmt(p.timeOnSiteMs)}</span>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px">
        ${p.conversationId ? `<a href="/conversations/${p.conversationId}" style="color:#2563eb;text-decoration:underline">Open conversation</a>` : ""}
        ${p.url ? `<a href="${p.url}" target="_blank" style="color:#2563eb;text-decoration:underline">Open page</a>` : ""}
      </div>
    </div>
  `;
}
