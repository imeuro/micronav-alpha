"use client";
import {
  MAPBOX_TOKEN,
  MAPBOX_API_BASE_URL,
  ERROR_MESSAGES,
  GEOLOCATION_TIMEOUT,
  GEOLOCATION_MAX_AGE,
} from "../constants";

export interface Coordinates {
  lat: number;
  lng: number;
  address: string;
}

export interface RouteData {
  route: any;
  waypoints: any;
  origin: Coordinates;
  destination: Coordinates;
  profile: string;
  language: string;
}

// Geocoding di un indirizzo
export const geocodeAddress = async (address: string): Promise<Coordinates> => {
  const encodedAddress = encodeURIComponent(address);
  const url = `${MAPBOX_API_BASE_URL}/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=IT&language=it`;

  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Geocoding fallito: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.features && data.features.length > 0) {
    const [lng, lat] = data.features[0].center;
    return { lat, lng, address: data.features[0].place_name };
  }
  
  throw new Error(`Indirizzo non trovato: ${address}`);
};

// Calcolo percorso tra due punti
export const calculateRouteBetweenPoints = async (
  origin: Coordinates,
  destination: Coordinates,
  profile: string = 'driving',
  language: string = 'it'
): Promise<RouteData> => {
  const { lng: originLng, lat: originLat } = origin;
  const { lng: destLng, lat: destLat } = destination;
  
  const coordinates = `${originLng},${originLat};${destLng},${destLat}`;
  
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&steps=true&language=${language}&annotations=duration,distance`;

  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Calcolo percorso fallito: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.routes && data.routes.length > 0) {
    return {
      route: data.routes[0],
      waypoints: data.waypoints,
      origin: origin,
      destination: destination,
      profile: profile,
      language: language
    };
  }
  
  throw new Error('Nessun percorso trovato');
};

// Ottiene le coordinate della location corrente
export const getCurrentLocationCoordinates = async (): Promise<Coordinates> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(ERROR_MESSAGES.GEOLOCATION_NOT_SUPPORTED));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Reverse geocoding per ottenere l'indirizzo
          const mapboxUrl = `${MAPBOX_API_BASE_URL}/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
          const response = await fetch(mapboxUrl);
          
          if (!response.ok) {
            throw new Error(ERROR_MESSAGES.MAPBOX_FETCH_FAILED);
          }
          
          const data = await response.json();
          const address = data && data.features && data.features.length > 0
            ? data.features[0].place_name
            : `${latitude}, ${longitude}`;
          
          resolve({ lat: latitude, lng: longitude, address });
        } catch (err) {
          // Se il reverse geocoding fallisce, usiamo le coordinate
          resolve({ lat: latitude, lng: longitude, address: `${latitude}, ${longitude}` });
        }
      },
      () => {
        reject(new Error(ERROR_MESSAGES.GEOLOCATION_ACCESS_DENIED));
      },
      {
        timeout: GEOLOCATION_TIMEOUT,
        maximumAge: GEOLOCATION_MAX_AGE,
      }
    );
  });
};

// Calcola il percorso tra location corrente e destinazione
export const calculateRoute = async (
  destination: string,
  currentLocationCoords: Coordinates | null,
  selectedDestinationCoords: Coordinates | null,
  suggestions: Array<{ place_name: string; center: [number, number] }>,
  setCurrentLocationCoords: (coords: Coordinates) => void,
  setSelectedDestinationCoords: (coords: Coordinates) => void,
  setLocation: (location: string) => void
): Promise<RouteData> => {
  if (destination.length < 3) {
    throw new Error("Inserisci una destinazione valida (minimo 3 caratteri)");
  }

  // Step 1: Ottieni coordinate location corrente
  let originCoords: Coordinates;
  
  if (currentLocationCoords) {
    originCoords = currentLocationCoords;
    console.log('✅ Usando coordinate salvate per origine');
  } else {
    originCoords = await getCurrentLocationCoordinates();
    setCurrentLocationCoords(originCoords);
    setLocation(originCoords.address);
  }

  // Step 2: Geocoding destinazione
  // Controlla se abbiamo coordinate salvate dalla suggestion selezionata
  let destCoords: Coordinates;
  
  if (selectedDestinationCoords && selectedDestinationCoords.address === destination) {
    destCoords = selectedDestinationCoords;
    console.log('✅ Usando coordinate salvate per destinazione');
  } else {
    // Prova a trovare nelle suggestions attuali
    const selectedSuggestion = suggestions.find(s => s.place_name === destination);
    
    if (selectedSuggestion) {
      const [lng, lat] = selectedSuggestion.center;
      destCoords = { lat, lng, address: destination };
      setSelectedDestinationCoords(destCoords);
      console.log('✅ Usando coordinate dalla suggestion per destinazione');
    } else {
      destCoords = await geocodeAddress(destination);
      setSelectedDestinationCoords(destCoords);
    }
  }

  if (!originCoords || !destCoords) {
    throw new Error('Impossibile geocodificare uno degli indirizzi');
  }

  // Step 3: Calcolo percorso
  const routeData = await calculateRouteBetweenPoints(
    originCoords,
    destCoords,
    'driving',
    'it'
  );

  return routeData;
};

