"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useRoute } from "../contexts/RouteContext";
import { MAPBOX_TOKEN } from "../constants";
import styles from "./map.module.css";

const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { routeData } = useRoute();

  // Inizializza la mappa
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [12.4964, 41.9028], // Roma di default
      zoom: 13,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
      // Forza il resize della mappa per assicurarsi che rispetti le dimensioni del container
      if (map.current) {
        map.current.resize();
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Pulisci la mappa quando routeData diventa null
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (!routeData) {
      // Rimuovi layer e source esistenti se presenti
      if (map.current.getLayer("route")) {
        map.current.removeLayer("route");
      }
      if (map.current.getSource("route")) {
        map.current.removeSource("route");
      }

      // Rimuovi marker esistenti
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    }
  }, [routeData, mapLoaded]);

  // Aggiorna la mappa quando cambia routeData
  useEffect(() => {
    if (!map.current || !mapLoaded || !routeData) return;

    const routeGeometry = routeData.route.geometry;
    const origin = routeData.origin;
    const destination = routeData.destination;

    // Rimuovi layer e source esistenti se presenti
    if (map.current.getLayer("route")) {
      map.current.removeLayer("route");
    }
    if (map.current.getSource("route")) {
      map.current.removeSource("route");
    }

    // Rimuovi marker esistenti
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Verifica che routeGeometry sia valido
    if (!routeGeometry || !routeGeometry.coordinates || routeGeometry.coordinates.length === 0) {
      return;
    }

    // Aggiungi il percorso
    map.current.addSource("route", {
      type: "geojson",
      data: routeGeometry,
    });

    map.current.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#3b82f6",
        "line-width": 4,
        "line-opacity": 0.8,
      },
    });

    // Aggiungi marker per origine
    const originMarker = new mapboxgl.Marker({ color: "#10b981" })
      .setLngLat([origin.lng, origin.lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 25 }).setHTML(
          `<strong>Partenza</strong><br>${origin.address}`
        )
      )
      .addTo(map.current);
    markersRef.current.push(originMarker);

    // Aggiungi marker per destinazione
    const destinationMarker = new mapboxgl.Marker({ color: "#ef4444" })
      .setLngLat([destination.lng, destination.lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 25 }).setHTML(
          `<strong>Destinazione</strong><br>${destination.address}`
        )
      )
      .addTo(map.current);
    markersRef.current.push(destinationMarker);

    // Adatta il viewport per mostrare tutto il percorso
    const coordinates = routeGeometry.coordinates as [number, number][];
    const bounds = coordinates.reduce(
      (bounds, coord) => {
        return bounds.extend(coord as [number, number]);
      },
      new mapboxgl.LngLatBounds(
        coordinates[0] as [number, number],
        coordinates[0] as [number, number]
      )
    );

    // Forza il resize della mappa prima di fitBounds
    map.current.resize();

    // Aggiungi padding per i marker
    map.current.fitBounds(bounds, {
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      duration: 1000,
    });
  }, [routeData, mapLoaded]);

  return (
    <div className={`${styles.mapWrapper} ${!routeData ? styles.hidden : ''}`}>
      <div ref={mapContainer} className={styles.mapContainer} />
    </div>
  );
};

export default Map;

