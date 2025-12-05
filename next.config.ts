import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  webpack: (config, { isServer }) => {
    // Escludi mqtt dal bundle server-side
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("mqtt");
    }
    return config;
  },
  // Configurazione Turbopack per escludere mqtt dal bundle server-side
  turbopack: {
    resolveAlias: {
      // Turbopack gestisce automaticamente gli externals in modo diverso
      // ma possiamo lasciare vuoto se la configurazione webpack è sufficiente
    },
  },
  // Forza l'uso di webpack per la build di produzione se necessario
  experimental: {
    // Se vuoi forzare webpack anche in produzione, decommenta:
    // webpackBuildWorker: true,
  },
};

export default nextConfig;
