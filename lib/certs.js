const fs   = require('fs');
const path = require('path');

const certsDir = path.join(__dirname, '..', 'certs');
const certFile = path.join(certsDir, 'cert.pem');
const keyFile  = path.join(certsDir, 'key.pem');

function getCerts() {
  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
    throw new Error(
      'TLS certificate not found. Run this once to generate it:\n' +
      '  cd certs && openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "//CN=localhost"'
    );
  }
  return {
    cert: fs.readFileSync(certFile),
    key:  fs.readFileSync(keyFile),
  };
}

module.exports = { getCerts, certFile };
