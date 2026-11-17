/* Odczyt sesji albo błędu z części adresu po "#" (linki z e-maili Supabase). */

export interface LinkSession {
  access_token: string;
  refresh_token: string;
  type: string;
}

export function parseAuthHash(hash: string): { session: LinkSession | null; error: string | null } {
  const raw = hash.replace(/^#\/?/, "");
  if (!/(^|&)(access_token|error_description|error_code)=/.test(raw)) return { session: null, error: null };
  const p = new URLSearchParams(raw);
  const error = p.get("error_description") ?? p.get("error_code");
  if (error) return { session: null, error };
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  if (!access_token || !refresh_token) return { session: null, error: null };
  return { session: { access_token, refresh_token, type: p.get("type") ?? "" }, error: null };
}
