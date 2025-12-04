const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const certDir = path.join(__dirname, 'certificates');

// Crea la directory se non esiste
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

// Ottieni l'IP di rete locale dalla variabile d'ambiente (opzionale)
const networkIP = process.env.NETWORK_IP;

// Costruisci la lista di domini/IP per i certificati
const domains = ['localhost', '127.0.0.1', '::1'];
if (networkIP) {
  domains.push(networkIP);
}

console.log('Generazione certificati SSL con mkcert...\n');
if (networkIP) {
  console.log(`Incluso IP di rete: ${networkIP}\n`);
} else {
  console.log('Nota: Per includere un IP di rete, imposta la variabile NETWORK_IP\n');
}

try {
  // Verifica che mkcert sia installato
  execSync('mkcert -version', { stdio: 'ignore' });
  
  // Genera i certificati con mkcert
  execSync(
    `mkcert -key-file ${path.join(certDir, 'localhost-key.pem')} -cert-file ${path.join(certDir, 'localhost.pem')} ${domains.join(' ')}`,
    { stdio: 'inherit' }
  );
  
  console.log('\n✅ Certificati generati con successo usando mkcert!');
  console.log(`   - Certificato: ${path.join(certDir, 'localhost.pem')}`);
  console.log(`   - Chiave: ${path.join(certDir, 'localhost-key.pem')}\n`);
  console.log('✅ Questi certificati sono validi per:');
  domains.forEach(domain => {
    console.log(`   - ${domain}`);
  });
  console.log('\n✅ Non genereranno avvisi nel browser (se mkcert -install è stato eseguito).\n');
} catch (error) {
  if (error.message.includes('mkcert')) {
    console.error('❌ mkcert non trovato. Installalo prima:');
    console.log('   macOS: brew install mkcert');
    console.log('   Linux: vedi https://github.com/FiloSottile/mkcert#installation');
    console.log('   Windows: choco install mkcert\n');
    console.log('   Dopo l\'installazione, esegui: mkcert -install\n');
  } else {
    console.error('❌ Errore nella generazione dei certificati:', error.message);
  }
  process.exit(1);
}
