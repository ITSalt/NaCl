#!/usr/bin/env bash
# lib-ca.sh — minimal private Certificate Authority for the shared-graph mTLS gateway.
#
# One private CA signs BOTH the gateway server certificate and every developer's client
# certificate. Clients (ghostunnel sidecars) trust this CA via --cacert, so no public/Let's
# Encrypt cert is needed for mTLS to work. Revocation is a CRL the gateway loads. Sourced by
# provision-vps.sh, issue-client-cert.sh, revoke-client-cert.sh.
#
# CA_DIR defaults to <repo>/graph-infra/vps/ca but is normally pointed at a persistent path on
# the VPS (e.g. /etc/nacl-graph/ca). The CA private key never leaves the VPS / admin machine.
set -euo pipefail

: "${CA_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ca}"
CA_DAYS="${CA_DAYS:-3650}"
CERT_DAYS="${CERT_DAYS:-825}"

_ca_log() { echo "[ca] $*" >&2; }
_ca_die() { echo "[ca] ERROR: $*" >&2; exit 1; }

require_openssl() { command -v openssl >/dev/null 2>&1 || _ca_die "openssl not found"; }

_ca_cnf() {
  cat > "$CA_DIR/openssl.cnf" <<EOF
[ ca ]
default_ca = CA_default
[ CA_default ]
dir               = $CA_DIR
database          = \$dir/index.txt
new_certs_dir     = \$dir/newcerts
certificate       = \$dir/ca.crt
private_key       = \$dir/ca.key
serial            = \$dir/serial
crlnumber         = \$dir/crlnumber
crl               = \$dir/crl.pem
default_md        = sha256
default_days      = $CERT_DAYS
default_crl_days  = 30
policy            = policy_anything
x509_extensions   = usr_cert
[ policy_anything ]
commonName        = supplied
[ usr_cert ]
basicConstraints  = CA:FALSE
keyUsage          = digitalSignature, keyEncipherment
[ server_cert ]
basicConstraints  = CA:FALSE
keyUsage          = digitalSignature, keyEncipherment
extendedKeyUsage  = serverAuth
[ client_cert ]
basicConstraints  = CA:FALSE
keyUsage          = digitalSignature
extendedKeyUsage  = clientAuth
EOF
}

# Create the CA on first run; idempotent thereafter.
ensure_ca() {
  require_openssl
  mkdir -p "$CA_DIR/newcerts"
  chmod 700 "$CA_DIR" 2>/dev/null || true
  [ -f "$CA_DIR/index.txt" ] || : > "$CA_DIR/index.txt"
  [ -f "$CA_DIR/serial" ]    || echo 1000 > "$CA_DIR/serial"
  [ -f "$CA_DIR/crlnumber" ] || echo 1000 > "$CA_DIR/crlnumber"
  _ca_cnf

  if [ ! -f "$CA_DIR/ca.crt" ]; then
    _ca_log "generating private CA in $CA_DIR"
    openssl genrsa -out "$CA_DIR/ca.key" 4096
    chmod 600 "$CA_DIR/ca.key"
    openssl req -x509 -new -nodes -key "$CA_DIR/ca.key" -sha256 -days "$CA_DAYS" \
      -subj "/CN=NaCl Graph Root CA" -out "$CA_DIR/ca.crt"
    gen_crl
  fi
}

# issue_server_cert <hostname> <out_dir>
issue_server_cert() {
  local host="$1" out="$2"
  mkdir -p "$out"
  openssl genrsa -out "$out/server.key" 2048
  chmod 600 "$out/server.key"
  openssl req -new -key "$out/server.key" -subj "/CN=$host" -out "$CA_DIR/server.csr"
  openssl ca -batch -config "$CA_DIR/openssl.cnf" -extensions server_cert \
    -in "$CA_DIR/server.csr" -out "$out/server.crt"
  cp "$CA_DIR/ca.crt" "$out/ca.crt"
  rm -f "$CA_DIR/server.csr"
  _ca_log "server cert issued for $host → $out/server.crt"
}

# issue_client_cert <developer-id> <out_dir>
issue_client_cert() {
  local dev="$1" out="$2"
  mkdir -p "$out"
  openssl genrsa -out "$out/client.key" 2048
  chmod 600 "$out/client.key"
  openssl req -new -key "$out/client.key" -subj "/CN=$dev" -out "$CA_DIR/client.csr"
  openssl ca -batch -config "$CA_DIR/openssl.cnf" -extensions client_cert \
    -in "$CA_DIR/client.csr" -out "$out/client.crt"
  cp "$CA_DIR/ca.crt" "$out/ca.crt"
  rm -f "$CA_DIR/client.csr"
  _ca_log "client cert issued for '$dev' → $out/client.crt"
}

# revoke_cert <path-to-cert>
revoke_cert() {
  local cert="$1"
  [ -f "$cert" ] || _ca_die "cert not found: $cert"
  openssl ca -batch -config "$CA_DIR/openssl.cnf" -revoke "$cert"
  gen_crl
  _ca_log "revoked $cert and regenerated CRL"
}

gen_crl() {
  openssl ca -batch -config "$CA_DIR/openssl.cnf" -gencrl -out "$CA_DIR/crl.pem"
  _ca_log "CRL written: $CA_DIR/crl.pem"
}
