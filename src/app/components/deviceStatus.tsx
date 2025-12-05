"use client";
import { useState } from "react";
import { useMQTT } from "../contexts/MQTTContext";
import { MQTT_CONFIG } from "../constants";
import styles from "./deviceStatus.module.css";

const DeviceStatus = () => {
  const { isRaspberryConnected, deviceConnections, sendCommand, mqttManager } = useMQTT();
  const [brightness, setBrightness] = useState<number>(100);

  // Funzione helper per ottenere il testo dello stato
  const getStatusText = (status: boolean | null | undefined): string => {
    if (status === null || status === undefined) {
        return "Not available";
    }
    return status ? "Connected" : "Disconnected";
  };

  // Funzione helper per ottenere la classe CSS dello stato
  const getStatusClass = (status: boolean | null | undefined): string => {
    if (status === null || status === undefined) {
      return styles.statusUnknown;
    }
    return status ? styles.statusConnected : styles.statusDisconnected;
  };

  // Funzione per gestire il restart
  const handleRestart = async () => {
    if (isRaspberryConnected) {
      await sendCommand("restart");
    }
  };

  // Funzione per gestire il cambio luminosità
  const handleBrightnessChange = async (value: number) => {
    setBrightness(value);
    if (mqttManager) {
      await mqttManager.publishMQTTMessage(
        `micronav/device/${MQTT_CONFIG.DEVICE_ID}/commands`,
        { command: "set_brightness", value: value },
        1,
        false
      );
    }
  };

  return (
    <div className={styles.deviceStatusWrapper}>
      <div className={styles.deviceStatusHeader}>
        <h2 className={styles.deviceStatusTitle}>Device status</h2>
      </div>

      <div className={styles.statusItems}>
        {/* Stato Device (online/offline) */}
        <div className={styles.statusItem}>
          <div className={styles.statusItemLabel}>Device status</div>
          <div className={styles.statusItemValue}>
            <span className={getStatusClass(isRaspberryConnected)}>
              {isRaspberryConnected ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        {/* Mostra altri parametri solo se il device è online */}
        {isRaspberryConnected && (
          <>
            {/* Connessione WiFi */}
            <div className={styles.statusItem}>
              <div className={styles.statusItemLabel}>WiFi connection</div>
              <div className={styles.statusItemValue}>
                <span className={getStatusClass(deviceConnections?.wifi)}>
                  {getStatusText(deviceConnections?.wifi)}
                </span>
              </div>
            </div>

            {/* Connessione MQTT */}
            <div className={styles.statusItem}>
              <div className={styles.statusItemLabel}>MQTT connection</div>
              <div className={styles.statusItemValue}>
                <span className={getStatusClass(deviceConnections?.mqtt)}>
                  {getStatusText(deviceConnections?.mqtt)}
                </span>
              </div>
            </div>

            {/* Connessione GPS */}
            <div className={styles.statusItem}>
              <div className={styles.statusItemLabel}>GPS connection</div>
              <div className={styles.statusItemValue}>
                <span className={getStatusClass(deviceConnections?.gps)}>
                  {getStatusText(deviceConnections?.gps)}
                  {deviceConnections?.gps && deviceConnections?.gps_has_fix !== undefined && (
                    <span className={styles.gpsFixIndicator}>
                      {" "}
                      ({deviceConnections.gps_has_fix ? "Fix" : "No Fix"})
                    </span>
                  )}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Controlli dispositivo */}
      {/* {isRaspberryConnected && ( */}
        <div className={styles.deviceControls}>
          {/* Slider luminosità */}
          <div className={styles.brightnessSection}>
            <label htmlFor="brightness-slider" className={styles.brightnessLabel}>
              Brightness level
            </label>
            <div className={styles.brightnessContainer}>
              <input
                id="brightness-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={brightness}
                onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                className={styles.brightnessSlider}
                aria-label="Brightness level"
              />
              <output htmlFor="brightness-slider" className={styles.brightnessValue} hidden>
                {brightness}
              </output>
              <div className={styles.brightnessTicks}>
                <div className={styles.brightnessTick} data-value="0"></div>
                <div className={styles.brightnessTick} data-value="25"></div>
                <div className={styles.brightnessTick} data-value="50"></div>
                <div className={styles.brightnessTick} data-value="75"></div>
                <div className={styles.brightnessTick} data-value="100"></div>
              </div>
            </div>
          </div>

          {/* Bottone restart */}
          <button
            type="button"
            onClick={handleRestart}
            className={styles.restartButton}
            aria-label="Restart device"
          >
            Restart device
          </button>
        </div>
      {/* )} */}
    </div>
  );
};

export default DeviceStatus;

