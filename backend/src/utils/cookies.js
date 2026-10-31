/** Minimal Cookie header parser (no dependency): returns a name → value map. */
export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name || name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // Malformed encoding: ignore this cookie rather than fail the request.
    }
  }
  return cookies;
}