// Componente per visualizzare le indicazioni del percorso
import { useRoute } from "../contexts/RouteContext";
import "@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css";
import styles from "./directions.module.css";

const Directions = () => {
  const { routeData } = useRoute();

  if (!routeData || !routeData.route || !routeData.route.legs || routeData.route.legs.length === 0) {
    return null;
  }

  const leg = routeData.route.legs[0];
  const steps = leg.steps || [];
  const totalDistance = Math.round(routeData.route.distance);
  const totalDuration = Math.round(routeData.route.duration / 60); // in minuti

  // Funzione per formattare la distanza
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Funzione per formattare la durata
  const formatDuration = (seconds: number): string => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  };

  // Funzione per ottenere la classe CSS dell'icona della manovra
  // Basato su @mapbox/mapbox-gl-directions
  // Mantiene la logica di normalizzazione per gestire correttamente type e modifier
  const getManeuverIconClass = (type: string, modifier?: string): string => {
    const baseClass = "directions-icon";
    
    // Normalizza il modifier: converte spazi in trattini e gestisce casi speciali
    const normalizeModifier = (mod?: string): string | null => {
      if (!mod) return null;
      // Converte spazi in trattini (es: "slight right" -> "slight-right")
      let normalized = mod.replace(/\s+/g, '-').toLowerCase();
      // Gestisce casi speciali
      if (normalized === "u-turn" || normalized === "uturn" || normalized === "u_turn") {
        return "u-turn";
      }
      return normalized;
    };
    
    const normalizedModifier = normalizeModifier(modifier);
    const normalizedType = type.toLowerCase().replace(/\s+/g, '-');
    
    // Casi speciali che non dipendono dal modifier
    if (normalizedType === "arrive") {
      return `${baseClass} ${baseClass}-arrive`;
    }
    if (normalizedType === "depart") {
      return `${baseClass} ${baseClass}-depart`;
    }
    if (normalizedType === "roundabout" || normalizedType === "rotary") {
      return `${baseClass} ${baseClass}-roundabout`;
    }
    
    // Gestione dei modificatori
    if (normalizedModifier) {
      // Casi speciali per uturn
      if (normalizedModifier === "u-turn" || normalizedModifier === "uturn") {
        return `${baseClass} ${baseClass}-u-turn`;
      }
      
      // Modificatori direzionali
      if (normalizedModifier === "sharp-left") {
        return `${baseClass} ${baseClass}-sharp-left`;
      }
      if (normalizedModifier === "sharp-right") {
        return `${baseClass} ${baseClass}-sharp-right`;
      }
      if (normalizedModifier === "slight-left") {
        return `${baseClass} ${baseClass}-slight-left`;
      }
      if (normalizedModifier === "slight-right") {
        return `${baseClass} ${baseClass}-slight-right`;
      }
      if (normalizedModifier === "left") {
        return `${baseClass} ${baseClass}-left`;
      }
      if (normalizedModifier === "right") {
        return `${baseClass} ${baseClass}-right`;
      }
    }
    
    // Default: straight (per continue, straight, o quando non c'è modifier)
    return `${baseClass} ${baseClass}-straight`;
  };

  return (
    <div className={styles.directionsWrapper}>
      <div className={styles.directionsHeader}>
        <h2 className={styles.directionsTitle}>Indicazioni di percorso</h2>
        <div className={styles.routeSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Distanza:</span>
            <span className={styles.summaryValue}>{formatDistance(totalDistance)}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Durata:</span>
            <span className={styles.summaryValue}>{formatDuration(routeData.route.duration)}</span>
          </div>
        </div>
      </div>

      <div className={styles.stepsContainer}>
        <ol className={styles.stepsList} role="list">
          {steps.map((step: any, index: number) => {
            const stepDistance = Math.round(step.distance);
            const stepDuration = Math.round(step.duration / 60);
            const maneuverType = step.maneuver?.type || 'straight';
            const maneuverModifier = step.maneuver?.modifier;
            const instruction = step.maneuver?.instruction || step.name || 'Continua';
            const iconClass = getManeuverIconClass(maneuverType, maneuverModifier);

            return (
              <li key={index} className={styles.stepItem} role="listitem">
                <div className={styles.stepContent}>
                  <div className={`${styles.stepIcon} ${iconClass}`} aria-hidden="true" />
                  <div className={styles.stepDetails}>
                    <div className={styles.stepInstruction} dangerouslySetInnerHTML={{ __html: instruction }} />
                    <div className={styles.stepMeta}>
                      <span className={styles.stepDistance}>{formatDistance(stepDistance)}</span>
                      {stepDuration > 0 && (
                        <span className={styles.stepDuration}>{stepDuration} min</span>
                      )}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && <div className={styles.stepConnector} aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

export default Directions;

