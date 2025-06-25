/**
 * Decodifica un JWT senza librerie esterne e restituisce il payload come T.
 */
export function parseJwt<T = Record<string, unknown>>(token: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token JWT non valido');
  }

  let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  switch (payload.length % 4) {
    case 2: payload += '=='; break;
    case 3: payload += '='; break;
  }

  const decoded = atob(payload);
  const json = decodeURIComponent(
    decoded
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );

  return JSON.parse(json) as T;
}