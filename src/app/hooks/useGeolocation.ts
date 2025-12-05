"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  GEOLOCATION_TIMEOUT,
  GEOLOCATION_MAX_AGE,
  ERROR_MESSAGES,
} from "../constants";

export interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface UseGeolocationReturn {
  position: GeolocationPosition | null;
  error: string | null;
  isLoading: boolean;
  getCurrentPosition: () => Promise<GeolocationPosition | null>;
  watchPosition: () => number | null;
  clearWatch: () => void;
}

/**
 * Hook per gestire la geolocalizzazione
 * Fornisce posizione corrente, accuracy e metodi per aggiornare
 */
export const useGeolocation = (): UseGeolocationReturn => {
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const watchIdRef = useRef<number | null>(null);

  // Funzione per ottenere la posizione corrente
  const getCurrentPosition = useCallback((): Promise<GeolocationPosition | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        const errorMsg = ERROR_MESSAGES.GEOLOCATION_NOT_SUPPORTED;
        setError(errorMsg);
        resolve(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (geoPosition) => {
          const newPosition: GeolocationPosition = {
            latitude: geoPosition.coords.latitude,
            longitude: geoPosition.coords.longitude,
            accuracy: geoPosition.coords.accuracy || 0,
            timestamp: geoPosition.timestamp,
          };
          setPosition(newPosition);
          setIsLoading(false);
          resolve(newPosition);
        },
        (geoError) => {
          let errorMsg: string = ERROR_MESSAGES.GEOLOCATION_ACCESS_DENIED;
          if (geoError.code === geoError.PERMISSION_DENIED) {
            errorMsg = ERROR_MESSAGES.GEOLOCATION_ACCESS_DENIED;
          } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
            errorMsg = ERROR_MESSAGES.GEOLOCATION_POSITION_UNAVAILABLE;
          } else if (geoError.code === geoError.TIMEOUT) {
            errorMsg = ERROR_MESSAGES.GEOLOCATION_TIMEOUT;
          }
          setError(errorMsg);
          setIsLoading(false);
          resolve(null);
        },
        {
          timeout: GEOLOCATION_TIMEOUT,
          maximumAge: GEOLOCATION_MAX_AGE,
          enableHighAccuracy: true,
        }
      );
    });
  }, []);

  // Funzione per iniziare a monitorare la posizione
  const watchPosition = useCallback((): number | null => {
    if (!navigator.geolocation) {
      setError(ERROR_MESSAGES.GEOLOCATION_NOT_SUPPORTED);
      return null;
    }

    // Pulisci watch precedente se presente
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setError(null);

    const watchId = navigator.geolocation.watchPosition(
      (geoPosition) => {
        const newPosition: GeolocationPosition = {
          latitude: geoPosition.coords.latitude,
          longitude: geoPosition.coords.longitude,
          accuracy: geoPosition.coords.accuracy || 0,
          timestamp: geoPosition.timestamp,
        };
        setPosition(newPosition);
      },
      (geoError) => {
        let errorMsg: string = ERROR_MESSAGES.GEOLOCATION_ACCESS_DENIED;
        if (geoError.code === geoError.PERMISSION_DENIED) {
          errorMsg = ERROR_MESSAGES.GEOLOCATION_ACCESS_DENIED;
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          errorMsg = ERROR_MESSAGES.GEOLOCATION_POSITION_UNAVAILABLE;
        } else if (geoError.code === geoError.TIMEOUT) {
          errorMsg = ERROR_MESSAGES.GEOLOCATION_TIMEOUT;
        }
        setError(errorMsg);
      },
      {
        timeout: GEOLOCATION_TIMEOUT,
        maximumAge: GEOLOCATION_MAX_AGE,
        enableHighAccuracy: true,
      }
    );

    watchIdRef.current = watchId;
    return watchId;
  }, []);

  // Funzione per fermare il monitoraggio
  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Cleanup al dismount
  useEffect(() => {
    return () => {
      clearWatch();
    };
  }, [clearWatch]);

  return {
    position,
    error,
    isLoading,
    getCurrentPosition,
    watchPosition,
    clearWatch,
  };
};

