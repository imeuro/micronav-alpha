/**
 * File contenente tutte le variabili globali dell'applicazione
 */

// API Keys e Tokens
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "YOUR_MAPBOX_ACCESS_TOKEN";

// Configurazioni API
export const MAPBOX_API_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

// Configurazioni applicazione
export const APP_NAME = "Micronav Alpha";
export const APP_VERSION = "0.0.12";

// Timeout e limiti
export const GEOLOCATION_TIMEOUT = 10000; // 10 secondi
export const GEOLOCATION_MAX_AGE = 60000; // 1 minuto

// Messaggi di errore
export const ERROR_MESSAGES = {
  GEOLOCATION_NOT_SUPPORTED: "Geolocation is not supported by your browser.",
  GEOLOCATION_ACCESS_DENIED: "Unable to access location.",
  GEOLOCATION_POSITION_UNAVAILABLE: "Position unavailable.",
  GEOLOCATION_TIMEOUT: "Timeout requesting position.",
  ADDRESS_FETCH_FAILED: "Unable to determine exact address.",
  MAPBOX_FETCH_FAILED: "Failed to fetch address from Mapbox",
} as const;

// Messaggi di stato
export const STATUS_MESSAGES = {
  LOADING_LOCATION: "Loading...",
} as const;

// Configurazione MQTT
export const MQTT_CONFIG = {
  MQTT_BROKER: process.env.NEXT_PUBLIC_MQTT_BROKER,
  MQTT_USERNAME: process.env.NEXT_PUBLIC_MQTT_USERNAME,
  MQTT_PASSWORD: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
  DEVICE_ID: process.env.NEXT_PUBLIC_MQTT_DEVICE_ID
} as const;

// Timeout e limiti MQTT
export const MQTT_TIMEOUT = 30000; // 30 secondi
export const MQTT_RECONNECT_PERIOD = 5000; // 5 secondi
export const MQTT_MAX_RECONNECT_ATTEMPTS = 5;
export const MQTT_KEEPALIVE = 60; // secondi
export const MQTT_RPI_UPDATE_INTERVAL = 60000; // 1 minuto
export const MQTT_STATUS_TIMEOUT = 30000; // 30 secondi per considerare un dispositivo online

