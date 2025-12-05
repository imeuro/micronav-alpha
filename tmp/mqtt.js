// ===== MODULO MQTT E RASPBERRY PI =====
// Gestisce tutte le funzioni relative a MQTT e comunicazione con Raspberry Pi

// Import della configurazione
import { MQTT_CONFIG } from './config.js';

class MQTTManager {
    constructor() {
        this.mqttClient = null;
        this.isMQTTConnected = false;
        this.mqttReconnectAttempts = 0;
        this.maxMQTTReconnectAttempts = 5;
        this.isRPiConnected = false;
        this.RPiIP = null;
        this.RPiUpdateInterval = 60000; // 1 minuto
        
        // Callbacks per eventi
        this.onConnectionChange = null;
        this.onRaspberryStatusChange = null;
        this.onMessage = null;
    }

    // Funzione per inizializzare MQTT
    async initialize() {
        console.log('🔌 Inizializzazione MQTT...');
        
        // Controlla se MQTT.js è disponibile
        if (typeof mqtt === 'undefined') {
            console.error('❌ MQTT.js non caricato');
            return;
        }
        
        console.log('✅ MQTT.js disponibile');
        
        // Tentativo di connessione automatica con retry
        try {
            await this.connectToMQTT();
            console.log('✅ Connessione MQTT automatica riuscita');
        } catch (error) {
            console.warn('⚠️ Connessione MQTT automatica fallita:', error.message);
            // Avvia retry automatico
            await this.retryMQTTConnection();
        }
    }

    // Funzione per connettere al broker MQTT
    async connectToMQTT() {
        if (this.isMQTTConnected) {
            console.log('⚠️ MQTT già connesso');
            return true;
        }

        try {
            this.showStatus('<i class="fas fa-plug"></i> Connessione al broker MQTT...', 'info');
            
            // Opzioni di connessione MQTT
            const options = {
                clientId: `micronav-app-${Date.now()}`,
                username: MQTT_CONFIG?.MQTT_USERNAME,
                password: MQTT_CONFIG?.MQTT_PASSWORD,
                clean: true,
                reconnectPeriod: 5000,
                connectTimeout: 30 * 1000,
                keepalive: 60,
                will: {
                    topic: `micronav/app/${MQTT_CONFIG?.DEVICE_ID}/status`,
                    payload: JSON.stringify({
                        status: 'offline',
                        timestamp: Date.now()
                    }),
                    qos: 1,
                    retain: true
                }
            };

            // Connessione al broker
            this.mqttClient = mqtt.connect(MQTT_CONFIG?.MQTT_BROKER, options);
            
            // Gestione eventi MQTT
            this.setupMQTTEventHandlers();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout connessione MQTT'));
                }, 30000);

                this.mqttClient.on('connect', () => {
                    clearTimeout(timeout);
                    this.isMQTTConnected = true;
                    this.mqttReconnectAttempts = 0;
                    
                    console.log('✅ Connesso al broker MQTT');
                    this.updateRaspberrySectionState(true);
                    
                    // Sottoscrivi ai topics
                    this.subscribeToMQTTTopics();
                    
                    // Invia stato online
                    this.publishMQTTMessage(`micronav/app/${MQTT_CONFIG?.DEVICE_ID}/status`, {
                        status: 'online',
                        timestamp: Date.now(),
                        client: 'app'
                    }, 1, true);

                    // check if Raspberry Pi is online
                    this.checkRaspberryStatus();
                    
                    // Get device connections status
                    this.getDeviceConnectionsStatus();
                    
                    // Callback per cambio connessione
                    if (this.onConnectionChange) {
                        this.onConnectionChange(true);
                    }
                    
                    resolve(true);
                });

