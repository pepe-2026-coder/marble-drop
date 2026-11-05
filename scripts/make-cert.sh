#!/usr/bin/env bash
# Generate the self-signed certificate used for headset (WebXR) testing.
# The output lives in scripts/certs/ and is git-ignored.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p scripts/certs

IP="${1:-}"
if [ -z "$IP" ]; then
  for iface in en0 en1 en2; do
    IP="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -n "$IP" ] && break
  done
fi

SAN="DNS:localhost,DNS:marble-drop.local,IP:127.0.0.1"
[ -n "$IP" ] && SAN="$SAN,IP:$IP"

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout scripts/certs/local-key.pem \
  -out scripts/certs/local-cert.pem \
  -subj "/CN=marble-drop.local" \
  -addext "subjectAltName=$SAN"

echo "certificate written for: $SAN"
