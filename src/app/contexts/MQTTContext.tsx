"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { MQTTManager } from "../lib/mqtt/MQTTManager";
import { useRoute } from "./RouteContext";
import { useGeolocation } from "../hooks/useGeolocation";
import type { RouteData } from "../components/directions";
import type { GeolocationPosition } from "../hooks/useGeolocation";
import type { MQTTDeviceConnections } from "../lib/mqtt/MQTTManager";

interface MQTTContextType {
  mqttManager: MQTTManager | null;
  isConnected: boolean;
  isRaspberryConnected: boolean;
  deviceConnections: MQTTDeviceConnections | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendRoute: (routeData: RouteData) => Promise<boolean>;
  clearRoute: () => Promise<boolean>;
  sendGPSPosition: (latitude: number, longitude: number, accuracy: number) => Promise<boolean>;
  sendCurrentNavigationStep: (stepIndex: number) => Promise<boolean>;
  sendTestMessage: () => Promise<boolean>;
  sendCommand: (command: string) => Promise<boolean>;
}

const MQTTContext = createContext<MQTTContextType | undefined>(undefined);

export const MQTTProvider = ({ children }: { children: ReactNode }) => {
  const [mqttManager, setMqttManager] = useState<MQTTManager | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRaspberryConnected, setIsRaspberryConnected] = useState<boolean>(false);
  const [deviceConnections, setDeviceConnections] = useState<MQTTDeviceConnections | null>(null);
  const { routeData } = useRoute();
  const { getCurrentPosition, position, watchPosition, clearWatch } = useGeolocation();

  // Inizializza MQTTManager al mount
  useEffect(() => {
    const manager = new MQTTManager();

    // Configura callback per cambio connessione
    manager.setOnConnectionChange((connected: boolean) => {
      setIsConnected(connected);
    });

    // Configura callback per cambio status Raspberry Pi
    manager.setOnRaspberryStatusChange((connected: boolean) => {
      setIsRaspberryConnected(connected);
    });

    // Configura callback per connessioni dispositivo
    manager.setOnDeviceConnections((connections: MQTTDeviceConnections) => {
      setDeviceConnections(connections);
    });

    // Configura funzione per ottenere route corrente
    manager.setGetCurrentRoute(() => routeData);

    // Configura funzione per ottenere posizione corrente
    manager.setGetCurrentPosition(() => getCurrentPosition());

    setMqttManager(manager);

    // Inizializza connessione
    manager.initialize().catch((error) => {
      console.error("Errore inizializzazione MQTT:", error);
    });

    // Cleanup al dismount
    return () => {
      manager.disconnectMQTT().catch((error) => {
        console.error("Errore disconnessione MQTT:", error);
      });
    };
  }, []); // Solo al mount

  // Aggiorna getCurrentRoute quando routeData cambia
  useEffect(() => {
    if (mqttManager) {
      mqttManager.setGetCurrentRoute(() => routeData);
    }
  }, [mqttManager, routeData]);

  // Aggiorna getCurrentPosition quando cambia
  useEffect(() => {
    if (mqttManager) {
      mqttManager.setGetCurrentPosition(() => getCurrentPosition());
    }
  }, [mqttManager, getCurrentPosition]);

  // Funzione per connettere manualmente
  const connect = useCallback(async () => {
    if (mqttManager) {
      try {
        await mqttManager.connectToMQTT();
      } catch (error) {
        console.error("Errore connessione MQTT:", error);
        throw error;
      }
    }
  }, [mqttManager]);

  // Funzione per disconnettere manualmente
  const disconnect = useCallback(async () => {
    if (mqttManager) {
      try {
        await mqttManager.disconnectMQTT();
      } catch (error) {
        console.error("Errore disconnessione MQTT:", error);
        throw error;
      }
    }
  }, [mqttManager]);

  // Funzione per inviare route
  const sendRoute = useCallback(
    async (routeDataToSend: RouteData): Promise<boolean> => {
      if (mqttManager) {
        return await mqttManager.sendRouteToDevice(routeDataToSend);
      }
      return false;
    },
    [mqttManager]
  );

  // Funzione per cancellare route
  const clearRoute = useCallback(async (): Promise<boolean> => {
    if (mqttManager) {
      return await mqttManager.clearRouteToDevice();
    }
    return false;
  }, [mqttManager]);

  // Funzione per inviare posizione GPS
  const sendGPSPosition = useCallback(
    async (latitude: number, longitude: number, accuracy: number): Promise<boolean> => {
      if (mqttManager) {
        return await mqttManager.sendGPSPosition(latitude, longitude, accuracy);
      }
      return false;
    },
    [mqttManager]
  );

  // Funzione per inviare step corrente
  const sendCurrentNavigationStep = useCallback(
    async (stepIndex: number): Promise<boolean> => {
      if (mqttManager && routeData) {
        return await mqttManager.sendCurrentNavigationStep(stepIndex, routeData);
      }
      return false;
    },
    [mqttManager, routeData]
  );

  // Funzione per inviare messaggio di test
  const sendTestMessage = useCallback(async (): Promise<boolean> => {
    if (mqttManager) {
      return await mqttManager.sendTestMessage();
    }
    return false;
  }, [mqttManager]);

  // Funzione per inviare comando
  const sendCommand = useCallback(
    async (command: string): Promise<boolean> => {
      if (mqttManager) {
        return await mqttManager.sendCommandToDevice(command);
      }
      return false;
    },
    [mqttManager]
  );

  // Invia automaticamente la route quando viene impostata
  useEffect(() => {
    if (mqttManager && routeData && isConnected) {
      sendRoute(routeData)
        .then(() => {
          // Invia immediatamente il primo step (indice 0) dopo aver inviato la route
          console.log("📍 Invio primo step di navigazione...");
          return sendCurrentNavigationStep(0);
        })
        .catch((error) => {
          console.error("Errore invio route o primo step:", error);
        });
    }
  }, [mqttManager, routeData, isConnected, sendRoute, sendCurrentNavigationStep]);

  // Cancella route quando viene rimossa
  useEffect(() => {
    if (mqttManager && !routeData && isConnected) {
      clearRoute().catch((error) => {
        console.error("Errore cancellazione route:", error);
      });
    }
  }, [mqttManager, routeData, isConnected, clearRoute]);

  // Avvia il monitoraggio della posizione GPS quando MQTT è connesso
  useEffect(() => {
    if (isConnected && mqttManager) {
      console.log("📍 Avvio monitoraggio posizione GPS...");
      const watchId = watchPosition();
      
      // Ottieni e invia la posizione corrente immediatamente
      getCurrentPosition().then((pos) => {
        if (pos && mqttManager) {
          console.log("📍 Invio posizione GPS iniziale:", pos);
          sendGPSPosition(pos.latitude, pos.longitude, pos.accuracy).catch((error) => {
            console.error("Errore invio posizione GPS iniziale:", error);
          });
        }
      });
      
      return () => {
        if (watchId !== null) {
          clearWatch();
        }
      };
    } else {
      clearWatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]); // Solo isConnected come dipendenza per evitare loop infiniti

  // Invia automaticamente la posizione GPS quando cambia e MQTT è connesso
  useEffect(() => {
    if (mqttManager && position && isConnected) {
      console.log("📍 Invio posizione GPS:", position);
      sendGPSPosition(position.latitude, position.longitude, position.accuracy).catch((error) => {
        console.error("Errore invio posizione GPS:", error);
      });
    }
  }, [mqttManager, position, isConnected, sendGPSPosition]);

  // Invia anche periodicamente la posizione (ogni 10 secondi) per garantire aggiornamenti
  useEffect(() => {
    if (!mqttManager || !isConnected) return;

    const interval = setInterval(() => {
      if (position) {
        console.log("📍 Invio periodico posizione GPS:", position);
        sendGPSPosition(position.latitude, position.longitude, position.accuracy).catch((error) => {
          console.error("Errore invio periodico posizione GPS:", error);
        });
      } else {
        // Prova a ottenere la posizione corrente se non disponibile
        getCurrentPosition().then((pos) => {
          if (pos && mqttManager) {
            console.log("📍 Invio posizione GPS ottenuta:", pos);
            sendGPSPosition(pos.latitude, pos.longitude, pos.accuracy).catch((error) => {
              console.error("Errore invio posizione GPS:", error);
            });
          }
        });
      }
    }, 10000); // Ogni 10 secondi

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mqttManager, isConnected, position]); // Rimossi getCurrentPosition e sendGPSPosition per evitare loop

  const value: MQTTContextType = {
    mqttManager,
    isConnected,
    isRaspberryConnected,
    deviceConnections,
    connect,
    disconnect,
    sendRoute,
    clearRoute,
    sendGPSPosition,
    sendCurrentNavigationStep,
    sendTestMessage,
    sendCommand,
  };

  return <MQTTContext.Provider value={value}>{children}</MQTTContext.Provider>;
};

export const useMQTT = () => {
  const context = useContext(MQTTContext);
  if (context === undefined) {
    throw new Error("useMQTT must be used within a MQTTProvider");
  }
  return context;
};

