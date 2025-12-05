import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "./components/navigation";
import styles from "./page.module.css";
import { RouteProvider } from "./contexts/RouteContext";
import { MQTTProvider } from "./contexts/MQTTContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Micronav Alpha",
  description: "Micronav Alpha",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ErrorBoundary>
          <header className={styles.header}>
            <h1 className={styles.logo}>
              <img src="/img/micronav.svg" alt="Micronav (Alpha)" width={300} height={100} />
              <span>Alpha</span>
            </h1>
            {/* <Navigation /> */}
          </header>
          <main>
            <RouteProvider>
              <MQTTProvider>
                {children}
              </MQTTProvider>
            </RouteProvider>
          </main>
          <footer>
            <p className={styles.footerText}>Copyright 2025 - Micronav Alpha</p>
          </footer>
        </ErrorBoundary>
      </body>
    </html>
  );
}

// Componente per gestire errori e prevenire ricariche automatiche
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  if (typeof window !== "undefined") {
    // Previeni ricariche automatiche causate da errori non gestiti
    window.addEventListener("error", (event) => {
      console.error("Errore JavaScript non gestito:", event.error);
      event.preventDefault(); // Previeni il comportamento di default (ricarica)
    });

    window.addEventListener("unhandledrejection", (event) => {
      console.error("Promise rejection non gestita:", event.reason);
      event.preventDefault(); // Previeni il comportamento di default
    });
  }

  return <>{children}</>;
}
