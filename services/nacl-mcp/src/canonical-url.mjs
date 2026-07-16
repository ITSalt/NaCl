export function canonicalIssuer(value, label = "issuer") {
  const issuer = new URL(value);
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.hash || issuer.search) {
    throw new TypeError(`${label} must be a query-free HTTPS URL.`);
  }
  return issuer.href;
}
