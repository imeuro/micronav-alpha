import {
  MQTT_CONFIG,
  MQTT_TIMEOUT,
  MQTT_RECONNECT_PERIOD,
  MQTT_MAX_RECONNECT_ATTEMPTS,
  MQTT_KEEPALIVE,
  MQTT_STATUS_TIMEOUT,
} from "../../constants";
import type { RouteData } from "../../components/directions";
import type { GeolocationPosition } from "../../hooks/useGeolocation";
import { getManeuverIconName } from "./maneuverIcons";

// Tipi MQTT - importati dinamicamente per evitare problemi SSR
type MqttClient = any;
type IClientOptions = any;
type ISubscriptionGrant = any;

// Tipi per i messaggi MQTT
export interface MQTTStatusMessage {
  status: "online" | "offline";
  timestamp: number;
  client?: string;
}

export interface MQTTRouteMessage {
  type: "route";
  origin: string;
  originCoords: { lat: number; lng: number };
  destination: string;
  destCoords: { lat: number; lng: number };
  totalDistance: number;
  totalDuration: number;
  timestamp: number;
  routeGeometry: [number, number][]; // [lat, lng]
  steps: MQTTRouteStep[];
  message?: string; // Per route aborted
}

export interface MQTTRouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    bearing?: number;
  };
  icon: string;
  coordinates: {
    start: { lat: number; lng: number } | null;
    end: { lat: number; lng: number } | null;
    geometry: [number, number][]; // [lat, lng]
  };
}

export interface MQTTPositionMessage {
  type: "position";
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface MQTTNavigationStepMessage {
  type: "navigation_step";
  current_step: number;
  total_steps: number;
  instruction: string;
  distance: number;
  duration: number;
  icon: string;
  bearing?: number;
}

export interface MQTTCommandMessage {
  type: "request_route" | "request_position" | string;
  [key: string]: any;
}

export interface MQTTDeviceConnections {
  wifi: boolean;
  mqtt: boolean;
  gps: boolean;
  gps_has_fix?: boolean;
}

export interface MQTTDeviceStatus {
  status: "online" | "offline";
  timestamp: number;
}

// Callback types
export type ConnectionChangeCallback = (connected: boolean) => void;
export type RaspberryStatusChangeCallback = (connected: boolean) => void;
export type MessageCallback = (topic: string, data: any) => void;
export type DeviceConnectionsCallback = (connections: MQTTDeviceConnections) => void;

/**
 * Classe per gestire la connessione MQTT e la comunicazione con il dispositivo Raspberry Pi
 */
export class MQTTManager {
  private mqttClient: MqttClient | null = null;
  private mqttModule: typeof import("mqtt") | null = null;
  private isMQTTConnected: boolean = false;
  private mqttReconnectAttempts: number = 0;
  private maxMQTTReconnectAttempts: number = MQTT_MAX_RECONNECT_ATTEMPTS;
  private isRPiConnected: boolean = false;
  private RPiIP: string | null = null;
  private RPiUpdateInterval: number = 60000; // 1 minuto

  // Callbacks per eventi
  private onConnectionChange: ConnectionChangeCallback | null = null;
  private onRaspberryStatusChange: RaspberryStatusChangeCallback | null = null;
  private onMessage: MessageCallback | null = null;
  private onDeviceConnections: DeviceConnectionsCallback | null = null;

  // Funzioni helper per ottenere route e geolocation (da passare dal Context)
  private getCurrentRoute: (() => RouteData | null) | null = null;
  private getCurrentPosition: (() => Promise<GeolocationPosition | null>) | null = null;

  /**
   * Inizializza il modulo MQTT caricando dinamicamente mqtt.js
   */
  async initialize(): Promise<void> {
    console.log("🔌 Inizializzazione MQTT...");

    // Import dinamico di mqtt solo lato client
    if (typeof window === "undefined") {
      console.warn("⚠️ MQTT può essere inizializzato solo lato client");
      return;
    }

    try {
      // Import dinamico di mqtt solo lato client
      const mqttImport = await import("mqtt");
      // Gestisce sia l'export default che named export
      // mqtt v5 può esportare sia come default che come named export
      const mqttModule = mqttImport.default || mqttImport;
      this.mqttModule = mqttModule as any;
      console.log("✅ MQTT.js caricato", { hasConnect: typeof (mqttModule as any).connect === "function" });

      // Tentativo di connessione automatica con retry
      try {
        await this.connectToMQTT();
        console.log("✅ Connessione MQTT automatica riuscita");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
        console.warn("⚠️ Connessione MQTT automatica fallita:", errorMessage);
        // Avvia retry automatico
        await this.retryMQTTConnection();
      }
    } catch (error) {
      console.error("❌ Errore caricamento MQTT.js:", error);
    }
  }

