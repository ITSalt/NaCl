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
unique_subject    = no
copy_extensions   = copy
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
  # allow re-issuing a cert for the same CN (server/client re-provision); openssl reads this
  # attr file and it overrides the cnf, so pin it explicitly.
  printf 'unique_subject = no\n' > "$CA_DIR/index.txt.attr"
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
  # idempotent: if a still-valid cert for this CN already exists, keep it (openssl ca refuses to
  # sign a duplicate CN, which would break re-runs of provision-vps.sh).
  # modern TLS clients (Go >=1.17) ignore CN entirely — the cert MUST carry a subjectAltName.
  # Detect IP vs DNS so a bare-IP host still gets a usable SAN.
  local san
  case "$host" in
    *[!0-9.]*) san="DNS:$host" ;;   # has a non-(digit/dot) char → hostname
    *)         san="IP:$host"  ;;   # all digits and dots → IPv4 literal
  esac
  if [ -f "$out/server.crt" ] && [ -f "$out/server.key" ] \
     && openssl x509 -in "$out/server.crt" -noout -checkend 0 >/dev/null 2>&1 \
     && openssl x509 -in "$out/server.crt" -noout -ext subjectAltName 2>/dev/null | grep -qF "$host" \
     && [ "$(openssl x509 -in "$out/server.crt" -noout -modulus 2>/dev/null)" = "$(openssl rsa -in "$out/server.key" -noout -modulus 2>/dev/null)" ]; then
    cp "$CA_DIR/ca.crt" "$out/ca.crt"
    _ca_log "server cert for $host already valid (SAN + key match) → keeping existing $out/server.crt"
    return 0
  fi
  openssl genrsa -out "$out/server.key" 2048
  chmod 600 "$out/server.key"
  openssl req -new -key "$out/server.key" -subj "/CN=$host" -addext "subjectAltName=$san" -out "$CA_DIR/server.csr"
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
  # idempotent: keep an existing still-valid cert for this CN (openssl ca refuses duplicate CNs).
  if [ -f "$out/client.crt" ] && [ -f "$out/client.key" ] \
     && openssl x509 -in "$out/client.crt" -noout -checkend 0 >/dev/null 2>&1 \
     && openssl x509 -in "$out/client.crt" -noout -subject 2>/dev/null | grep -qE "CN *= *${dev}([^A-Za-z0-9.@-]|$)" \
     && [ "$(openssl x509 -in "$out/client.crt" -noout -modulus 2>/dev/null)" = "$(openssl rsa -in "$out/client.key" -noout -modulus 2>/dev/null)" ]; then
    cp "$CA_DIR/ca.crt" "$out/ca.crt"
    _ca_log "client cert for '$dev' already valid (key matches) → keeping existing $out/client.crt"
    return 0
  fi
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

# render_gateway_allowlist <graph_dir>
# ghostunnel (>=1.x) has no CRL flag — access control is an explicit CN allow-list. This rewrites
# the `--allow-cn` lines between the managed markers in <graph_dir>/docker-compose.yml from the
# one-CN-per-line file <graph_dir>/allowed-cns. Empty list ⇒ `--allow-cn=__none__` (rejects all).
render_gateway_allowlist() {
  local gdir="$1"
  local compose="$gdir/docker-compose.yml"
  local allow="$gdir/allowed-cns"
  local start_marker='# >>> NACL allow-cn (managed)'
  local end_marker='# <<< NACL allow-cn (managed)'
  local start_count end_count start_line end_line work frag rendered candidate actual
  if [ ! -f "$compose" ]; then
    _ca_log "ERROR: no compose at $compose"
    return 1
  fi
  start_count=$(awk -v marker="$start_marker" '
    { rest=$0; while ((position=index(rest, marker)) > 0) { count++; rest=substr(rest, position + length(marker)); } }
    END { print count + 0 }
  ' "$compose")
  end_count=$(awk -v marker="$end_marker" '
    { rest=$0; while ((position=index(rest, marker)) > 0) { count++; rest=substr(rest, position + length(marker)); } }
    END { print count + 0 }
  ' "$compose")
  if [ "$start_count" -ne 1 ] || [ "$end_count" -ne 1 ]; then
    _ca_log "ERROR: compose must contain exactly one managed allow-cn marker pair: $compose"
    return 1
  fi
  start_line=$(grep -F -n -- "$start_marker" "$compose" | cut -d: -f1)
  end_line=$(grep -F -n -- "$end_marker" "$compose" | cut -d: -f1)
  if [ "$start_line" -ge "$end_line" ]; then
    _ca_log "ERROR: managed allow-cn markers are misordered: $compose"
    return 1
  fi
  work=$(mktemp -d "$gdir/.allow-cn.render.XXXXXX") || {
    _ca_log "ERROR: cannot allocate allow-cn render workspace in $gdir"
    return 1
  }
  frag="$work/expected"
  rendered="$work/rendered"
  candidate="$work/docker-compose.yml"
  actual="$work/actual"
  : > "$frag"
  if [ -s "$allow" ]; then
    while IFS= read -r cn; do
      [ -n "$cn" ] || continue
      printf '      - "--allow-cn=%s"\n' "$cn" >> "$frag"
    done < "$allow"
  else
    printf '      - "--allow-cn=__none__"\n' >> "$frag"
  fi
  awk -v fragfile="$frag" '
    BEGIN { frag=""; while ((getline line < fragfile) > 0) frag = frag line "\n" }
    /# >>> NACL allow-cn \(managed\)/ { print; printf "%s", frag; inblock=1; next }
    /# <<< NACL allow-cn \(managed\)/ { inblock=0; print; next }
    !inblock { print }
  ' "$compose" > "$rendered" || {
    rm -rf "$work"
    _ca_log "ERROR: failed to render managed allow-cn block in $compose"
    return 1
  }
  if ! cp -p "$compose" "$candidate" || ! cat "$rendered" > "$candidate"; then
    rm -rf "$work"
    _ca_log "ERROR: failed to preserve compose metadata for managed allow-cn projection in $compose"
    return 1
  fi
  awk '
    /# >>> NACL allow-cn \(managed\)/ { inblock=1; next }
    /# <<< NACL allow-cn \(managed\)/ { inblock=0; next }
    inblock { print }
  ' "$candidate" > "$actual" || {
    rm -rf "$work"
    _ca_log "ERROR: failed to read back managed allow-cn block in $compose"
    return 1
  }
  if ! cmp -s "$frag" "$actual"; then
    rm -rf "$work"
    _ca_log "ERROR: managed allow-cn projection read-back mismatch in $compose"
    return 1
  fi
  if ! mv "$candidate" "$compose"; then
    rm -rf "$work"
    _ca_log "ERROR: failed to commit managed allow-cn projection in $compose"
    return 1
  fi
  rm -rf "$work"
  _ca_log "rendered $( [ -s "$allow" ] && wc -l < "$allow" || echo 0 ) allowed CN(s) into $compose"
}
