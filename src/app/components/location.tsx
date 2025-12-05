"use client";
import { useEffect, useState } from "react";
import {
  MAPBOX_TOKEN,
  MAPBOX_API_BASE_URL,
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  GEOLOCATION_TIMEOUT,
  GEOLOCATION_MAX_AGE,
} from "../constants";

const CurLocation = () => {
  const [location, setLocation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError(ERROR_MESSAGES.GEOLOCATION_NOT_SUPPORTED);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const mapboxUrl = `${MAPBOX_API_BASE_URL}/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}`;
          const response = await fetch(mapboxUrl);
          if (!response.ok) throw new Error(ERROR_MESSAGES.MAPBOX_FETCH_FAILED);
          const data = await response.json();
          if (data && data.features && data.features.length > 0) {
            setLocation(data.features[0].place_name);
          } else {
            setLocation(`${latitude}, ${longitude}`);
          }
        } catch (err) {
          setError(ERROR_MESSAGES.ADDRESS_FETCH_FAILED);
          setLocation(`${latitude}, ${longitude}`);
        }
      },
      () => {
        setError(ERROR_MESSAGES.GEOLOCATION_ACCESS_DENIED);
      },
      {
        timeout: GEOLOCATION_TIMEOUT,
        maximumAge: GEOLOCATION_MAX_AGE,
      }
    );
  }, []);

  if (error) {
    return <div><h3 className="hTitle">Current location:</h3><p>{error}</p></div>;
  }

  return <div><h3 className="hTitle">Current location:</h3><p>{location ? location : STATUS_MESSAGES.LOADING_LOCATION}</p></div>;
};

export default CurLocation;