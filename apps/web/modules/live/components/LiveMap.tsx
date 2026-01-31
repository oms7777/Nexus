// apps/web/modules/live/components/LiveMap.tsx
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
  userAgent?: string;
  cookieEnabled?: boolean;
  timezoneOffset?: number;
  pageCount?: number;
  timeOnSiteMs?: number;
  contactSessionId?: string;
  conversationId?: string | null;
  lastSeen?: number;

  // ✅ routing / assignment
  assignedTerritoryKey?: string;
  assignedRepUserId?: string;
  assignedRep?: { userId?: string; name?: string; avatarUrl?: string; title?: string } | null;
};

type Props = {
  visitors: Visitor[];
  selectedId?: string;
  myUserId?: string;
  onSelectId?: (id?: string) => void;
};

function fmt(ms?: number) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export default function LiveMap({ visitors, selectedId, myUserId, onSelectId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const styleUrl = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_MAPTILER_STYLE_URL;
    if (custom && custom.startsWith("http")) return custom;

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    return `https://api.maptiler.com/maps/streets/style.json?key=${key}`;
  }, []);

  const myVisitors = useMemo(() => {
    if (!myUserId) return [];
    return (visitors ?? []).filter((v) => {
      const repId = v.assignedRepUserId ?? v.assignedRep?.userId;
      return repId === myUserId;
    });
  }, [visitors, myUserId]);

  const geojson = useMemo(() => {
    const feats = myVisitors
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
          contactSessionId: v.contactSessionId ?? "",
          conversationId: v.conversationId ?? "",
          assignedTerritoryKey: v.assignedTerritoryKey ?? "",
        },
      }));
    return { type: "FeatureCollection" as const, features: feats };
  }, [myVisitors]);

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
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = "visitors";
    const clusters = "clusters";
    const clusterCount = "cluster-count";
    const unclustered = "unclustered";

    const addLayers = () => {
      // reset
      [clusters, clusterCount, unclustered].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      map.addSource(sourceId, {
        type: "geojson",
        data: geojson as any,
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 40,
      });

      map.addLayer({
        id: clusters,
        type: "circle",
        source: sourceId,
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

      map.addLayer({
        id: clusterCount,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Regular"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: unclustered,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", clusters, (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [clusters],
        }) as maplibregl.MapGeoJSONFeature[];
        if (!features?.length) return;

        const f = features[0];
        if (!f) return;

        const clusterId = (f.properties as any)?.cluster_id;
        if (clusterId == null) return;

        const src = map.getSource(sourceId) as any;
        src.getClusterExpansionZoom(clusterId, (err: unknown, zoom: number) => {
          if (err) return;
          const coords = (f.geometry as any)?.coordinates as [number, number] | undefined;
          if (!coords) return;
          map.easeTo({ center: coords, zoom });
        });
      });

      map.on("click", unclustered, (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [unclustered],
        }) as maplibregl.MapGeoJSONFeature[];
        if (!features?.length) return;

        const f = features[0];
        if (!f) return;

        const p = (f.properties ?? {}) as any;
        const coord = ((f.geometry as any)?.coordinates ?? []) as [number, number];
        if (!coord?.length) return;

        // ✅ selection depuis la map
        if (p?.id && onSelectId) onSelectId(String(p.id));

        const html = buildPopupHTML(p);
        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 12 })
          .setLngLat(coord)
          .setHTML(html)
          .addTo(map);
      });

      map.on("mouseenter", clusters, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", clusters, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", unclustered, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", unclustered, () => (map.getCanvas().style.cursor = ""));
    };

    if (map.isStyleLoaded()) addLayers();
    else map.once("load", addLayers);
  }, [geojson, onSelectId]);

  // focus selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;

    const v = myVisitors.find(
      (x) => x._id === selectedId && typeof x.lat === "number" && typeof x.lng === "number",
    );
    if (!v) return;

    const coord: [number, number] = [v.lng as number, v.lat as number];
    map.easeTo({ center: coord, zoom: 6 });

    const p = {
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
      assignedTerritoryKey: v.assignedTerritoryKey ?? "",
    };

    const html = buildPopupHTML(p);
    if (popupRef.current) popupRef.current.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 12 })
      .setLngLat(coord)
      .setHTML(html)
      .addTo(map);
  }, [selectedId, myVisitors]);

  // fit bounds (my visitors only)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const coords = myVisitors
      .filter((v) => typeof v.lat === "number" && typeof v.lng === "number")
      .map((v) => [v.lng as number, v.lat as number]);

    if (!coords.length) return;
    if (coords.length === 1) {
      map.easeTo({ center: coords[0] as [number, number], zoom: 6 });
      return;
    }

    const bounds = coords.reduce(
      (b, c) => b.extend(c as [number, number]),
      new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
    );
    map.fitBounds(bounds, { padding: 64, maxZoom: 7, duration: 500 });
  }, [myVisitors]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function buildPopupHTML(p: any) {
  return `
    <div style="font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto;">
      <div style="font-weight:600;margin-bottom:4px">${p.name || "Visitor"}</div>
      ${p.email ? `<div>${p.email}</div>` : ""}
      ${p.city ? `<div>${p.city}${p.countryCode ? `, ${p.countryCode}` : ""}</div>` : ""}
      ${p.assignedTerritoryKey ? `<div style="opacity:.8">Territory: ${p.assignedTerritoryKey}</div>` : ""}
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
