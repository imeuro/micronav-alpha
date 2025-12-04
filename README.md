# Micronav Alpha

Applicazione di navigazione web basata su Next.js e Mapbox.

## Prerequisiti

- Node.js 18+ e npm
- Token di accesso Mapbox ([ottieni qui](https://account.mapbox.com/access-tokens/))
- (Opzionale) mkcert per generare certificati SSL locali

## Installazione

1. Clona il repository:
```bash
git clone <repository-url>
cd micronav-alpha
```

2. Installa le dipendenze:
```bash
npm install
```

3. Configura le variabili d'ambiente:
```bash
cp env.example .env
```

**Nota**: Se il file `env.example` non esiste, crea manualmente un file `.env` nella root del progetto.

Modifica il file `.env` e inserisci il tuo token Mapbox:
```
NEXT_PUBLIC_MAPBOX_TOKEN=il_tuo_token_mapbox
```

4. (Opzionale) Genera certificati SSL per sviluppo HTTPS:
```bash
# Con mkcert (consigliato - certificati validi senza avvisi)
npm run generate-cert:mkcert

# Oppure con OpenSSL (certificati autofirmati)
npm run generate-cert
```

**Nota**: Se vuoi accedere all'applicazione da altri dispositivi sulla stessa rete, imposta anche `NETWORK_IP` nel file `.env` con il tuo IP di rete locale.

## Sviluppo

Avvia il server di sviluppo:

```bash
# Server HTTP standard (porta 3000)
npm run dev

# Server HTTP/HTTPS personalizzato (porte 3000 e 3001)
npm run dev:https
```

Apri [http://localhost:3000](http://localhost:3000) nel browser per vedere l'applicazione.

## Script disponibili

- `npm run dev` - Avvia il server di sviluppo Next.js standard
- `npm run dev:https` - Avvia server HTTP/HTTPS personalizzato
- `npm run generate-cert` - Genera certificati SSL autofirmati con OpenSSL
- `npm run generate-cert:mkcert` - Genera certificati SSL con mkcert (richiede mkcert installato)
- `npm run build` - Crea la build di produzione
- `npm run start` - Avvia il server di produzione
- `npm run lint` - Esegue il linter

## Tecnologie utilizzate

- [Next.js](https://nextjs.org) - Framework React
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) - Mappe interattive
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/) - Calcolo percorsi
- [Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/) - Geocoding

## Deploy

Il modo più semplice per fare il deploy è utilizzare [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Consulta la [documentazione di deployment di Next.js](https://nextjs.org/docs/app/building-your-application/deploying) per maggiori dettagli.

## Licenza

[Specifica la licenza del progetto]