  /**
   * Connette al broker MQTT
   */
  async connectToMQTT(): Promise<boolean> {
    if (this.isMQTTConnected) {
      console.log("⚠️ MQTT già connesso");
      return true;
    }

    if (!this.mqttModule) {
      throw new Error("MQTT module non caricato");
    }

    try {
      // Opzioni di connessione MQTT
      const options: IClientOptions = {
        clientId: `micronav-app-${Date.now()}`,
        username: MQTT_CONFIG.MQTT_USERNAME,
        password: MQTT_CONFIG.MQTT_PASSWORD,
        clean: true,
        reconnectPeriod: MQTT_RECONNECT_PERIOD,
        connectTimeout: MQTT_TIMEOUT,
        keepalive: MQTT_KEEPALIVE,
        will: {
          topic: `micronav/app/${MQTT_CONFIG.DEVICE_ID}/status`,
          payload: JSON.stringify({
            status: "offline",
            timestamp: Date.now(),
          } as MQTTStatusMessage),
          qos: 1,
          retain: true,
        },
      };

      // Connessione al broker
      // Gestisce sia mqtt.connect che mqtt.default.connect
      const mqttModule = this.mqttModule as any;
      const connectFn = mqttModule.connect || mqttModule.default?.connect;
      
      if (!connectFn || typeof connectFn !== "function") {
        console.error("Modulo MQTT:", {
          hasConnect: typeof mqttModule.connect === "function",
          hasDefault: !!mqttModule.default,
          hasDefaultConnect: typeof mqttModule.default?.connect === "function",
          keys: Object.keys(mqttModule).slice(0, 10),
        });
        throw new Error("Funzione connect non trovata nel modulo MQTT");
      }
      
      this.mqttClient = connectFn(MQTT_CONFIG.MQTT_BROKER, options);

      // Gestione eventi MQTT
      this.setupMQTTEventHandlers();

      return new Promise((resolve, reject) => {
        if (!this.mqttClient) {
          reject(new Error("Client MQTT non inizializzato"));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error("Timeout connessione MQTT"));
        }, MQTT_TIMEOUT);

        this.mqttClient.on("connect", () => {
          clearTimeout(timeout);
          this.isMQTTConnected = true;
          this.mqttReconnectAttempts = 0;

          console.log("✅ Connesso al broker MQTT");

          // Sottoscrivi ai topics
          this.subscribeToMQTTTopics();

          // Invia stato online
          this.publishMQTTMessage(
            `micronav/app/${MQTT_CONFIG.DEVICE_ID}/status`,
            {
              status: "online",
              timestamp: Date.now(),
              client: "app",
            } as MQTTStatusMessage,
            1,
            true
          );

          // Check if Raspberry Pi is online
          this.checkRaspberryStatus();

          // Get device connections status
          this.getDeviceConnectionsStatus();

          // Callback per cambio connessione
          if (this.onConnectionChange) {
            this.onConnectionChange(true);
          }

          resolve(true);
        });

        this.mqttClient.on("error", (error: Error) => {
          clearTimeout(timeout);
          console.error("❌ Errore MQTT:", error);
          reject(error);
        });
      });
    } catch (error) {
      console.error("❌ Errore connessione MQTT:", error);
      throw error;
    }
  }

  /**
   * Disconnette dal broker MQTT
   */
  async disconnectMQTT(): Promise<void> {
    try {
      if (this.mqttClient && this.isMQTTConnected) {
        // Invia stato offline
        await this.publishMQTTMessage(
          `micronav/app/${MQTT_CONFIG.DEVICE_ID}/status`,
          {
            status: "offline",
            timestamp: Date.now(),
          } as MQTTStatusMessage,
          1,
          true
        );

        // Disconnetti
        this.mqttClient.end();
      }

      this.isMQTTConnected = false;
      this.mqttClient = null;

      // Callback per cambio connessione
      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
    } catch (error) {
      console.error("❌ Errore disconnessione MQTT:", error);
    }
  }

  /**
   * Configura i gestori eventi MQTT
   */
  private setupMQTTEventHandlers(): void {
    if (!this.mqttClient) return;

    // Gestione disconnessione
    this.mqttClient.on("close", () => {
      console.log("📴 Disconnesso dal broker MQTT");
      this.isMQTTConnected = false;
      this.isRPiConnected = false;

      // Callback per cambio connessione
      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
    });

    // Gestione riconnessione
    this.mqttClient.on("reconnect", () => {
      console.log("🔄 Riconnessione al broker MQTT...");
    });

    // Gestione messaggi ricevuti
    this.mqttClient.on("message", (topic: string, message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleMQTTMessage(topic, data);
      } catch (error) {
        console.error("❌ Errore parsing messaggio MQTT:", error);
      }
    });

    // Gestione errori
    this.mqttClient.on("error", (error: Error) => {
      console.error("❌ Errore MQTT:", error);
    });
  }

  /**
   * Sottoscrive ai topics MQTT necessari
   */
  private subscribeToMQTTTopics(): void {
    if (!this.mqttClient || !this.isMQTTConnected) return;

    const topics = [
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/commands`,
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/system/info`,
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/status`,
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/status/connections`,
    ];

    topics.forEach((topic) => {
      this.mqttClient?.subscribe(topic, { qos: 1 }, (error: Error | null, granted?: ISubscriptionGrant[]) => {
        if (error) {
          console.error(`❌ Errore sottoscrizione topic ${topic}:`, error);
        } else {
          console.log(`✅ Sottoscritto al topic: ${topic}`);
        }
      });
    });
  }

  /**
   * Gestisce i messaggi MQTT ricevuti
   */
  private handleMQTTMessage(topic: string, data: any): void {
    console.log(`📨 Messaggio ricevuto da ${topic}:`, data);

    // Callback per messaggi generici
    if (this.onMessage) {
      this.onMessage(topic, data);
    }

    switch (topic) {
      case `micronav/device/${MQTT_CONFIG.DEVICE_ID}/commands`:
        this.handleRaspberryCommand(data as MQTTCommandMessage);
        break;
      case `micronav/device/${MQTT_CONFIG.DEVICE_ID}/system/info`:
        this.handleRaspberrySystemInfo(data);
        break;
      case `micronav/device/${MQTT_CONFIG.DEVICE_ID}/status`:
        this.handleRaspberryStatus(data as MQTTDeviceStatus);
        break;
      case `micronav/device/${MQTT_CONFIG.DEVICE_ID}/status/connections`:
        this.handleDeviceConnections(data as MQTTDeviceConnections);
        break;
      default:
        console.log("📨 Topic non gestito:", topic);
    }
  }

  /**
   * Gestisce i comandi ricevuti dal Raspberry Pi
   */
  private handleRaspberryCommand(command: MQTTCommandMessage): void {
    console.log("🎮 Comando ricevuto dal Raspberry Pi:", command);

    switch (command.type) {
      case "request_route":
        if (this.getCurrentRoute) {
          const route = this.getCurrentRoute();
          if (route) {
            this.sendRouteToDevice(route);
          }
        }
        break;
      case "request_position":
        if (this.getCurrentPosition) {
          this.getCurrentPosition().then((position) => {
            if (position) {
              this.sendGPSPosition(position.latitude, position.longitude, position.accuracy);
            }
          });
        }
        break;
      default:
        console.log("🎮 Comando non riconosciuto:", command.type);
    }
  }

  /**
   * Gestisce le informazioni di sistema dal Raspberry Pi
   */
  private handleRaspberrySystemInfo(info: any): void {
    console.log("💻 Info sistema Raspberry Pi:", info);
  }

  /**
   * Gestisce lo status del Raspberry Pi
   */
  private handleRaspberryStatus(statusData: MQTTDeviceStatus): void {
    console.log("📊 Status Raspberry Pi ricevuto:", statusData);

    if (statusData && statusData.status && statusData.timestamp) {
      const currentTime = Date.now();
      const statusTime = statusData.timestamp;
      const timeDiff = currentTime - statusTime;

      // Considera il dispositivo online se il timestamp è entro 30 secondi
      const isRecent = timeDiff <= MQTT_STATUS_TIMEOUT;
      const isOnline = statusData.status === "online" && isRecent;

      console.log(
        `🔍 Status check: online=${statusData.status === "online"}, recent=${isRecent}, timeDiff=${timeDiff}ms`
      );
      this.isRPiConnected = isOnline;

      // Callback per cambio status Raspberry Pi
      if (this.onRaspberryStatusChange) {
        this.onRaspberryStatusChange(isOnline);
      }
    } else {
      console.log("⚠️ Dati di status non validi");
      this.isRPiConnected = false;

      // Callback per cambio status Raspberry Pi
      if (this.onRaspberryStatusChange) {
        this.onRaspberryStatusChange(false);
      }
    }
  }

  /**
   * Gestisce lo stato delle connessioni del dispositivo
   */
  private handleDeviceConnections(connections: MQTTDeviceConnections): void {
    console.log("📡 Stato connessioni dispositivo:", connections);

    if (this.onDeviceConnections) {
      this.onDeviceConnections(connections);
    }
  }

  /**
   * Controlla lo status del Raspberry Pi
   */
  async checkRaspberryStatus(): Promise<void> {
    if (!this.mqttClient || !this.isMQTTConnected) {
      console.warn("⚠️ MQTT non connesso, impossibile controllare status Raspberry Pi");
      return;
    }

    try {
      console.log("🔍 Controllo status Raspberry Pi...");

      // Richiedi lo status attuale
      await this.publishMQTTMessage(
        `micronav/device/${MQTT_CONFIG.DEVICE_ID}/status/request`,
        {
          request: "status",
          timestamp: Date.now(),
          client: "app",
        },
        1,
        false
      );

      console.log("📤 Richiesta status inviata al Raspberry Pi");
    } catch (error) {
      console.error("❌ Errore nel controllo status Raspberry Pi:", error);
    }
  }

  /**
   * Ottiene lo stato delle connessioni del dispositivo
   */
  getDeviceConnectionsStatus(): void {
    if (!this.isMQTTConnected) {
      console.warn("⚠️ MQTT non connesso, impossibile ottenere stato device");
      return;
    }

    // La sottoscrizione è già gestita in subscribeToMQTTTopics
    // I messaggi vengono gestiti in handleDeviceConnections
  }

  /**
   * Pubblica un messaggio MQTT
   */
  async publishMQTTMessage(
    topic: string,
    data: any,
    qos: 0 | 1 | 2 = 0,
    retain: boolean = false
  ): Promise<boolean> {
    if (!this.mqttClient || !this.isMQTTConnected) {
      console.warn("⚠️ MQTT non connesso, impossibile inviare messaggio");
      return false;
    }

    try {
      const message = JSON.stringify(data);
      this.mqttClient.publish(topic, message, { qos, retain }, (error: Error | undefined) => {
        if (error) {
          console.error(`❌ Errore pubblicazione topic ${topic}:`, error);
        } else {
          console.log(`📤 Messaggio pubblicato su ${topic}:`, data);
        }
      });
      return true;
    } catch (error) {
      console.error("❌ Errore pubblicazione MQTT:", error);
      return false;
    }
  }

  /**
   * Invia il percorso al dispositivo
   */
  async sendRouteToDevice(routeData: RouteData): Promise<boolean> {
    if (!routeData || !routeData.route) {
      console.warn("⚠️ Nessun percorso disponibile per l'invio");
      return false;
    }

    const { route, origin, destination } = routeData;

    // Estrai coordinate del percorso (GeoJSON geometry)
    const routeGeometry = route.geometry ? route.geometry.coordinates : [];

    // Log per debug
    console.log(
      "🔍 Route geometry:",
      route.geometry ? "presente" : "assente",
      routeGeometry.length,
      "punti"
    );
    if (!route.geometry || routeGeometry.length === 0) {
      console.warn("⚠️ Route geometry vuota o assente!");
    }

    // Estrai coordinate per ogni step
    const stepsWithCoordinates: MQTTRouteStep[] = route.legs[0].steps.map((step: any, index: number) => {
      const stepGeometry = step.geometry ? step.geometry.coordinates : [];
      const maneuverLocation = step.maneuver && step.maneuver.location ? step.maneuver.location : null;

      // Punto di partenza dello step
      let startPoint: [number, number] | null = null;
      if (stepGeometry.length > 0) {
        startPoint = stepGeometry[0];
      } else if (maneuverLocation) {
        startPoint = maneuverLocation;
      }

      // Punto di arrivo dello step
      let endPoint: [number, number] | null = null;
      if (stepGeometry.length > 0) {
        endPoint = stepGeometry[stepGeometry.length - 1];
      } else if (index < route.legs[0].steps.length - 1) {
        const nextStep = route.legs[0].steps[index + 1];
        if (nextStep && nextStep.maneuver && nextStep.maneuver.location) {
          endPoint = nextStep.maneuver.location;
        }
      } else if (maneuverLocation) {
        endPoint = maneuverLocation;
      }

      const coordinatesObj = {
        start: startPoint ? { lat: startPoint[1], lng: startPoint[0] } : null,
        end: endPoint ? { lat: endPoint[1], lng: endPoint[0] } : null,
        geometry: stepGeometry.map((coord: [number, number]) => [coord[1], coord[0]]) as [number, number][], // [lat, lng]
      };

      // Funzione helper per ottenere icona
      const iconName = step.maneuver ? getManeuverIconName(step.maneuver) : "unknown";

      return {
        instruction: step.maneuver.instruction,
        distance: Math.round(step.distance),
        duration: Math.round(step.duration / 60),
        maneuver: {
          type: step.maneuver.type,
          modifier: step.maneuver.modifier,
          bearing: step.maneuver.bearing_after,
        },
        icon: iconName,
        coordinates: coordinatesObj,
      };
    });

    const routeMessage: MQTTRouteMessage = {
      type: "route",
      origin: origin.address,
      originCoords: { lat: origin.lat, lng: origin.lng },
      destination: destination.address,
      destCoords: { lat: destination.lat, lng: destination.lng },
      totalDistance: Math.round(route.distance),
      totalDuration: Math.round(route.duration),
      timestamp: Date.now(),
      routeGeometry: routeGeometry.map((coord: [number, number]) => [coord[1], coord[0]]) as [number, number][], // [lat, lng]
      steps: stepsWithCoordinates,
    };

    // Log per debug
    console.log("📤 Route message preparato:", {
      hasRouteGeometry: routeMessage.routeGeometry.length > 0,
      routeGeometryLength: routeMessage.routeGeometry.length,
      stepsCount: routeMessage.steps.length,
      hasDestCoords: !!routeMessage.destCoords,
      destCoords: routeMessage.destCoords,
      stepsWithCoords: routeMessage.steps.filter(
        (s) => s.coordinates.start || s.coordinates.end || s.coordinates.geometry.length > 0
      ).length,
    });

    return await this.publishMQTTMessage(
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/route/data`,
      routeMessage,
      1, // QoS 1 per garantire la consegna
      true // Retained per mantenere l'ultimo percorso
    );
  }

  /**
   * Cancella il percorso sul dispositivo
   */
  async clearRouteToDevice(): Promise<boolean> {
    const routeMessage: MQTTRouteMessage = {
      type: "route",
      message: "route aborted",
      timestamp: Date.now(),
      origin: "",
      originCoords: { lat: 0, lng: 0 },
      destination: "",
      destCoords: { lat: 0, lng: 0 },
      totalDistance: 0,
      totalDuration: 0,
      routeGeometry: [],
      steps: [],
    };
    return await this.publishMQTTMessage(
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/route/data`,
      routeMessage,
      1, // QoS 1 per garantire la consegna
      true // Retained per mantenere l'ultimo percorso
    );
  }

  /**
   * Invia la posizione GPS al dispositivo
   */
  async sendGPSPosition(latitude: number, longitude: number, accuracy: number): Promise<boolean> {
    const positionMessage: MQTTPositionMessage = {
      type: "position",
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now(),
    };

    return await this.publishMQTTMessage(
      `micronav/app/${MQTT_CONFIG.DEVICE_ID}/position`,
      positionMessage,
      0 // QoS 0 per posizioni frequenti
    );
  }

  /**
   * Invia lo step di navigazione corrente
   */
  async sendCurrentNavigationStep(stepIndex: number, routeData: RouteData): Promise<boolean> {
    if (!routeData || !routeData.route || !routeData.route.legs || stepIndex < 0 || stepIndex >= routeData.route.legs[0].steps.length) {
      return false;
    }

    const step = routeData.route.legs[0].steps[stepIndex];
    
    // Funzione helper per ottenere icona
    const iconName = step.maneuver ? getManeuverIconName(step.maneuver) : "unknown";

    const stepMessage: MQTTNavigationStepMessage = {
      type: "navigation_step",
      current_step: stepIndex + 1,
      total_steps: routeData.route.legs[0].steps.length,
      instruction: step.maneuver.instruction,
      distance: Math.round(step.distance),
      duration: Math.round(step.duration / 60),
      icon: iconName,
      bearing: step.maneuver.bearing_after,
    };

    return await this.publishMQTTMessage(
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/route/step`,
      stepMessage,
      1 // QoS 1 per istruzioni critiche
    );
  }

  /**
   * Invia un messaggio di test
   */
  async sendTestMessage(): Promise<boolean> {
    if (!this.isMQTTConnected) {
      console.warn("⚠️ MQTT non connesso! Connetti prima al broker.");
      return false;
    }

    const testMessage = {
      type: "test",
      message: "Test dalla app",
      timestamp: Date.now(),
      client: "app",
    };

    return await this.publishMQTTMessage(`micronav/device/${MQTT_CONFIG.DEVICE_ID}/test`, testMessage, 1);
  }

  /**
   * Invia un comando al dispositivo
   */
  async sendCommandToDevice(command: string): Promise<boolean> {
    if (!this.isMQTTConnected) {
      console.warn("⚠️ MQTT non connesso! Connetti prima al broker.");
      return false;
    }

    const commandMessage = {
      command: command,
    };

    return await this.publishMQTTMessage(
      `micronav/device/${MQTT_CONFIG.DEVICE_ID}/commands`,
      commandMessage,
      1
    );
  }

  /**
   * Retry automatico con backoff esponenziale
   */
  private async retryMQTTConnection(attempt: number = 1): Promise<boolean> {
    const maxAttempts = 3;
    const baseDelay = 2000; // 2 secondi base

    if (attempt > maxAttempts) {
      console.log("❌ Massimo numero di tentativi MQTT raggiunto");
      return false;
    }

    const delay = baseDelay * Math.pow(2, attempt - 1); // Backoff esponenziale
    console.log(`🔄 Tentativo MQTT ${attempt}/${maxAttempts} tra ${delay}ms...`);

    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await this.connectToMQTT();
          console.log(`✅ Connessione MQTT riuscita al tentativo ${attempt}`);
          resolve(true);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
          console.warn(`⚠️ Tentativo MQTT ${attempt} fallito:`, errorMessage);
          const result = await this.retryMQTTConnection(attempt + 1);
          resolve(result);
        }
      }, delay);
    });
  }

  // Getter
  getConnectionStatus(): boolean {
    return this.isMQTTConnected;
  }

  getRaspberryStatus(): boolean {
    return this.isRPiConnected;
  }

  // Setter per i callback
  setOnConnectionChange(callback: ConnectionChangeCallback | null): void {
    this.onConnectionChange = callback;
  }

  setOnRaspberryStatusChange(callback: RaspberryStatusChangeCallback | null): void {
    this.onRaspberryStatusChange = callback;
  }

  setOnMessage(callback: MessageCallback | null): void {
    this.onMessage = callback;
  }

  setOnDeviceConnections(callback: DeviceConnectionsCallback | null): void {
    this.onDeviceConnections = callback;
  }

  // Setter per funzioni helper
  setGetCurrentRoute(fn: (() => RouteData | null) | null): void {
    this.getCurrentRoute = fn;
  }

  setGetCurrentPosition(fn: (() => Promise<GeolocationPosition | null>) | null): void {
    this.getCurrentPosition = fn;
  }
}

