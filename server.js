const { createServer: createHttpsServer } = require('https');
const { createServer: createHttpServer } = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Ascolta su tutte le interfacce di rete
const port = parseInt(process.env.PORT || '3000', 10);
const httpsPort = parseInt(process.env.HTTPS_PORT || String(port + 1), 10);

// Funzione per ottenere l'IP di rete locale
function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignora loopback e indirizzi IPv6 non link-local
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Funzione per rigenerare i certificati con l'IP corrente
function regenerateCertificates(networkIP) {
  const certDir = path.join(__dirname, 'certificates');
  const certFile = path.join(certDir, 'localhost.pem');
  const keyFile = path.join(certDir, 'localhost-key.pem');
  const ipStateFile = path.join(certDir, '.last-ip');

  // Crea la directory se non esiste
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  // Leggi l'IP usato l'ultima volta
  let lastIP = null;
  if (fs.existsSync(ipStateFile)) {
    try {
      lastIP = fs.readFileSync(ipStateFile, 'utf8').trim();
    } catch (err) {
      // Ignora errori di lettura
    }
  }

  // Verifica se i certificati esistono e se l'IP è cambiato
  const certsExist = fs.existsSync(certFile) && fs.existsSync(keyFile);
  const ipChanged = lastIP !== networkIP;

  if (!certsExist || ipChanged) {
    console.log('🔄 Rigenerazione certificati SSL...');
    if (ipChanged && lastIP) {
      console.log(`   IP cambiato: ${lastIP} → ${networkIP}`);
    }

    try {
      // Verifica che mkcert sia installato
      execSync('mkcert -version', { stdio: 'ignore' });

      // Genera i certificati con mkcert
      execSync(
        `mkcert -key-file ${keyFile} -cert-file ${certFile} localhost 127.0.0.1 ::1 ${networkIP}`,
        { stdio: 'inherit' }
      );

      // Salva l'IP corrente
      fs.writeFileSync(ipStateFile, networkIP, 'utf8');

      console.log('✅ Certificati rigenerati con successo!');
      console.log(`   Validi per: localhost, 127.0.0.1, ::1, ${networkIP}\n`);
    } catch (error) {
      if (error.message.includes('mkcert') || error.code === 'ENOENT') {
        console.warn('⚠️  mkcert non trovato. I certificati esistenti verranno usati.');
        console.warn('   Per rigenerare i certificati, installa mkcert e riavvia il server.\n');
      } else {
        console.error('❌ Errore nella rigenerazione dei certificati:', error.message);
        if (!certsExist) {
          throw new Error('Impossibile generare certificati e nessun certificato esistente trovato.');
        }
        console.warn('   Verranno usati i certificati esistenti.\n');
      }
    }
  }
}

const networkIP = getLocalNetworkIP();

// Rigenera i certificati se necessario
regenerateCertificates(networkIP);

// Configura Next.js - funziona sia in dev che in produzione
const app = next({ 
  dev,
  // Non passare hostname a next() quando si usa un server personalizzato
  // Next.js gestirà le richieste tramite il nostro server
});
const handle = app.getRequestHandler();

// Percorsi dei certificati
const certDir = path.join(__dirname, 'certificates');
const certFile = path.join(certDir, 'localhost.pem');
const keyFile = path.join(certDir, 'localhost-key.pem');

// Verifica che i certificati esistano
if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
  console.error('❌ Certificati SSL non trovati!');
  console.error(`   Certificati richiesti: ${certFile} e ${keyFile}`);
  console.error('   Esegui: npm run generate-cert:mkcert');
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(keyFile),
  cert: fs.readFileSync(certFile),
};

app.prepare().then(() => {
  // Server HTTP sulla porta configurata
  const httpServer = createHttpServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });
  
  httpServer.on('error', (err) => {
    console.error('HTTP Server error:', err);
  });
  
  httpServer.listen(port, hostname, () => {
    console.log(`> HTTP ready on http://localhost:${port}`);
    console.log(`> HTTP Network: http://${networkIP}:${port}`);
    console.log(`> Server listening on all network interfaces (0.0.0.0:${port})`);
  });

  // Server HTTPS sulla porta HTTPS
  const httpsServer = createHttpsServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });
  
  httpsServer.on('error', (err) => {
    console.error('HTTPS Server error:', err);
  });
  
  httpsServer.listen(httpsPort, hostname, () => {
    console.log(`> HTTPS ready on https://localhost:${httpsPort}`);
    console.log(`> HTTPS Network: https://${networkIP}:${httpsPort}`);
    console.log(`> Server listening on all network interfaces (0.0.0.0:${httpsPort})`);
    if (dev) {
      console.log(`> Running in development mode`);
    } else {
      console.log(`> Running in production mode`);
    }
  });
});
