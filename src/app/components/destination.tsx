"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  MAPBOX_TOKEN,
  MAPBOX_API_BASE_URL,
  ERROR_MESSAGES,
  STATUS_MESSAGES,
} from "../constants";
import {
  calculateRoute,
  type Coordinates,
  type RouteData,
} from "./directions";
import { useRoute } from "../contexts/RouteContext";
import styles from "./destination.module.css";

interface Suggestion {
  id: string;
  place_name: string;
  center: [number, number];
}

const Destination = () => {
  const { setRouteData } = useRoute();
  const [location, setLocation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState<string>("");
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [currentLocationCoords, setCurrentLocationCoords] = useState<Coordinates | null>(null);
  const [selectedDestinationCoords, setSelectedDestinationCoords] = useState<Coordinates | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const encodedQuery = encodeURIComponent(query);
      const mapboxUrl = `${MAPBOX_API_BASE_URL}/${encodedQuery}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=place,address,poi`;
      const response = await fetch(mapboxUrl);
      
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.MAPBOX_FETCH_FAILED);
      }
      
      const data = await response.json();
      if (data && data.features) {
        setSuggestions(data.features);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDestination(value);
    setDestinationError(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  };

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    setDestination(suggestion.place_name);
    // Salva le coordinate della destinazione selezionata
    const [lng, lat] = suggestion.center;
    setSelectedDestinationCoords({ lat, lng, address: suggestion.place_name });
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") {
        previewDirections(destination);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionSelect(suggestions[selectedIndex]);
        } else {
          previewDirections(destination);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const previewDirections = async (dest: string) => {
    setIsCalculatingRoute(true);
    setDestinationError(null);

    try {
      const routeData = await calculateRoute(
        dest,
        currentLocationCoords,
        selectedDestinationCoords,
        suggestions,
        setCurrentLocationCoords,
        setSelectedDestinationCoords,
        setLocation
      );

      // Salva i dati del percorso nel context per la visualizzazione
      setRouteData(routeData);
      
      // Log risultati
      console.log("Percorso calcolato con successo:", routeData);
      console.log("Distanza:", routeData.route.distance, "metri");
      console.log("Durata:", routeData.route.duration, "secondi");

    } catch (error) {
      console.error('Errore calcolo percorso:', error);
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setDestinationError(`Errore: ${errorMessage}`);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const clearResults = () => {
    setDestination("");
    setDestinationError(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    setSelectedDestinationCoords(null);
    setRouteData(null);
    inputRef.current?.blur();
  };

  useEffect(() => {
    if (selectedIndex >= 0 && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  if (destinationError) {
    return <p><strong>Your destination:</strong> {destinationError}</p>;
  }

  if (error) {
    return <p><strong>Your destination:</strong> {error}</p>;
  }

  return (
    <div className={styles.destinationWrapper}>
      <h3 className="hTitle">Your destination:</h3>
      <div className={styles.inputContainer}>
        <input
          id="destination"
          ref={inputRef}
          type="text"
          placeholder="Enter your destination"
          value={destination}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          aria-label="Enter your destination"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls="destination-suggestions"
          aria-activedescendant={
            selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined
          }
          className={styles.destinationInput}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul
            id="destination-suggestions"
            ref={suggestionsRef}
            className={styles.suggestionsList}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`suggestion-${index}`}
                role="option"
                aria-selected={selectedIndex === index}
                className={`${styles.suggestionItem} ${
                  selectedIndex === index ? styles.suggestionItemActive : ""
                }`}
                onClick={() => handleSuggestionSelect(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {suggestion.place_name}
              </li>
            ))}
          </ul>
        )}
        {isLoading && (
          <div className={styles.loadingIndicator} aria-live="polite" aria-label="Loading suggestions">
            Loading...
          </div>
        )}

        <div className={styles.buttonsContainer}>
          <button
            onClick={() => previewDirections(destination)}
            className={styles.searchButton}
            aria-label="Get Directions"
            disabled={isCalculatingRoute || destination.length < 3}
          >
            {isCalculatingRoute ? "Calcolo percorso..." : "Get Directions"}
          </button>
          <button id="clearBtn" className={styles.clearButton} onClick={clearResults} disabled={isCalculatingRoute}><i className="fas fa-trash"></i>
            Clear</button>
          {destinationError && (
            <div className={styles.errorMessage} role="alert" aria-live="polite">
              {destinationError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Destination;