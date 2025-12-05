/**
 * Funzione per ottenere il nome del file SVG dell'icona della manovra
 * Basato sulla struttura dei file SVG in public/icons/svg/
 */
export const getManeuverIconName = (maneuver: { type: string; modifier?: string }): string => {
  if (!maneuver || !maneuver.type) {
    return "unknown";
  }

  // Normalizza il modifier: converte spazi in trattini e gestisce casi speciali
  const normalizeModifier = (mod?: string): string | null => {
    if (!mod) return null;
    // Converte spazi in trattini (es: "slight right" -> "slight-right")
    let normalized = mod.replace(/\s+/g, "-").toLowerCase();
    // Gestisce casi speciali
    if (normalized === "u-turn" || normalized === "uturn" || normalized === "u_turn") {
      return "uturn";
    }
    return normalized;
  };

  const normalizedModifier = normalizeModifier(maneuver.modifier);
  const normalizedType = maneuver.type.toLowerCase().replace(/\s+/g, "-");

  // Casi speciali che non dipendono dal modifier
  if (normalizedType === "arrive") {
    if (normalizedModifier === "left") return "arrive_left";
    if (normalizedModifier === "right") return "arrive_right";
    if (normalizedModifier === "straight") return "arrive_straight";
    return "arrive";
  }

  if (normalizedType === "depart") {
    if (normalizedModifier === "left") return "depart_left";
    if (normalizedModifier === "right") return "depart_right";
    if (normalizedModifier === "straight") return "depart_straight";
    return "depart";
  }

  if (normalizedType === "roundabout" || normalizedType === "rotary") {
    if (normalizedModifier === "sharp-left") return "roundabout_sharp_left";
    if (normalizedModifier === "sharp-right") return "roundabout_sharp_right";
    if (normalizedModifier === "slight-left") return "roundabout_slight_left";
    if (normalizedModifier === "slight-right") return "roundabout_slight_right";
    if (normalizedModifier === "left") return "roundabout_left";
    if (normalizedModifier === "right") return "roundabout_right";
    if (normalizedModifier === "straight") return "roundabout_straight";
    return normalizedType === "rotary" ? "rotary" : "roundabout";
  }

  // Gestione dei modificatori per i vari tipi
  if (normalizedModifier) {
    // Casi speciali per uturn
    if (normalizedModifier === "uturn" || normalizedModifier === "u-turn") {
      if (normalizedType === "continue") return "continue_uturn";
      return "uturn";
    }

    // Modificatori direzionali
    const modifierMap: Record<string, string> = {
      "sharp-left": "sharp_left",
      "sharp-right": "sharp_right",
      "slight-left": "slight_left",
      "slight-right": "slight_right",
      left: "left",
      right: "right",
      straight: "straight",
    };

    const mappedModifier = modifierMap[normalizedModifier] || normalizedModifier;

    // Mappa i tipi comuni
    if (normalizedType === "turn") {
      return `turn_${mappedModifier}`;
    }
    if (normalizedType === "continue") {
      return `continue_${mappedModifier}`;
    }
    if (normalizedType === "fork") {
      return `fork_${mappedModifier}`;
    }
    if (normalizedType === "merge") {
      return `merge_${mappedModifier}`;
    }
    if (normalizedType === "on ramp" || normalizedType === "on-ramp") {
      return `on_ramp_${mappedModifier}`;
    }
    if (normalizedType === "off ramp" || normalizedType === "off-ramp") {
      return `off_ramp_${mappedModifier}`;
    }
    if (normalizedType === "new name" || normalizedType === "new-name") {
      return `new_name_${mappedModifier}`;
    }
    if (normalizedType === "notification") {
      return `notification_${mappedModifier}`;
    }
  }

  // Default per continue/straight senza modifier
  if (normalizedType === "continue" || normalizedType === "straight") {
    return "continue_straight";
  }

  // Default: unknown
  return "unknown";
};

