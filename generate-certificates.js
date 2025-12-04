const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certificates');

// Crea la directory se non esiste
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

console.log('Generazione certificati SSL autofirmati...\n');

try {
  // Genera la chiave privata
  execSync(
    `openssl req -x509 -out ${path.join(certDir, 'localhost.pem')} -keyout ${path.join(certDir, 'localhost-key.pem')} -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -extensions EXT -config <(printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")`,
    { stdio: 'inherit' }
  );
  
  console.log('\n✅ Certificati generati con successo!');
  console.log(`   - Certificato: ${path.join(certDir, 'localhost.pem')}`);
  console.log(`   - Chiave: ${path.join(certDir, 'localhost-key.pem')}\n`);
  console.log('⚠️  Nota: I certificati autofirmati genereranno un avviso di sicurezza nel browser.');
  console.log('   Per certificati validi senza avvisi, considera di usare mkcert.\n');
} catch (error) {
  console.error('❌ Errore nella generazione dei certificati:', error.message);
  console.log('\n💡 Alternativa: installa mkcert e usa lo script generate-certificates-mkcert.js\n');
  process.exit(1);
}