                this.mqttClient.on('error', (error) => {
                    clearTimeout(timeout);
                    console.error('❌ Errore MQTT:', error);
                    this.showMQTTConnectionError(error);
                    reject(error);
                });
            });
            
        } catch (error) {
            console.error('❌ Errore connessione MQTT:', error);
            this.showMQTTConnectionError(error);
            throw error;
        }
    }

    // Funzione per disconnettere MQTT
    async disconnectMQTT() {
        try {
            if (this.mqttClient && this.isMQTTConnected) {
                // Invia stato offline
                await this.publishMQTTMessage(`micronav/device/${MQTT_CONFIG?.DEVICE_ID}/status`, {
                    status: 'offline',
                    timestamp: Date.now()
                }, 1, true);
                
                // Disconnetti
                this.mqttClient.end();
            }
            
            this.isMQTTConnected = false;
            this.mqttClient = null;
            
            this.showStatus('<i class="fas fa-wifi-slash"></i> Disconnesso dal broker MQTT', 'info');
            this.updateRaspberrySectionState(false);
            
            // Callback per cambio connessione
            if (this.onConnectionChange) {
                this.onConnectionChange(false);
            }
            
        } catch (error) {
            console.error('❌ Errore disconnessione MQTT:', error);
        }
    }

    // Funzione per configurare i gestori eventi MQTT
    setupMQTTEventHandlers() {
        if (!this.mqttClient) return;

        // Gestione disconnessione
        this.mqttClient.on('disconnect', () => {
            console.log('📴 Disconnesso dal broker MQTT');
            this.isMQTTConnected = false;
            this.updateRaspberrySectionState(false);
            
            // Callback per cambio connessione
            if (this.onConnectionChange) {
                this.onConnectionChange(false);
            }
        });

        // Gestione riconnessione
        this.mqttClient.on('reconnect', () => {
            console.log('<i class="fas fa-sync-alt"></i> Riconnessione al broker MQTT...');
        });

        // Gestione messaggi ricevuti
        this.mqttClient.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                this.handleMQTTMessage(topic, data);
            } catch (error) {
                console.error('❌ Errore parsing messaggio MQTT:', error);
            }
        });

        // Gestione errori
        this.mqttClient.on('error', (error) => {
            console.error('❌ Errore MQTT:', error);
            this.showStatus(`<i class="fas fa-exclamation-triangle"></i> Errore MQTT: ${error.message}`, 'error');
        });
    }

    // Funzione per sottoscriversi ai topics MQTT
    subscribeToMQTTTopics() {
        if (!this.mqttClient || !this.isMQTTConnected) return;

        const topics = [
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/commands`,
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/system/info`,
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/status`,
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/status/connections`
        ];

        topics.forEach(topic => {
            this.mqttClient.subscribe(topic, { qos: 1 }, (error) => {
                if (error) {
                    console.error(`❌ Errore sottoscrizione topic ${topic}:`, error);
                } else {
                    console.log(`✅ Sottoscritto al topic: ${topic}`);
                }
            });
        });
    }

    // Funzione per gestire messaggi MQTT ricevuti
    handleMQTTMessage(topic, data) {
        console.log(`📨 Messaggio ricevuto da ${topic}:`, data);
        
        // Callback per messaggi generici
        if (this.onMessage) {
            this.onMessage(topic, data);
        }
        
        switch (topic) {
            case `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/commands`:
                this.handleRaspberryCommand(data);
                break;
            case `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/system/info`:
                this.handleRaspberrySystemInfo(data);
                break;
            case `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/status`:
                this.handleRaspberryStatus(data);
                break;
            default:
                console.log('📨 Topic non gestito:', topic);
        }
    }

    // Funzione per gestire comandi dal Raspberry Pi
    handleRaspberryCommand(command) {
        console.log('🎮 Comando ricevuto dal Raspberry Pi:', command);
        
        switch (command.type) {
            case 'request_route':
                if (window.currentRoute) {
                    this.sendRouteToDevice(window.currentRoute);
                }
                break;
            case 'request_position':
                if (window.geolocationManager && window.geolocationManager.getCurrentPosition()) {
                    const position = window.geolocationManager.getCurrentPosition();
                    this.sendGPSPosition(position.latitude, position.longitude, position.accuracy);
                }
                break;
            default:
                console.log('🎮 Comando non riconosciuto:', command.type);
        }
    }

    // Funzione per gestire informazioni di sistema dal Raspberry Pi
    handleRaspberrySystemInfo(info) {
        console.log('💻 Info sistema Raspberry Pi:', info);
        // Qui puoi aggiornare l'UI con le informazioni del Raspberry Pi
    }

    // Funzione per gestire lo status del Raspberry Pi
    handleRaspberryStatus(statusData) {
        console.log('📊 Status Raspberry Pi ricevuto:', statusData);
        
        if (statusData && statusData.status && statusData.timestamp) {
            const currentTime = Math.floor(Date.now() / 1000);
            const statusTime = statusData.timestamp;
            const timeDiff = currentTime - statusTime;
            
            // Considera il dispositivo online se il timestamp è entro 30 secondi
            const isRecent = timeDiff <= 30000; // 30 secondi
            const isOnline = statusData.status === 'online' && isRecent;
            
            console.log(`🔍 Status check: online=${statusData.status === 'online'}, recent=${isRecent}, timeDiff=${timeDiff}ms`);
            this.isRPiConnected = isOnline;
            
            if (isOnline) {
                console.log('✅ Raspberry Pi è online e attivo');
                this.updateRaspberrySectionState(true);
            } else {
                console.log('❌ Raspberry Pi è offline o timestamp troppo vecchio');
                this.updateRaspberrySectionState(false);
            }
            
            // Callback per cambio status Raspberry Pi
            if (this.onRaspberryStatusChange) {
                this.onRaspberryStatusChange(isOnline);
            }
        } else {
            console.log('⚠️ Dati di status non validi');
            this.updateRaspberrySectionState(false);
            
            // Callback per cambio status Raspberry Pi
            if (this.onRaspberryStatusChange) {
                this.onRaspberryStatusChange(false);
            }
        }
    }

    // Funzione per controllare lo status del Raspberry Pi
    async checkRaspberryStatus() {
        if (!this.mqttClient || !this.isMQTTConnected) {
            console.warn('⚠️ MQTT non connesso, impossibile controllare status Raspberry Pi');
            return;
        }
        
        try {
            console.log('🔍 Controllo status Raspberry Pi...');
            
            // Richiedi lo status attuale
            await this.publishMQTTMessage(`micronav/device/${MQTT_CONFIG?.DEVICE_ID}/status/request`, {
                request: 'status',
                timestamp: Date.now(),
                client: 'app'
            }, 1, false);
            
            console.log('📤 Richiesta status inviata al Raspberry Pi');
            
        } catch (error) {
            console.error('❌ Errore nel controllo status Raspberry Pi:', error);
        }
    }

    // Funzione per pubblicare messaggi MQTT
    async publishMQTTMessage(topic, data, qos = 0, retain = false) {
        if (!this.mqttClient || !this.isMQTTConnected) {
            console.warn('⚠️ MQTT non connesso, impossibile inviare messaggio');
            return false;
        }

        try {
            const message = JSON.stringify(data);
            this.mqttClient.publish(topic, message, { qos, retain }, (error) => {
                if (error) {
                    console.error(`❌ Errore pubblicazione topic ${topic}:`, error);
                } else {
                    console.log(`📤 Messaggio pubblicato su ${topic}:`, data);
                }
            });
            return true;
        } catch (error) {
            console.error('❌ Errore pubblicazione MQTT:', error);
            return false;
        }
    }

    // Funzione per inviare percorso al Raspberry Pi
    async sendRouteToDevice(routeData) {
        if (!routeData || !routeData.route) {
            console.warn('⚠️ Nessun percorso disponibile per l\'invio');
            return false;
        }

        const { route, origin, destination } = routeData;
        
        // Estrai coordinate del percorso (GeoJSON geometry)
        const routeGeometry = route.geometry ? route.geometry.coordinates : [];
        
        // Log per debug
        console.log('🔍 Route geometry:', route.geometry ? 'presente' : 'assente', routeGeometry.length, 'punti');
        if (!route.geometry || routeGeometry.length === 0) {
            console.warn('⚠️ Route geometry vuota o assente!');
        }
        
        // Estrai coordinate per ogni step (lat, lng per ogni punto di svolta)
        const stepsWithCoordinates = route.legs[0].steps.map((step, index) => {
            // Le coordinate degli step sono nel geometry se disponibile
            const stepGeometry = step.geometry ? step.geometry.coordinates : [];
            const maneuverLocation = step.maneuver && step.maneuver.location ? step.maneuver.location : null;
            
            // Log per debug (solo per i primi 2 step)
            if (index < 2) {
                console.log(`🔍 Step ${index}:`, {
                    hasGeometry: !!step.geometry,
                    geometryLength: stepGeometry.length,
                    hasManeuverLocation: !!maneuverLocation,
                    maneuverLocation: maneuverLocation
                });
            }
            
            // Punto di partenza dello step (inizio della manovra)
            let startPoint = null;
            if (stepGeometry.length > 0) {
                // Usa il primo punto della geometry
                startPoint = stepGeometry[0];
            } else if (maneuverLocation) {
                // Fallback: usa la location della manovra (sempre disponibile in Mapbox)
                startPoint = maneuverLocation;
                if (index < 2) {
                    console.log(`✅ Step ${index}: usando maneuver.location per startPoint`);
                }
            } else {
                if (index < 2) {
                    console.warn(`⚠️ Step ${index}: nessuna coordinate disponibile per startPoint`);
                }
            }
            
            // Punto di arrivo dello step (fine della manovra)
            let endPoint = null;
            if (stepGeometry.length > 0) {
                // Usa l'ultimo punto della geometry
                endPoint = stepGeometry[stepGeometry.length - 1];
            } else if (index < route.legs[0].steps.length - 1) {
                // Fallback: usa la location della manovra dello step successivo
                const nextStep = route.legs[0].steps[index + 1];
                if (nextStep && nextStep.maneuver && nextStep.maneuver.location) {
                    endPoint = nextStep.maneuver.location;
                    if (index < 2) {
                        console.log(`✅ Step ${index}: usando nextStep.maneuver.location per endPoint`);
                    }
                }
            } else {
                // Ultimo step: usa la location della manovra corrente
                if (maneuverLocation) {
                    endPoint = maneuverLocation;
                    if (index < 2) {
                        console.log(`✅ Step ${index}: usando maneuver.location per endPoint (ultimo step)`);
                    }
                }
            }
            
            const coordinatesObj = {
                start: startPoint ? { lat: startPoint[1], lng: startPoint[0] } : null,
                end: endPoint ? { lat: endPoint[1], lng: endPoint[0] } : null,
                geometry: stepGeometry.map(coord => [coord[1], coord[0]]) // [lat, lng]
            };
            
            // Log per debug (solo per i primi 2 step)
            if (index < 2) {
                console.log(`🔍 Step ${index} coordinates:`, {
                    start: coordinatesObj.start,
                    end: coordinatesObj.end,
                    geometryLength: coordinatesObj.geometry.length
                });
            }
            
            return {
                instruction: step.maneuver.instruction,
                distance: Math.round(step.distance),
                duration: Math.round(step.duration / 60),
                maneuver: {
                    type: step.maneuver.type,
                    modifier: step.maneuver.modifier,
                    bearing: step.maneuver.bearing_after
                },
                icon: window.MapIcons ? window.MapIcons.getManeuverIconName(step.maneuver) : 'unknown',
                // Coordinate per il routing automatico
                coordinates: coordinatesObj
            };
        });
        
        const routeMessage = {
            type: 'route',
            origin: origin.address,
            originCoords: { lat: origin.lat, lng: origin.lng },
            destination: destination.address,
            destCoords: { lat: destination.lat, lng: destination.lng },
            totalDistance: Math.round(route.distance),
            totalDuration: Math.round(route.duration),
            timestamp: Date.now(),
            // Coordinate complete del percorso (per calcolo distanza dal percorso)
            routeGeometry: routeGeometry.map(coord => [coord[1], coord[0]]), // [lat, lng]
            steps: stepsWithCoordinates
        };
        
        // Log per debug
        console.log('📤 Route message preparato:', {
            hasRouteGeometry: routeMessage.routeGeometry.length > 0,
            routeGeometryLength: routeMessage.routeGeometry.length,
            stepsCount: routeMessage.steps.length,
            hasDestCoords: !!routeMessage.destCoords,
            destCoords: routeMessage.destCoords,
            stepsWithCoords: routeMessage.steps.filter(s => s.coordinates.start || s.coordinates.end || s.coordinates.geometry.length > 0).length
        });

        return await this.publishMQTTMessage(
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/route/data`,
            routeMessage,
            1, // QoS 1 per garantire la consegna
            true // Retained per mantenere l'ultimo percorso
        );
    }
    // Funzione per inviare percorso al Raspberry Pi
    async clearRouteToDevice() {
        const routeMessage = {
            type: 'route',
            message: 'route aborted',
            timestamp: Date.now(),
            client: 'app'
        };
        return await this.publishMQTTMessage(
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/route/data`,
            routeMessage,
            1, // QoS 1 per garantire la consegna
            true // Retained per mantenere l'ultimo percorso
        );
    }


    // Funzione per inviare posizione GPS al Raspberry Pi
    async sendGPSPosition(latitude, longitude, accuracy) {
        const positionMessage = {
            type: 'position',
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            timestamp: Date.now()
        };

        return await this.publishMQTTMessage(
            `micronav/app/${MQTT_CONFIG?.DEVICE_ID}/position`,
            positionMessage,
            0 // QoS 0 per posizioni frequenti
        );
    }

    // Funzione per inviare step di navigazione corrente
    async sendCurrentNavigationStep(stepIndex) {
        if (!window.currentRoute || !window.currentRoute.legs || stepIndex < 0 || stepIndex >= window.currentRoute.legs[0].steps.length) {
            return false;
        }

        const step = window.currentRoute.legs[0].steps[stepIndex];
        const stepMessage = {
            type: 'navigation_step',
            current_step: stepIndex + 1,
            total_steps: window.currentRoute.legs[0].steps.length,
            instruction: step.maneuver.instruction,
            distance: Math.round(step.distance),
            duration: Math.round(step.duration / 60),
            icon: window.MapIcons ? window.MapIcons.getManeuverIconName(step.maneuver) : 'unknown',
            bearing: step.maneuver.bearing_after
        };

        return await this.publishMQTTMessage(
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/route/step`,
            stepMessage,
            1 // QoS 1 per istruzioni critiche
        );
    }

    // Funzione per inviare messaggio di test
    async sendTestMessage() {
        if (!this.isMQTTConnected) {
            this.showStatus('<i class="fas fa-exclamation-triangle"></i> MQTT non connesso! Connetti prima al broker.', 'error');
            return;
        }
        
        const testMessage = {
            type: 'test',
            message: 'Test dalla app',
            timestamp: Date.now(),
            client: 'app'
        };
        
        const success = await this.publishMQTTMessage(
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/test`,
            testMessage,
            1
        );
        
        if (success) {
            this.showStatus('<i class="fas fa-check-circle"></i> Messaggio di test inviato al Raspberry Pi!', 'success');
        } else {
            this.showStatus('<i class="fas fa-exclamation-triangle"></i> Errore invio messaggio di test', 'error');
        }
    }

    // Funzione per inviare comando al Raspberry Pi
    async sendCommandToDevice(command) {
        if (!this.isMQTTConnected) {
            this.showStatus('<i class="fas fa-exclamation-triangle"></i> MQTT non connesso! Connetti prima al broker.', 'error');
            return;
        }

        const commandMessage = {
            command: command,
        };

        const success = await this.publishMQTTMessage(
            `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/commands`,
            commandMessage,
            1
        );

        if (success) {
            this.showStatus('<i class="fas fa-check-circle"></i> Comando inviato al Raspberry Pi!', 'success');
        } else {
            this.showStatus('<i class="fas fa-exclamation-triangle"></i> Errore invio comando', 'error');
        }
    }

    // Funzione per mostrare errori di connessione MQTT
    showMQTTConnectionError(error) {
        let errorMessage = 'Errore di connessione MQTT';
        
        if (error.message.includes('Timeout')) {
            errorMessage = 'Timeout connessione MQTT - Verifica la rete';
        } else if (error.message.includes('WebSocket')) {
            errorMessage = 'Errore WebSocket - Verifica il broker MQTT';
        } else if (error.message.includes('Authentication')) {
            errorMessage = 'Errore autenticazione MQTT';
        } else {
            errorMessage = `Errore MQTT: ${error.message}`;
        }
        
        this.showStatus(`<i class="fas fa-exclamation-triangle"></i> ${errorMessage}`, 'error');
    }

    // Funzione per retry automatico con backoff
    async retryMQTTConnection(attempt = 1) {
        const maxAttempts = 3;
        const baseDelay = 2000; // 2 secondi base
        
        if (attempt > maxAttempts) {
            console.log('❌ Massimo numero di tentativi MQTT raggiunto');
            return false;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1); // Backoff esponenziale
        console.log(`<i class="fas fa-sync-alt"></i> Tentativo MQTT ${attempt}/${maxAttempts} tra ${delay}ms...`);
        
        setTimeout(async () => {
            try {
                await this.connectToMQTT();
                console.log(`✅ Connessione MQTT riuscita al tentativo ${attempt}`);
            } catch (error) {
                console.warn(`⚠️ Tentativo MQTT ${attempt} fallito:`, error.message);
                await this.retryMQTTConnection(attempt + 1);
            }
        }, delay);
        
        return true;
    }

    // Funzione per aggiornare controlli Raspberry Pi
    updateRaspberryControls(connected) {
        const actionBtns = document.querySelectorAll('#raspberryContent .button-row .btn');
        
        if (actionBtns) {
            if (connected) {
                actionBtns.forEach(btn => btn.disabled = false);
            } else {
                actionBtns.forEach(btn => btn.disabled = true);
            }
        }
    }

    // Funzione per aggiornare lo stato della sezione Raspberry Pi
    updateRaspberrySectionState(isConnected = null) {
        const raspberrySection = document.getElementById('raspberrySection');
        const raspberryTitle = document.getElementById('raspberryTitle');
        
        if (!raspberrySection || !raspberryTitle) return;
        
        // Determina se Raspberry Pi è connesso
        if (isConnected !== null) {
            this.isRPiConnected = isConnected;
        }
        
        if (this.isRPiConnected) {
            raspberrySection.classList.add('connected');
            this.updateRaspberryTitle('<i class="fas fa-check-circle"></i> Connesso');
        }
        else {
            raspberrySection.classList.remove('connected');
            this.updateRaspberryTitle('<i class="fas fa-exclamation-triangle"></i> Disconnesso');
        }
        
        this.updateRaspberryControls(this.isRPiConnected);
    }

    // Funzione per aggiornare il titolo della sezione Raspberry Pi
    updateRaspberryTitle(statusText) {
        const raspberryTitle = document.getElementById('raspberryTitle');
        if (!raspberryTitle) return;
        
        // Rimuovi eventuali indicatori di stato esistenti
        const existingStatus = raspberryTitle.querySelector('.config-status');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        // Aggiungi nuovo indicatore di stato
        const statusSpan = document.createElement('span');
        statusSpan.className = `config-status ${this.isRPiConnected ? 'connected' : 'disconnected'}`;
        statusSpan.innerHTML = statusText;
        
        raspberryTitle.appendChild(statusSpan);
    }

    // Ottieni stato connessioni device
    getDeviceConnectionsStatus() {
        if (!this.isMQTTConnected) {
            console.warn('⚠️ MQTT non connesso, impossibile ottenere stato device');
            return;
        }

        // Sottoscrivi al topic delle connessioni
        this.mqttClient.subscribe(`micronav/device/${MQTT_CONFIG?.DEVICE_ID}/status/connections`, {qos: 1});

        // Handler per i messaggi di stato connessioni
        this.mqttClient.on('message', (topic, message) => {
            if (topic === `micronav/device/${MQTT_CONFIG?.DEVICE_ID}/status/connections`) {
                try {
                    const connections = JSON.parse(message.toString());
                    
                    // Aggiorna indicatori di stato
                    const wifiStatus = connections.wifi ? 'Connesso' : 'Disconnesso';
                    const mqttStatus = connections.mqtt ? 'Connesso' : 'Disconnesso';
                    const gpsStatus = connections.gps ? (connections.gps_has_fix ? 'Connesso' : 'Ricerca...') : 'Disconnesso';

                    // Aggiorna elementi UI
                    const deviceWifiStatus = document.getElementById('wifiStatus');
                    const deviceMqttStatus = document.getElementById('mqttStatus');
                    const deviceGpsStatus = document.getElementById('gpsStatus');

                    if (deviceWifiStatus) {
                        deviceWifiStatus.textContent = wifiStatus;
                        deviceWifiStatus.className = 'status-value ' + (connections.wifi ? 'good' : 'bad');
                    }

                    if (deviceMqttStatus) {
                        deviceMqttStatus.textContent = mqttStatus; 
                        deviceMqttStatus.className = 'status-value ' + (connections.mqtt ? 'good' : 'bad');
                    }

                    if (deviceGpsStatus) {
                        deviceGpsStatus.textContent = gpsStatus;
                        deviceGpsStatus.className = 'status-value ' + 
                            (connections.gps ? (connections.gps_has_fix ? 'good' : 'warning') : 'bad');
                    }

                } catch (error) {
                    console.error('❌ Errore parsing stato connessioni:', error);
                }
            }
        });
    }

    // Funzione per mostrare status (da integrare con il sistema principale)
    showStatus(message, type = 'info') {
        const status = document.getElementById('status');
        if (status) {
            status.innerHTML = message;
            status.className = `status ${type}`;
            status.style.display = 'block';
            
            // Auto-hide dopo 5 secondi per success/info
            if (type !== 'error') {
                setTimeout(() => {
                    status.style.display = 'none';
                }, 5000);
            }
        }
    }

    // Getter per lo stato della connessione
    getConnectionStatus() {
        return this.isMQTTConnected;
    }

    getRaspberryStatus() {
        return this.isRPiConnected;
    }

    // Setter per i callback
    setOnConnectionChange(callback) {
        this.onConnectionChange = callback;
    }

    setOnRaspberryStatusChange(callback) {
        this.onRaspberryStatusChange = callback;
    }

    setOnMessage(callback) {
        this.onMessage = callback;
    }
}

// Esporta la classe come modulo ES6
export { MQTTManager };
