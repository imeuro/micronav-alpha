"use client";
import { createContext, useContext, useState, ReactNode } from "react";
import { type RouteData } from "../components/directions";

interface RouteContextType {
  routeData: RouteData | null;
  setRouteData: (data: RouteData | null) => void;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export const RouteProvider = ({ children }: { children: ReactNode }) => {
  const [routeData, setRouteData] = useState<RouteData | null>(null);

  return (
    <RouteContext.Provider value={{ routeData, setRouteData }}>
      {children}
    </RouteContext.Provider>
  );
};

export const useRoute = () => {
  const context = useContext(RouteContext);
  if (context === undefined) {
    throw new Error("useRoute must be used within a RouteProvider");
  }
  return context;
};

